import { describe, expect, it, jest } from "@jest/globals";
import {
  configureGoogleAnalytics,
  createGoogleAnalyticsCommandQueue,
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  trackGoogleAnalyticsPageView,
} from "../../../app/lib/google-analytics.client";

describe("Google Analytics", () => {
  it("queues commands using the Arguments object expected by gtag.js", () => {
    const dataLayer: unknown[] = [];
    const gtag = createGoogleAnalyticsCommandQueue(dataLayer);

    gtag("event", "page_view", { page_location: "https://mollulog.net/" });

    expect(dataLayer).toHaveLength(1);
    expect(Array.isArray(dataLayer[0])).toBe(false);
    expect(Array.from(dataLayer[0] as ArrayLike<unknown>)).toEqual([
      "event",
      "page_view",
      { page_location: "https://mollulog.net/" },
    ]);
  });

  it("configures the standard Google tag", () => {
    const gtag = jest.fn();
    const initializedAt = new Date("2026-07-17T00:00:00.000Z");

    configureGoogleAnalytics(gtag, initializedAt);

    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe("G-RX943CRJBV");
    expect(gtag).toHaveBeenNthCalledWith(1, "js", initializedAt);
    expect(gtag).toHaveBeenNthCalledWith(2, "config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
      send_page_view: false,
    });
  });

  it("sends an explicit page view", () => {
    const gtag = jest.fn();

    trackGoogleAnalyticsPageView(
      gtag,
      "https://mollulog.net/futures?source=navigation",
      "블루 아카이브 이벤트, 픽업 미래시 | 몰루로그",
    );

    expect(gtag).toHaveBeenCalledWith("event", "page_view", {
      page_location: "https://mollulog.net/futures?source=navigation",
      page_title: "블루 아카이브 이벤트, 픽업 미래시 | 몰루로그",
    });
  });
});
