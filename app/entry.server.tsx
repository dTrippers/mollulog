import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { getLogger } from "./lib/observability.server";

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
  const body = await renderToReadableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
    signal: request.signal,
    onError(error: unknown) {
      // Log streaming rendering errors from inside the shell
      logger.error("SSR streaming render failed", error);
      statusCode = 500;
    },
  });

  if (isbot(request.headers.get("user-agent"))) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: statusCode,
  });
}
