import { onCLS, onINP, onLCP, type Metric } from "web-vitals";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";

const WEB_VITAL_NAMES = new Set(["LCP", "INP", "CLS"]);
let initialized = false;

export function createWebVitalsReporter(report: (metric: Metric) => void = reportWebVital) {
  const reported = new Set<string>();
  return (metric: Metric) => {
    if (!WEB_VITAL_NAMES.has(metric.name) || reported.has(metric.name)) return;
    reported.add(metric.name);
    report(metric);
  };
}

function reportWebVital(metric: Metric) {
  if (metric.name !== "LCP" && metric.name !== "INP" && metric.name !== "CLS") return;
  trackGoogleAnalyticsEvent("web_vitals", {
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
  });
}

export function initializeWebVitals() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const report = createWebVitalsReporter();
  onLCP(report);
  onINP(report);
  onCLS(report);
}
