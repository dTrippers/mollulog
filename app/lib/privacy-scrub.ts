type LogContext = Record<string, unknown>;

const SENSITIVE_CONTEXT_KEYS = new Set([
  "user",
  "userid",
  "senseiid",
  "currentuserid",
  "actorsenseiid",
  "actoruserid",
  "username",
  "email",
  "ip",
  "ipaddress",
  "remoteaddress",
  "forwardedfor",
  "xforwardedfor",
  "xrealip",
  "url",
  "requesturl",
  "currenturl",
  "path",
  "pathname",
  "requestpath",
  "location",
  "referer",
  "referrer",
  "query",
  "search",
  "searchterm",
  "title",
  "content",
  "body",
  "comment",
  "description",
  "bio",
  "intro",
  "text",
  "subject",
  "token",
  "sharetoken",
  "session",
  "sessionid",
  "cookie",
  "authorization",
  "oauthcode",
  "details",
  "datakey",
  "cachekey",
  "expectedcanonical",
  "canonical",
  "params",
  "detail",
  "where",
  "table",
  "column",
  "constraint",
  "schema",
  "hint",
  "internalquery",
  "internalposition",
  "internalwhere",
  "datatype",
]);

function normalizedKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveContextKey(key: string) {
  const normalized = normalizedKey(key);
  return (
    SENSITIVE_CONTEXT_KEYS.has(normalized) ||
    /^(?:current|actor|owner|target)?(?:user|sensei)(?:id|name|email)$/.test(normalized) ||
    /(?:search|query|title|content|body|comment|description|bio|intro|oauthcode|sharetoken|sessiontoken)$/.test(
      normalized,
    )
  );
}

function sanitizeContextValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeContextValue);
  if (typeof value !== "object" || value === null) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isSensitiveContextKey(key)) sanitized[key] = sanitizeContextValue(child);
  }
  return sanitized;
}

export function sanitizeLogContext(context: LogContext): LogContext {
  return sanitizeContextValue(context) as LogContext;
}

function sanitizeDrizzleMessage(error: Error) {
  const isDrizzleQueryError =
    error.name === "DrizzleQueryError" ||
    error.constructor.name === "DrizzleQueryError" ||
    ("params" in error && error.message.startsWith("Failed query:"));
  if (!isDrizzleQueryError || !/\nparams:\s*/i.test(error.message)) return error.message;
  return error.message.replace(/\nparams:\s*[\s\S]*$/i, "");
}

function sanitizeErrorStack(error: Error, safeMessage: string) {
  return error.stack?.replace(error.message, safeMessage);
}

export function sanitizeErrorForLogging(error: unknown, seen = new WeakSet<object>()): unknown {
  if (error instanceof Error) {
    if (seen.has(error)) return new Error("Circular error cause");
    seen.add(error);

    const sanitized = new Error(sanitizeDrizzleMessage(error));
    sanitized.name = error.name === "Error" && error.constructor.name === "DrizzleQueryError" ? "DrizzleQueryError" : error.name;
    sanitized.stack = sanitizeErrorStack(error, sanitizeDrizzleMessage(error));
    if (error.cause !== undefined) {
      Object.defineProperty(sanitized, "cause", {
        configurable: true,
        enumerable: false,
        value: sanitizeErrorForLogging(error.cause, seen),
      });
    }
    return sanitized;
  }
  if (typeof error === "string" || error === null || error === undefined) return error;
  if (typeof error === "object") return sanitizeContextValue(error);
  return error;
}

export function serializeErrorForLogging(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: sanitizeDrizzleMessage(error),
      name: error.name,
      stack: sanitizeErrorStack(error, sanitizeDrizzleMessage(error)),
      ...(error.cause === undefined ? {} : { cause: serializeErrorForLogging(error.cause) }),
    };
  }
  if (typeof error === "string") return { message: error };
  return { value: sanitizeContextValue(error) };
}
