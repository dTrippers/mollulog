import * as Sentry from "@sentry/cloudflare";
import { createRequestHandler } from "react-router";

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
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
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
