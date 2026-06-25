import * as Sentry from "@sentry/cloudflare";
import { createRequestHandler } from "react-router";
import { watchIo } from "~/lib/io-watchdog";
import { runScheduledJobs } from "~/jobs/scheduled";
import { withD1Timeout } from "./d1-timeout";
import { handleEdgeCachedDocumentRequest } from "./edge-cache";

type ObservabilityEnv = Env & {
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
  SERVER_BETTER_STACK_SENTRY_DSN?: string;
};

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: ObservabilityEnv;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

const handler: ExportedHandler<ObservabilityEnv> = {
  async fetch(request, env, ctx) {
    const appEnv: ObservabilityEnv = { ...env, DB: withD1Timeout(env.DB) };
    return handleEdgeCachedDocumentRequest(request, ctx, () =>
      watchIo(
        "request",
        requestHandler(request, {
          cloudflare: { env: appEnv, ctx },
        }),
        { method: request.method, path: new URL(request.url).pathname },
        5000,
      ),
    );
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledJobs(env, ctx));
  },
};

export default Sentry.withSentry<ObservabilityEnv>(
  (env) => ({
    dsn: env.SERVER_BETTER_STACK_SENTRY_DSN,
    enabled: Boolean(env.SERVER_BETTER_STACK_SENTRY_DSN),
    environment: env.STAGE ?? "local",
    tracesSampleRate: 0.05,
  }),
  handler,
);
