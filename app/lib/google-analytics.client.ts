export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-RX943CRJBV";
export const GOOGLE_ANALYTICS_ORIGIN = "https://mollulog.net";

export type Gtag = (...args: unknown[]) => void;

type GoogleAnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
};

export type GoogleAnalyticsPageView = {
  routePattern: string;
  contentGroup: string;
  contentId?: string;
  referrer?: string;
  previousRoutePattern?: string;
  loggedIn: boolean;
};

let analyticsLoggedIn = false;
let analyticsEventPageContext: Record<string, string> | undefined;
let analyticsEnabled = false;
let configuredGtag: Gtag | undefined;

export function setGoogleAnalyticsEnabled(enabled: boolean) {
  analyticsEnabled = enabled;
}

export function isGoogleAnalyticsEnabled() {
  return analyticsEnabled;
}

export function setGoogleAnalyticsLoggedIn(loggedIn: boolean) {
  analyticsLoggedIn = loggedIn;
}

export function getGoogleAnalyticsLoggedIn() {
  return analyticsLoggedIn;
}

export function createGoogleAnalyticsCommandQueue(dataLayer: unknown[]): Gtag {
  return function gtag() {
    dataLayer.push(arguments);
  };
}

export function configureGoogleAnalytics(gtag: Gtag, initializedAt: Date) {
  applyGoogleAnalyticsPageContext(gtag);
  gtag("js", initializedAt);
  gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

function safePageReferrer(referrer: string | undefined, previousRoutePattern: string | undefined) {
  if (previousRoutePattern) return `${GOOGLE_ANALYTICS_ORIGIN}${previousRoutePattern}`;
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    if (/(^|\.)mollulog\.net$/i.test(url.hostname)) return GOOGLE_ANALYTICS_ORIGIN;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function setGoogleAnalyticsPageContext(page: Omit<GoogleAnalyticsPageView, "loggedIn">) {
  const pageReferrer = safePageReferrer(page.referrer, page.previousRoutePattern);
  analyticsEventPageContext = {
    page_location: `${GOOGLE_ANALYTICS_ORIGIN}${page.routePattern}`,
    page_title: page.routePattern,
    page_referrer: pageReferrer ?? "",
  };
}

export function applyGoogleAnalyticsPageContext(gtag: Gtag) {
  if (analyticsEventPageContext) gtag("set", analyticsEventPageContext);
}

export function getGoogleAnalyticsEventPageParameters() {
  return analyticsEventPageContext ? { ...analyticsEventPageContext } : {};
}

export function trackGoogleAnalyticsPageView(gtag: Gtag, page: GoogleAnalyticsPageView) {
  setGoogleAnalyticsPageContext(page);
  applyGoogleAnalyticsPageContext(gtag);
  const pageParameters: Record<string, string | boolean> = {
    page_location: `${GOOGLE_ANALYTICS_ORIGIN}${page.routePattern}`,
    page_title: page.routePattern,
    content_group: page.contentGroup,
    logged_in: page.loggedIn,
  };
  const pageReferrer = safePageReferrer(page.referrer, page.previousRoutePattern);
  if (pageReferrer) pageParameters.page_referrer = pageReferrer;
  if (page.contentId) pageParameters.content_id = page.contentId;

  gtag("event", "page_view", pageParameters);
}

export function initializeGoogleAnalytics() {
  if (typeof window === "undefined") return;
  const analyticsWindow = window as GoogleAnalyticsWindow;
  analyticsWindow.dataLayer ??= [];
  analyticsWindow.gtag ??= createGoogleAnalyticsCommandQueue(analyticsWindow.dataLayer);

  if (configuredGtag !== analyticsWindow.gtag) {
    configureGoogleAnalytics(analyticsWindow.gtag, new Date());
    configuredGtag = analyticsWindow.gtag;
  }

  const scriptSelector = `script[data-mollulog-google-analytics="${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`;
  if (document.querySelector(scriptSelector)) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`;
  script.dataset.mollulogGoogleAnalytics = GOOGLE_ANALYTICS_MEASUREMENT_ID;
  document.head.appendChild(script);
}

export function getGoogleAnalyticsGtag() {
  if (typeof window === "undefined") return undefined;
  return (window as GoogleAnalyticsWindow).gtag;
}

export function trackCurrentGoogleAnalyticsPageView(page: Omit<GoogleAnalyticsPageView, "loggedIn">) {
  const gtag = getGoogleAnalyticsGtag();
  if (!gtag) return;
  trackGoogleAnalyticsPageView(gtag, { ...page, loggedIn: getGoogleAnalyticsLoggedIn() });
}
