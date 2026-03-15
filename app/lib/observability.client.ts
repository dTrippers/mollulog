import * as Sentry from "@sentry/browser";

type PublicObservabilityConfig = {
  stage?: string;
  publicBetterStackSentryDsn?: string;
};

declare global {
  interface Window {
    ENV?: {
      FRONT_BETTER_STACK_SENTRY_DSN?: string;
      STAGE?: string;
    };
  }
}

let initialized = false;

function getConfig(): PublicObservabilityConfig {
  if (typeof window === "undefined") {
    return {};
  }

  const dsnMeta = document.querySelector('meta[name="mollulog:front-better-stack-sentry-dsn"]');
  const stageMeta = document.querySelector('meta[name="mollulog:stage"]');

  return {
    stage: stageMeta?.getAttribute("content") ?? window.ENV?.STAGE,
    publicBetterStackSentryDsn: dsnMeta?.getAttribute("content") ?? window.ENV?.FRONT_BETTER_STACK_SENTRY_DSN,
  };
}

export function initializeClientObservability() {
  if (initialized) {
    return;
  }

  const config = getConfig();
  if (!config.publicBetterStackSentryDsn) {
    return;
  }

  Sentry.init({
    dsn: config.publicBetterStackSentryDsn,
    enabled: true,
    environment: config.stage ?? "local",
    sendDefaultPii: false,
  });

  initialized = true;
}

export function captureClientError(error: unknown, context: Record<string, unknown> = {}) {
  initializeClientObservability();

  Sentry.withScope((scope) => {
    scope.setExtras(context);

    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }

    Sentry.captureMessage(typeof error === "string" ? error : "Non-Error client exception captured", "error");
  });
}
