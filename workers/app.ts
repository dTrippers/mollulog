import * as Sentry from "@sentry/cloudflare";
import { createRequestHandler } from "react-router";
import * as serverBuild from "virtual:react-router/server-build";
import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";
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

const requestHandler = createRequestHandler(serverBuild, import.meta.env.MODE);

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
        RUNTIME_TIMEOUTS.watchdogWarnMs.request,
      ),
    );
  },
  scheduled(controller, env, ctx) {
    const appEnv: ObservabilityEnv = { ...env, DB: withD1Timeout(env.DB) };
    const scheduledContext = {
      eventType: "scheduled",
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
    };

    ctx.waitUntil(
      watchIo(
        "scheduled.run",
        withTimeout(
          runScheduledJobs(appEnv, ctx, {
            cron: controller.cron,
            scheduledTime: controller.scheduledTime,
          }),
          RUNTIME_TIMEOUTS.scheduled.run,
          "scheduled.run",
        ),
        scheduledContext,
        RUNTIME_TIMEOUTS.watchdogWarnMs.scheduled,
      ).catch((error) => {
        if (isTimeoutError(error)) {
          console.error(
            "[io-watchdog] timeout",
            getIoWatchdogContext({
              label: "scheduled.run",
              timeoutMs: RUNTIME_TIMEOUTS.scheduled.run,
              ...scheduledContext,
            }),
          );
          return;
        }

        console.error(
          "[io-watchdog] failed",
          getIoWatchdogContext({
            label: "scheduled.run",
            errorName: error instanceof Error ? error.name : undefined,
            errorMessage: error instanceof Error ? error.message : String(error),
            ...scheduledContext,
          }),
        );
      }),
    );
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
