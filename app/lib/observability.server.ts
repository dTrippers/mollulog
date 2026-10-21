import * as Sentry from "@sentry/cloudflare";
import { sanitizeErrorForLogging, sanitizeLogContext, serializeErrorForLogging } from "~/lib/privacy-scrub";

type ObservabilityEnv = Env & {
  SERVER_SENTRY_DSN?: string;
};

type LogContext = Record<string, unknown>;

type LogLevel = "debug" | "info" | "warn" | "error";

type ConsoleMethod = "debug" | "info" | "warn" | "error";

const service = "mollulog";
function writeConsole(level: ConsoleMethod, message: string, context: LogContext) {
  if (Object.keys(context).length === 0) {
    console[level](message);
    return;
  }

  console[level](message, context);
}

function captureSentryError(error: unknown, context: LogContext) {
  const safeError = sanitizeErrorForLogging(error);
  const safeContext = sanitizeLogContext(context);
  if (safeError instanceof Error) {
    Sentry.withScope((scope) => {
      scope.setExtras(safeContext);
      Sentry.captureException(safeError);
    });
    return;
  }

  Sentry.withScope((scope) => {
    scope.setExtras(safeContext);
    Sentry.captureMessage(typeof safeError === "string" ? safeError : "Non-Error exception captured", "error");
  });
}

const ALLOWED_REQUEST_HEADERS = new Set(["accept", "content-type", "user-agent"]);

export function scrubServerSentryBreadcrumb<T extends { category?: string; data?: Record<string, unknown>; message?: string }>(
  breadcrumb: T,
): T | null {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.category !== "fetch" && breadcrumb.category !== "http") return breadcrumb;

  const safeData: Record<string, unknown> = {};
  if (typeof breadcrumb.data?.method === "string") safeData.method = breadcrumb.data.method;
  if (typeof breadcrumb.data?.status === "number" || typeof breadcrumb.data?.status === "string") {
    safeData.status = breadcrumb.data.status;
  } else if (typeof breadcrumb.data?.status_code === "number") {
    safeData.status = breadcrumb.data.status_code;
  }
  breadcrumb.data = safeData as T["data"];
  delete breadcrumb.message;
  return breadcrumb;
}

/** Removes request details and user supplied context before an event leaves the worker. */
export function scrubServerSentryEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    const request = event.request;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())),
      );
    }
    delete request.url;
    delete request.query_string;
    delete request.data;
    delete request.cookies;
    delete request.env;
  }

  delete event.user;
  if (event.contexts) {
    delete event.contexts.user;
    event.contexts = sanitizeLogContext(event.contexts) as typeof event.contexts;
  }
  if (event.extra) {
    event.extra = sanitizeLogContext(event.extra) as typeof event.extra;
  }
  if (event.tags) {
    event.tags = sanitizeLogContext(event.tags) as typeof event.tags;
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value?.startsWith("Failed query:") && /\nparams:\s*/i.test(exception.value)) {
      exception.value = exception.value.replace(/\nparams:\s*[\s\S]*$/i, "");
    }
  }
  return event;
}

/**
 * Tracing stays disabled by leaving `tracesSampleRate` unset: any rate, even 0, lets a caller's sampled
 * `sentry-trace` header start a transaction. The request body is never read, so the SDK cannot consume a body
 * before the handler enforces its size limit, authentication and rate limits.
 */
export function createServerSentryOptions(env: ObservabilityEnv): Sentry.CloudflareOptions {
  return {
    dsn: env.SERVER_SENTRY_DSN,
    enabled: Boolean(env.SERVER_SENTRY_DSN),
    environment: env.STAGE ?? "local",
    sendDefaultPii: false,
    integrations: [Sentry.httpServerIntegration({ maxRequestBodySize: "none" })],
    beforeSend: scrubServerSentryEvent,
    beforeSendTransaction: scrubServerSentryEvent,
    beforeBreadcrumb: scrubServerSentryBreadcrumb,
  };
}

export function captureServerError(error: unknown, context: LogContext = {}) {
  captureSentryError(error, context);
}

export function getLogger(env: ObservabilityEnv, _ctx?: ExecutionContext, defaults: LogContext = {}) {
  const baseContext = sanitizeLogContext({
    service,
    stage: env.STAGE ?? "local",
    ...defaults,
  });

  function emit(level: LogLevel, message: string, context: LogContext = {}) {
    const payload = sanitizeLogContext({ ...baseContext, ...context });
    const consoleMethod = level === "debug" ? "debug" : level;
    writeConsole(consoleMethod, message, payload);
  }

  return {
    debug(message: string, context: LogContext = {}) {
      emit("debug", message, context);
    },
    info(message: string, context: LogContext = {}) {
      emit("info", message, context);
    },
    warn(message: string, context: LogContext = {}) {
      emit("warn", message, context);
    },
    error(message: string, error?: unknown, context: LogContext = {}) {
      const payload = {
        ...context,
        ...(error === undefined ? {} : { error: serializeErrorForLogging(error) }),
      };

      emit("error", message, payload);
    },
  };
}
