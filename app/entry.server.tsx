import "./lib/dayjs";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { AppLoadContext, EntryContext, HandleErrorFunction } from "react-router";
import { isRouteErrorResponse, ServerRouter } from "react-router";
import { watchIo } from "./lib/io-watchdog";
import { captureServerError, getLogger } from "./lib/observability.server";
import { createRequestDiagnostics } from "./lib/request-diagnostics";
import { canonicalUrl } from "./lib/seo";

const SEO_DEBUG_HEADERS = {
  renderId: "X-Mollulog-Render-Id",
  requestPath: "X-Mollulog-Request-Path",
  routerPath: "X-Mollulog-Router-Path",
  buildId: "X-Mollulog-Build-Id",
} as const;

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
  const body = await watchIo(
    "ssr.render",
    renderToReadableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
      signal: request.signal,
      onError(error: unknown) {
        // Log streaming rendering errors from inside the shell
        logger.error("SSR streaming render failed", error);
        captureServerError(error, {
          handler: "entry.server",
          method: request.method,
          url: request.url,
        });
        statusCode = 500;
      },
    }),
    { method: request.method, path },
  );

  if (isbot(request.headers.get("user-agent"))) {
    await watchIo("ssr.allReady", body.allReady, { method: request.method, path });
  }

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set(SEO_DEBUG_HEADERS.renderId, requestDiagnostics.renderId);
  responseHeaders.set(SEO_DEBUG_HEADERS.requestPath, requestDiagnostics.requestPath);
  responseHeaders.set(SEO_DEBUG_HEADERS.routerPath, routerPath);
  responseHeaders.set(SEO_DEBUG_HEADERS.buildId, requestDiagnostics.buildId);

  if (isbot(request.headers.get("user-agent"))) {
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
      cacheControl: responseHeaders.get("Cache-Control"),
      vary: responseHeaders.get("Vary"),
    };

    if (requestDiagnostics.requestPath !== routerPath) {
      logger.error("[seo-debug] render_invariant_failed", undefined, context);
    } else {
      logger.info("[seo-debug] document_response", context);
    }
  }

  return new Response(body, {
    headers: responseHeaders,
    status: statusCode,
  });
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
