import { describe, expect, it } from "@jest/globals";
import { redirect } from "react-router";
import { createAnalyticsEventsCookie } from "~/lib/analytics-redirect.server";

describe("analytics event redirect cookie", () => {
  it("encodes events, appends beside existing cookies, and keeps the redirect location clean", () => {
    const cookie = createAnalyticsEventsCookie("https://mollulog.net/contact", [
      { eventName: "account_deleted" },
      { eventName: "search", parameters: { scope: "global", result_bucket: "1-5" } },
    ]);
    const [cookiePair, ...attributes] = cookie.split("; ");
    const headers = new Headers();
    headers.append("Set-Cookie", "__session=existing; Path=/; HttpOnly");
    headers.append("Set-Cookie", cookie);
    const response = redirect("/contact/ticket-123", { headers });

    expect(cookiePair?.startsWith("__mllg_analytics_events=")).toBe(true);
    expect(decodeURIComponent(cookiePair?.slice("__mllg_analytics_events=".length) ?? "")).toBe(
      JSON.stringify([
        { eventName: "account_deleted", parameters: {} },
        { eventName: "search", parameters: { scope: "global", result_bucket: "1-5" } },
      ]),
    );
    expect(attributes).toEqual(["Path=/", "Max-Age=120", "SameSite=Lax", "Secure"]);
    expect(headers.getSetCookie()).toEqual(["__session=existing; Path=/; HttpOnly", cookie]);
    expect(response.headers.get("Location")).toBe("/contact/ticket-123");
    expect(response.headers.get("Location")).not.toContain("__mllg_event");
  });

  it("omits Secure for an HTTP request and never marks the cookie HttpOnly", () => {
    const cookie = createAnalyticsEventsCookie("http://localhost:8787/action", [{ eventName: "account_deleted" }]);

    expect(cookie).toContain("Path=/; Max-Age=120; SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("HttpOnly");
  });
});
