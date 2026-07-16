import * as Sentry from "@sentry/cloudflare";
import { createRequestHandler } from "react-router";
import * as serverBuild from "virtual:react-router/server-build";
import { watchIo } from "~/lib/io-watchdog";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withD1Timeout } from "./d1-timeout";

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
    };
  }
}

const requestHandler = createRequestHandler(serverBuild, import.meta.env.MODE);

const handler: ExportedHandler<ObservabilityEnv> = {
  async fetch(request, env, ctx) {
    const appEnv: ObservabilityEnv = { ...env, DB: withD1Timeout(env.DB) };
    return watchIo(
      "request",
      requestHandler(request, {
        cloudflare: { env: appEnv, ctx, colo: request.cf?.colo },
      }),
      { method: request.method, path: new URL(request.url).pathname },
      RUNTIME_TIMEOUTS.watchdogWarnMs.request,
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
