import * as Sentry from "@sentry/cloudflare";
import { createRequestHandler } from "react-router";
import * as serverBuild from "virtual:react-router/server-build";
import { watchIo } from "~/lib/io-watchdog";
import { createRequestDiagnostics, type RequestDiagnostics } from "~/lib/request-diagnostics";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { markOcrTaskDeadLetter, publishPendingOcrOutbox, reconcileOcrJobs } from "~/models/ocr-job";
import { withD1Timeout } from "./d1-timeout";

export { CacheRefreshWorkflow } from "./cache-refresh-workflow";

type ObservabilityEnv = Env & {
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
  SERVER_BETTER_STACK_SENTRY_DSN?: string;
};

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: ObservabilityEnv;
      ctx: ExecutionContext;
      colo?: string;
      requestDiagnostics?: RequestDiagnostics;
    };
  }
}

const requestHandler = createRequestHandler(serverBuild, import.meta.env.MODE);

const handler: ExportedHandler<ObservabilityEnv> = {
  async fetch(request, env, ctx) {
    const appEnv: ObservabilityEnv = { ...env, DB: withD1Timeout(env.DB) };
    const requestDiagnostics = createRequestDiagnostics(request, serverBuild.assets.version);
    return watchIo(
      "request",
      requestHandler(request, {
        cloudflare: { env: appEnv, ctx, colo: request.cf?.colo, requestDiagnostics },
      }),
      { method: request.method, path: new URL(request.url).pathname },
      RUNTIME_TIMEOUTS.watchdogWarnMs.request,
    );
  },
  async scheduled(_controller, env, ctx) {
    const appEnv: ObservabilityEnv = { ...env, DB: withD1Timeout(env.DB) };
    ctx.waitUntil(
      (async () => {
        await reconcileOcrJobs(appEnv, { ctx });
        await publishPendingOcrOutbox(appEnv, 50, { ctx });
      })(),
    );
  },
  async queue(batch, env, ctx) {
    const appEnv: ObservabilityEnv = { ...env, DB: withD1Timeout(env.DB) };
    for (const message of batch.messages) {
      try {
        await markOcrTaskDeadLetter(appEnv, message.body, { ctx });
        message.ack();
      } catch (error) {
        console.error("Failed to persist OCR dead letter", error);
        message.retry({ delaySeconds: 60 });
      }
    }
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
