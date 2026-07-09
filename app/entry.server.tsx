import "./lib/dayjs";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { AppLoadContext, EntryContext, HandleErrorFunction } from "react-router";
import { isRouteErrorResponse, ServerRouter } from "react-router";
import { watchIo } from "./lib/io-watchdog";
import { captureServerError, getLogger } from "./lib/observability.server";

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
