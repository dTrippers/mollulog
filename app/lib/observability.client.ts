// The Sentry SDK is about 30KB gzipped, so it is loaded after the page has loaded instead of with the entry chunk.
// Errors raised before then are queued here and reported once the SDK is ready.
type SentryModule = typeof import("./observability-sentry.client");
type PendingReport = (sentry: SentryModule) => void;

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

const MAX_PENDING_REPORTS = 20;
const IDLE_LOAD_TIMEOUT_MS = 5000;

let initialized = false;
let sentry: SentryModule | null = null;
let sentryLoad: Promise<void> | null = null;
let sentryLoadInFlight = false;
let pendingReports: PendingReport[] = [];

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

function enqueueReport(report: PendingReport) {
  if (pendingReports.length < MAX_PENDING_REPORTS) {
    pendingReports.push(report);
  }
}

function handleEarlyError(event: ErrorEvent) {
  const error = event.error ?? event.message;
  enqueueReport((module) => module.captureEarlyGlobalError(error, "onerror"));
}

function handleEarlyRejection(event: PromiseRejectionEvent) {
  const reason = event.reason;
  enqueueReport((module) => module.captureEarlyGlobalError(reason, "onunhandledrejection"));
}

function removeEarlyErrorListeners() {
  window.removeEventListener("error", handleEarlyError);
  window.removeEventListener("unhandledrejection", handleEarlyRejection);
}

function loadSentry(dsn: string, stage: string | undefined) {
  if (!sentryLoad) {
    sentryLoadInFlight = true;
    sentryLoad = import("./observability-sentry.client")
      .then((module) => {
        module.initializeSentry({ dsn, stage });
        sentry = module;
        removeEarlyErrorListeners();
        const reports = pendingReports;
        pendingReports = [];
        for (const report of reports) {
          report(module);
        }
      })
      .catch(() => {
        // Error reporting is best effort: on a failed chunk load the queued reports are dropped.
        removeEarlyErrorListeners();
        pendingReports = [];
      })
      .finally(() => {
        sentryLoadInFlight = false;
      });
  }
  return sentryLoad;
}

// The entry's stale-chunk reload must not fire because this background import failed on a flaky connection.
export function isObservabilityChunkLoading() {
  return sentryLoadInFlight;
}

export function initializeClientObservability() {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;

  const config = getConfig();
  const dsn = config.frontSentryDsn;
  if (!dsn) {
    return;
  }

  window.addEventListener("error", handleEarlyError);
  window.addEventListener("unhandledrejection", handleEarlyRejection);

  const scheduleLoad = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => void loadSentry(dsn, config.stage), { timeout: IDLE_LOAD_TIMEOUT_MS });
    } else {
      setTimeout(() => void loadSentry(dsn, config.stage), 1000);
    }
  };
  if (document.readyState === "complete") {
    scheduleLoad();
  } else {
    window.addEventListener("load", scheduleLoad, { once: true });
  }
}

export function captureClientError(error: unknown, context: Record<string, unknown> = {}) {
  initializeClientObservability();

  if (sentry) {
    sentry.captureClientErrorWithSentry(error, context);
    return;
  }

  const config = getConfig();
  if (!config.frontSentryDsn) {
    return;
  }
  enqueueReport((module) => module.captureClientErrorWithSentry(error, context));
  void loadSentry(config.frontSentryDsn, config.stage);
}
