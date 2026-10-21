export type AnalyticsRedirectEvent = {
  eventName: string;
  parameters?: Record<string, string | number | boolean>;
};

export function createAnalyticsEventsCookie(requestUrl: string, events: AnalyticsRedirectEvent[]) {
  const value = encodeURIComponent(
    JSON.stringify(events.map(({ eventName, parameters = {} }) => ({ eventName, parameters }))),
  );
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `__mllg_analytics_events=${value}; Path=/; Max-Age=120; SameSite=Lax${secure}`;
}
