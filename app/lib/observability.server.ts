import { Logtail } from "@logtail/edge";
import * as Sentry from "@sentry/cloudflare";

type ObservabilityEnv = Env & {
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
  SERVER_BETTER_STACK_SENTRY_DSN?: string;
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
