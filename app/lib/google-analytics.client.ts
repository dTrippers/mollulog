export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-RX943CRJBV";

type Gtag = (...args: unknown[]) => void;

type GoogleAnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
};

export function createGoogleAnalyticsCommandQueue(dataLayer: unknown[]): Gtag {
  return function gtag() {
    dataLayer.push(arguments);
  };
}

export function configureGoogleAnalytics(gtag: Gtag, initializedAt: Date) {
  gtag("js", initializedAt);
  gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
    send_page_view: false,
  });
}

export function trackGoogleAnalyticsPageView(gtag: Gtag, pageLocation: string, pageTitle: string) {
  gtag("event", "page_view", {
    page_location: pageLocation,
    page_title: pageTitle,
  });
}

export function initializeGoogleAnalytics() {
  const analyticsWindow = window as GoogleAnalyticsWindow;
  analyticsWindow.dataLayer ??= [];
  analyticsWindow.gtag ??= createGoogleAnalyticsCommandQueue(analyticsWindow.dataLayer);

  const scriptSelector = `script[data-mollulog-google-analytics="${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`;
  if (document.querySelector(scriptSelector)) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`;
  script.dataset.mollulogGoogleAnalytics = GOOGLE_ANALYTICS_MEASUREMENT_ID;
  document.head.appendChild(script);

  configureGoogleAnalytics(analyticsWindow.gtag, new Date());
}

export function trackCurrentGoogleAnalyticsPageView(pagePath: string) {
  const analyticsWindow = window as GoogleAnalyticsWindow;
  if (!analyticsWindow.gtag) {
    return;
  }

  trackGoogleAnalyticsPageView(analyticsWindow.gtag, new URL(pagePath, window.location.origin).href, document.title);
}
