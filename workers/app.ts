import * as Sentry from "@sentry/cloudflare";
import { createRequestHandler } from "react-router";
import * as serverBuild from "virtual:react-router/server-build";
import {
  applySessionValidationResponse,
  validateSessionRequest,
} from "~/auth/session-validation.server";
import { watchIo } from "~/lib/io-watchdog";
import { createRequestDiagnostics, type RequestDiagnostics } from "~/lib/request-diagnostics";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { markOcrTaskDeadLetter } from "~/models/ocr-job";

export { CacheRefreshWorkflow } from "./cache-refresh-workflow";

type ObservabilityEnv = Env & {
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
  SERVER_SENTRY_DSN?: string;
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
    const requestDiagnostics = createRequestDiagnostics(request, serverBuild.assets.version);
    const sessionValidation = await validateSessionRequest(env, request, ctx);
    if (sessionValidation.kind === "response") {
      return sessionValidation.response;
    }

    const response = await watchIo(
      "request",
      requestHandler(request, {
        cloudflare: { env, ctx, colo: request.cf?.colo, requestDiagnostics },
      }),
      { method: request.method, path: new URL(request.url).pathname },
      RUNTIME_TIMEOUTS.watchdogWarnMs.request,
    );
    return applySessionValidationResponse(response, sessionValidation);
  },
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        await markOcrTaskDeadLetter(env, message.body, { ctx });
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
    dsn: env.SERVER_SENTRY_DSN,
    enabled: Boolean(env.SERVER_SENTRY_DSN),
    environment: env.STAGE ?? "local",
    tracesSampleRate: 0,
  }),
  handler,
);
