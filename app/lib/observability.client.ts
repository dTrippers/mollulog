import * as Sentry from "@sentry/browser";

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
  });

  initialized = true;
}

export function captureClientError(error: unknown, context: Record<string, unknown> = {}) {
  initializeClientObservability();

  Sentry.withScope((scope) => {
    scope.setExtras(context);
    if (typeof context.source === "string") {
      scope.setTag("source", context.source);
    }

    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }

    Sentry.captureMessage(typeof error === "string" ? error : "Non-Error client exception captured", "error");
  });
}
