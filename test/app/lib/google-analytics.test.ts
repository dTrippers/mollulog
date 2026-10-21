import { describe, expect, it, jest } from "@jest/globals";
import {
  configureGoogleAnalytics,
  createGoogleAnalyticsCommandQueue,
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  setGoogleAnalyticsPageContext,
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
    setGoogleAnalyticsPageContext({
      routePattern: "/students/:id",
      contentGroup: "students",
      referrer: "https://mollulog.net/@secretuser/students?q=secretquery",
    });

    configureGoogleAnalytics(gtag, initializedAt);

    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe("G-RX943CRJBV");
    expect(gtag).toHaveBeenNthCalledWith(1, "set", {
      page_location: "https://mollulog.net/students/:id",
      page_title: "/students/:id",
      page_referrer: "https://mollulog.net",
    });
    expect(gtag).toHaveBeenNthCalledWith(2, "js", initializedAt);
    expect(gtag).toHaveBeenNthCalledWith(3, "config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/secretuser|secretquery/);
  });

  it("sends only route patterns and an approved content id in page views", () => {
    const gtag = jest.fn();

    trackGoogleAnalyticsPageView(gtag, {
      routePattern: "/students/:id",
      contentGroup: "students",
      contentId: "student_01",
      loggedIn: true,
      referrer: "https://mollulog.net/@alice/students?shareToken=secret",
      previousRoutePattern: "/:username/students",
    });

    expect(gtag).toHaveBeenNthCalledWith(1, "set", {
      page_location: "https://mollulog.net/students/:id",
      page_title: "/students/:id",
      page_referrer: "https://mollulog.net/:username/students",
    });
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "page_view", {
      page_location: "https://mollulog.net/students/:id",
      page_title: "/students/:id",
      content_group: "students",
      content_id: "student_01",
      logged_in: true,
      page_referrer: "https://mollulog.net/:username/students",
    });
    const payload = JSON.stringify(gtag.mock.calls[0]);
    expect(payload).not.toContain("alice");
    expect(payload).not.toContain("shareToken");
  });

  it("keeps only an external referrer's origin and omits local query data", () => {
    const gtag = jest.fn();

    trackGoogleAnalyticsPageView(gtag, {
      routePattern: "/contact/:uid",
      contentGroup: "contact",
      referrer: "https://search.example/results?q=private-query#section",
      loggedIn: false,
    });

    expect(gtag).toHaveBeenNthCalledWith(1, "set", {
      page_location: "https://mollulog.net/contact/:uid",
      page_title: "/contact/:uid",
      page_referrer: "https://search.example",
    });
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "page_view", {
      page_location: "https://mollulog.net/contact/:uid",
      page_title: "/contact/:uid",
      content_group: "contact",
      logged_in: false,
      page_referrer: "https://search.example",
    });
    expect(JSON.stringify(gtag.mock.calls[0])).not.toContain("private-query");
  });

  it("can replace stale page context with an empty referrer", () => {
    const gtag = jest.fn();
    setGoogleAnalyticsPageContext({
      routePattern: "/futures",
      contentGroup: "futures",
      referrer: "https://mollulog.net/contact/private?token=secret",
    });
    trackGoogleAnalyticsPageView(gtag, {
      routePattern: "/futures",
      contentGroup: "futures",
      loggedIn: false,
    });

    expect(gtag).toHaveBeenNthCalledWith(1, "set", {
      page_location: "https://mollulog.net/futures",
      page_title: "/futures",
      page_referrer: "",
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/private|token=secret/);
  });
});
