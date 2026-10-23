import { Logtail } from "@logtail/edge";
import * as Sentry from "@sentry/cloudflare";

type ObservabilityEnv = Env & {
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
  SERVER_SENTRY_DSN?: string;
};

type LogContext = Record<string, unknown>;

type LogLevel = "debug" | "info" | "warn" | "error";

type ConsoleMethod = "debug" | "info" | "warn" | "error";

const service = "mollulog";
type SerializedError = {
  message?: string;
  name?: string;
  stack?: string;
  cause?: SerializedError | unknown;
  value?: unknown;
};

const logtailClients = new Map<string, Logtail>();

function getLogtail(env: ObservabilityEnv): Logtail | null {
  if (!env.SERVER_BETTER_STACK_SOURCE_TOKEN) {
    return null;
  }

  const existing = logtailClients.get(env.SERVER_BETTER_STACK_SOURCE_TOKEN);
  if (existing) {
    return existing;
  }

  const created = new Logtail(env.SERVER_BETTER_STACK_SOURCE_TOKEN, {
    captureStackContext: true,
  });
  logtailClients.set(env.SERVER_BETTER_STACK_SOURCE_TOKEN, created);
  return created;
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause instanceof Error ? serializeError(error.cause) : error.cause,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return { value: error };
}

function writeConsole(level: ConsoleMethod, message: string, context: LogContext) {
  if (Object.keys(context).length === 0) {
    console[level](message);
    return;
  }

  console[level](message, context);
}

function captureSentryError(error: unknown, context: LogContext) {
  if (error instanceof Error) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
    return;
  }

  Sentry.withScope((scope) => {
    scope.setExtras(context);
    Sentry.captureMessage(typeof error === "string" ? error : "Non-Error exception captured", "error");
  });
}

const SENSITIVE_REQUEST_HEADERS = new Set(["authorization", "proxy-authorization", "cookie"]);
const SENSITIVE_OAUTH_PARAMETERS = new Set([
  "code",
  "state",
  "code_verifier",
  "client_secret",
  "access_token",
  "refresh_token",
]);

function scrubOAuthUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const parameter of SENSITIVE_OAUTH_PARAMETERS) url.searchParams.delete(parameter);
    return url.toString();
  } catch {
    return value;
  }
}

function scrubOAuthRequestData(data: unknown): unknown {
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return JSON.stringify(scrubOAuthRequestData(parsed));
      }
    } catch {
      // OAuth form bodies are URL-encoded; retain unrelated string bodies as-is.
    }
    const parameters = new URLSearchParams(data);
    let changed = false;
    for (const parameter of SENSITIVE_OAUTH_PARAMETERS) {
      if (parameters.has(parameter)) {
        parameters.delete(parameter);
        changed = true;
      }
    }
    return changed ? parameters.toString() : data;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const sanitized = { ...(data as Record<string, unknown>) };
    for (const key of Object.keys(sanitized)) {
      if (SENSITIVE_OAUTH_PARAMETERS.has(key.toLowerCase())) delete sanitized[key];
    }
    return sanitized;
  }
  return data;
}

/** Drops credentials the SDK copies from the incoming request: API keys, session cookies and parsed cookies. */
export function scrubServerSentryEvent<T extends Sentry.Event>(event: T): T {
  const request = event.request;
  if (!request) return event;
  if (request.url) request.url = scrubOAuthUrl(request.url);
  if (request.data !== undefined) request.data = scrubOAuthRequestData(request.data);
  if (request.headers) {
    request.headers = Object.fromEntries(
      Object.entries(request.headers).filter(([name]) => !SENSITIVE_REQUEST_HEADERS.has(name.toLowerCase())),
    );
  }
  delete request.cookies;
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
    integrations: [Sentry.httpServerIntegration({ maxRequestBodySize: "none" })],
    beforeSend: scrubServerSentryEvent,
    beforeSendTransaction: scrubServerSentryEvent,
  };
}

export function captureServerError(error: unknown, context: LogContext = {}) {
  captureSentryError(error, context);
}

export function getLogger(env: ObservabilityEnv, ctx?: ExecutionContext, defaults: LogContext = {}) {
  const logtail = getLogtail(env);
  const edgeLogger = ctx && logtail ? logtail.withExecutionContext(ctx) : logtail;
  const baseContext = {
    service,
    stage: env.STAGE ?? "local",
    ...defaults,
  };

  function emit(level: LogLevel, message: string, context: LogContext = {}) {
    const payload = { ...baseContext, ...context };
    const consoleMethod = level === "debug" ? "debug" : level;
    writeConsole(consoleMethod, message, payload);

    if (!edgeLogger) {
      return;
    }

    void edgeLogger[level](message, payload);
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
        ...(error === undefined ? {} : { error: serializeError(error) }),
      };

      emit("error", message, payload);
    },
  };
}
