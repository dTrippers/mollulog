/** @jest-environment jsdom */
import { describe, expect, it } from "@jest/globals";
import { scrubClientSentryBreadcrumb, scrubClientSentryEvent } from "~/lib/observability.client";
import { rememberRoutePattern } from "~/lib/route-pattern";

describe("client Sentry privacy scrubbing", () => {
  it("replaces known request URLs and Referers with route patterns and drops unknown URL data", () => {
    const pathname = "/contact/private-ticket";
    rememberRoutePattern(pathname, "/contact/:uid");
    const event = scrubClientSentryEvent({
      request: {
        url: `${window.location.origin}${pathname}?shareToken=secret`,
        query_string: "shareToken=secret",
        data: { subject: "private subject" },
        headers: {
          referer: `${window.location.origin}${pathname}?email=alice@example.com`,
          accept: "text/html",
          authorization: "Bearer secret",
          "x-forwarded-for": "192.0.2.1",
        },
      },
      user: { id: "user-123" },
      extra: { username: "alice" },
    });

    expect(event.request).toEqual({
      url: `${window.location.origin}/contact/:uid`,
      headers: { referer: `${window.location.origin}/contact/:uid`, accept: "text/html" },
    });
    expect(event.user).toBeUndefined();
    expect(event.extra).toEqual({});
    expect(JSON.stringify(event)).not.toMatch(/private-ticket|shareToken|alice@example|user-123|Bearer|192\.0\.2\.1/);
  });

  it("scrubs navigation and fetch breadcrumbs without retaining query or body values", () => {
    const pathname = "/students/STU_001";
    rememberRoutePattern(pathname, "/students/:id");
    const navigation = scrubClientSentryBreadcrumb({
      category: "navigation",
      data: {
        from: `${window.location.origin}${pathname}?tab=private`,
        to: `${window.location.origin}/contact/unknown?token=secret`,
      },
    });
    expect(navigation?.data).toEqual({ from: "/students/:id" });

    const fetchBreadcrumb = scrubClientSentryBreadcrumb({
      category: "fetch",
      data: {
        url: `${window.location.origin}${pathname}?search=private`,
        method: "POST",
        body: "private form body",
        query: "private query",
      },
    });
    expect(fetchBreadcrumb?.data).toEqual({ url: "/students/:id", method: "POST" });
    expect(
      scrubClientSentryBreadcrumb({ category: "console", data: { message: "private console message" } }),
    ).toBeNull();
  });

  it("drops UI breadcrumbs and breadcrumbs with free-form messages", () => {
    expect(
      scrubClientSentryBreadcrumb({
        category: "ui.click",
        message: 'button[aria-label="@secretuser 프로필"]',
        data: { target: "a" },
      }),
    ).toBeNull();
    expect(
      scrubClientSentryBreadcrumb({ category: "navigation", message: "private page text", data: { to: "/safe" } }),
    ).toBeNull();
  });
});
