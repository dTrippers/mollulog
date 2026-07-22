import "./lib/dayjs";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { prerender } from "react-dom/static";
import type { AppLoadContext, EntryContext, HandleErrorFunction } from "react-router";
import { isRouteErrorResponse, ServerRouter } from "react-router";
import { watchIo } from "./lib/io-watchdog";
import { captureServerError, getLogger } from "./lib/observability.server";
import { createRequestDiagnostics } from "./lib/request-diagnostics";
import { canonicalUrl } from "./lib/seo";
import {
  isGoogleSearchCrawler,
  materializeReactSuspenseBoundaries,
  requiresSelfCanonical,
  stripExecutableScripts,
  validateSeoDocumentInvariant,
} from "./lib/seo-crawler";

const SEO_DEBUG_HEADERS = {
  renderId: "X-Mollulog-Render-Id",
  requestPath: "X-Mollulog-Request-Path",
  routerPath: "X-Mollulog-Router-Path",
  buildId: "X-Mollulog-Build-Id",
  bodySha256: "X-Mollulog-Body-Sha256",
  seoMode: "X-Mollulog-SEO-Mode",
  invariant: "X-Mollulog-SEO-Invariant",
} as const;

const STATIC_CRAWLER_CSP = "script-src 'none'; object-src 'none'; base-uri 'none'";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  loadContext: AppLoadContext,
) {
  let statusCode = responseStatusCode;
  const logger = getLogger(loadContext.cloudflare.env, loadContext.cloudflare.ctx, {
    handler: "entry.server",
    method: request.method,
    url: request.url,
  });
  const path = new URL(request.url).pathname;
  const requestDiagnostics =
    loadContext.cloudflare.requestDiagnostics ?? createRequestDiagnostics(request, reactRouterContext.manifest.version);
  const routerPath = reactRouterContext.staticHandlerContext.location.pathname;
  const matchedRouteIds = reactRouterContext.staticHandlerContext.matches.map((match) => match.route.id);
  const userAgent = request.headers.get("user-agent");
  const botRequest = isbot(userAgent);
  const googleSearchCrawler = isGoogleSearchCrawler(userAgent);
  const onRenderError = (error: unknown) => {
    logger.error("SSR rendering failed", error);
    captureServerError(error, {
      handler: "entry.server",
      method: request.method,
      url: request.url,
    });
    statusCode = 500;
  };
  const router = <ServerRouter context={reactRouterContext} url={request.url} />;
  let body: ReadableStream<Uint8Array>;
  if (googleSearchCrawler) {
    body = (
      await watchIo("ssr.prerender", prerender(router, { signal: request.signal, onError: onRenderError }), {
        method: request.method,
        path,
      })
    ).prelude;
  } else {
    const streamingBody = await watchIo(
      "ssr.render",
      renderToReadableStream(router, { signal: request.signal, onError: onRenderError }),
      { method: request.method, path },
    );
    if (botRequest) {
      await watchIo("ssr.allReady", streamingBody.allReady, { method: request.method, path });
    }
    body = streamingBody;
  }

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set("Cache-Control", "no-store, no-transform");
  appendVary(responseHeaders, "User-Agent");
  responseHeaders.set(SEO_DEBUG_HEADERS.renderId, requestDiagnostics.renderId);
  responseHeaders.set(SEO_DEBUG_HEADERS.requestPath, requestDiagnostics.requestPath);
  responseHeaders.set(SEO_DEBUG_HEADERS.routerPath, routerPath);
  responseHeaders.set(SEO_DEBUG_HEADERS.buildId, requestDiagnostics.buildId);

  let responseBody: BodyInit = body;
  let bodySha256: string | null = null;
  let invariantFailures: string[] = [];

  if (googleSearchCrawler) {
    const renderedHtml = stripExecutableScripts(materializeReactSuspenseBoundaries(await new Response(body).text()));
    const expectedCanonical = requiresSelfCanonical(requestDiagnostics.requestPath)
      ? canonicalUrl(requestDiagnostics.requestPath)
      : null;
    invariantFailures = validateSeoDocumentInvariant({
      html: renderedHtml,
      statusCode,
      requestPath: requestDiagnostics.requestPath,
      routerPath,
      renderId: requestDiagnostics.renderId,
      buildId: requestDiagnostics.buildId,
      expectedCanonical,
    });

    responseHeaders.set("Content-Security-Policy", STATIC_CRAWLER_CSP);
    responseHeaders.set(SEO_DEBUG_HEADERS.seoMode, "static-ssr");

    if (invariantFailures.length > 0) {
      statusCode = 503;
      responseHeaders.set("Retry-After", "60");
      responseHeaders.set(SEO_DEBUG_HEADERS.invariant, "failed");
      responseBody = createTemporaryUnavailableDocument(requestDiagnostics.renderId);
    } else {
      responseHeaders.set(SEO_DEBUG_HEADERS.invariant, "passed");
      responseBody = renderedHtml;
    }

    const encodedBody = new TextEncoder().encode(responseBody as string);
    bodySha256 = await sha256Hex(responseBody as string);
    responseHeaders.set("Content-Length", String(encodedBody.byteLength));
    responseHeaders.set(SEO_DEBUG_HEADERS.bodySha256, bodySha256);
  }

  if (botRequest) {
    const context = {
      renderId: requestDiagnostics.renderId,
      cloudFrontRequestId: requestDiagnostics.cloudFrontRequestId,
      cloudflareRayId: requestDiagnostics.cloudflareRayId,
      requestPath: requestDiagnostics.requestPath,
      routerPath,
      matchedRouteIds,
      expectedCanonical: canonicalUrl(requestDiagnostics.requestPath),
      buildId: requestDiagnostics.buildId,
      statusCode,
      seoMode: responseHeaders.get(SEO_DEBUG_HEADERS.seoMode),
      invariant: responseHeaders.get(SEO_DEBUG_HEADERS.invariant),
      invariantFailures,
      bodySha256,
      cacheControl: responseHeaders.get("Cache-Control"),
      vary: responseHeaders.get("Vary"),
    };

    if (requestDiagnostics.requestPath !== routerPath || invariantFailures.length > 0) {
      logger.error("[seo-debug] render_invariant_failed", undefined, context);
    } else {
      logger.info("[seo-debug] document_response", context);
    }
  }

  return new Response(responseBody, {
    headers: responseHeaders,
    status: statusCode,
  });
}

function appendVary(headers: Headers, value: string) {
  const values = new Set(
    (headers.get("Vary") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", [...values].join(", "));
}

async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createTemporaryUnavailableDocument(renderId: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="mollulog:render-id" content="${renderId}"><title>일시적으로 페이지를 불러올 수 없습니다</title></head><body><h1>일시적으로 페이지를 불러올 수 없습니다</h1><p>잠시 후 다시 시도해 주세요.</p></body></html>`;
}

/**
 * Replaces React Router's default handler, which `console.error`s every thrown
 * router response — including the 404s that bot scans and stale asset hashes
 * generate constantly. Those are correct 404 responses, not failures, and at
 * error level they drown out real incidents and misfire error-rate alerts.
 */
export const handleError: HandleErrorFunction = (error, { request }) => {
  if (request.signal.aborted) {
    return;
  }

  if (isRouteErrorResponse(error) && error.status < 500) {
    return;
  }

  console.error(error);
  captureServerError(error, {
    handler: "handleError",
    method: request.method,
    url: request.url,
  });
};
