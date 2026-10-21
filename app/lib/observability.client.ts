import * as Sentry from "@sentry/browser";
import { sanitizeErrorForLogging, sanitizeLogContext } from "~/lib/privacy-scrub";
import { getRememberedRoutePattern } from "~/lib/route-pattern";

type PublicObservabilityConfig = {
  stage?: string;
  frontSentryDsn?: string;
};

declare global {
  interface Window {
    ENV?: {
      FRONT_SENTRY_DSN?: string;
      STAGE?: string;
    };
  }
}

let initialized = false;

const ignoredClientErrorMessages: Array<string | RegExp> = [
  /^Script error\.?$/i,
  "AbortError",
  "The operation was aborted",
  "The user aborted a request",
  "A network error occurred",
  "Load failed",
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
  /Unable to preload CSS/i,
  /Hydration failed/i,
  /hydrating/i,
  /hydration/i,
  /Text content does not match server-rendered HTML/i,
  /There was an error while hydrating/i,
  /NetworkError when attempting to fetch resource/i,
  /The network connection was lost/i,
  /cancelled/i,
  /canceled/i,
];

const deniedClientErrorUrls: Array<string | RegExp> = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-web-extension:\/\//i,
  /^webkit-masked-url:\/\//i,
  /extensions\//i,
];

const ALLOWED_REQUEST_HEADERS = new Set(["accept", "content-type", "user-agent"]);

export function scrubClientSentryEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    const request = event.request;
    if (request.url) {
      const routePattern = getRememberedRoutePattern(request.url);
      if (routePattern) {
        request.url = `${window.location.origin}${routePattern}`;
      } else {
        delete request.url;
      }
    }
    if (request.headers) {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        const lowerName = name.toLowerCase();
        if (lowerName === "referer" || lowerName === "referrer") {
          const routePattern = getRememberedRoutePattern(value);
          if (routePattern) headers[name] = `${window.location.origin}${routePattern}`;
        } else if (ALLOWED_REQUEST_HEADERS.has(lowerName)) {
          headers[name] = value;
        }
      }
      request.headers = headers;
    }
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
  if (event.extra) event.extra = sanitizeLogContext(event.extra) as typeof event.extra;
  if (event.tags) event.tags = sanitizeLogContext(event.tags) as typeof event.tags;
  return event;
}

export function scrubClientSentryBreadcrumb<
  T extends { category?: string; data?: Record<string, unknown>; message?: string },
>(breadcrumb: T): T | null {
  if (breadcrumb.category === "console" || breadcrumb.category?.startsWith("ui.") || breadcrumb.message !== undefined) {
    return null;
  }
  if (!breadcrumb.data) return breadcrumb;

  const data = { ...breadcrumb.data };
  let safeRequestUrl: string | undefined;
  if (breadcrumb.category === "navigation") {
    for (const key of ["from", "to"]) {
      const routePattern = getRememberedRoutePattern(typeof data[key] === "string" ? data[key] : undefined);
      if (routePattern) data[key] = routePattern;
      else delete data[key];
    }
  }
  if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
    const routePattern = getRememberedRoutePattern(typeof data.url === "string" ? data.url : undefined);
    if (routePattern) {
      data.url = routePattern;
      safeRequestUrl = routePattern;
    } else {
      delete data.url;
    }
    delete data.body;
    delete data.data;
    delete data.query;
    delete data.query_string;
    delete data.response;
  }
  const safeData = sanitizeLogContext(data);
  if (safeRequestUrl) safeData.url = safeRequestUrl;
  breadcrumb.data = safeData as T["data"];
  return breadcrumb;
}

function getConfig(): PublicObservabilityConfig {
  if (typeof window === "undefined") {
    return {};
  }

  const dsnMeta = document.querySelector('meta[name="mollulog:front-sentry-dsn"]');
  const stageMeta = document.querySelector('meta[name="mollulog:stage"]');

  return {
    stage: stageMeta?.getAttribute("content") ?? window.ENV?.STAGE,
    frontSentryDsn: dsnMeta?.getAttribute("content") ?? window.ENV?.FRONT_SENTRY_DSN,
  };
}

export function initializeClientObservability() {
  if (initialized) {
    return;
  }

  const config = getConfig();
  if (!config.frontSentryDsn) {
    return;
  }

  Sentry.init({
    dsn: config.frontSentryDsn,
    enabled: true,
    environment: config.stage ?? "local",
    sendDefaultPii: false,
    ignoreErrors: ignoredClientErrorMessages,
    denyUrls: deniedClientErrorUrls,
    beforeSend: scrubClientSentryEvent,
    beforeBreadcrumb: scrubClientSentryBreadcrumb,
  });

  initialized = true;
}

export function captureClientError(error: unknown, context: Record<string, unknown> = {}) {
  initializeClientObservability();

  Sentry.withScope((scope) => {
    const safeContext = sanitizeLogContext(context);
    scope.setExtras(safeContext);
    if (typeof safeContext.source === "string") {
      scope.setTag("source", safeContext.source);
    }

    const safeError = sanitizeErrorForLogging(error);
    if (safeError instanceof Error) {
      Sentry.captureException(safeError);
      return;
    }

    Sentry.captureMessage(typeof safeError === "string" ? safeError : "Non-Error client exception captured", "error");
  });
}
