import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import {
  consumeGoogleAnalyticsEventsCookie,
  getGoogleAnalyticsResultBucket,
  trackGoogleAnalyticsEvent,
} from "~/lib/google-analytics-events.client";

// Hooks run during SSR, where React Router replaces `.client` modules with empty exports.
// Keep them here and touch `.client` exports only inside effects, which never run on the server.

export function useTrackGoogleAnalyticsSearch(
  search: string | undefined,
  scope: "global" | "students" | "my_students" | "events" | "furniture" | "resources",
  resultCount: number,
) {
  const resultCountRef = useRef(resultCount);
  resultCountRef.current = resultCount;

  useEffect(() => {
    if (!search?.trim()) return;
    const timer = window.setTimeout(() => {
      trackGoogleAnalyticsEvent("search", {
        scope,
        result_bucket: getGoogleAnalyticsResultBucket(resultCountRef.current),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [scope, search]);
}

export function useConsumeGoogleAnalyticsEventCookie() {
  const location = useLocation();
  const lastConsumedLocationKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (lastConsumedLocationKeyRef.current === location.key) return;
    lastConsumedLocationKeyRef.current = location.key;
    if (typeof document !== "undefined") consumeGoogleAnalyticsEventsCookie();
  }, [location.key]);
}
