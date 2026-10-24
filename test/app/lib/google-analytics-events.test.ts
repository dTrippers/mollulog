/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, useEffect, useRef, useState } from "react";
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from "react-router";
import RouteErrorBoundary from "~/components/features/layout/RouteErrorBoundary";
import {
  getGoogleAnalyticsGtag,
  initializeGoogleAnalytics,
  setGoogleAnalyticsEnabled,
  setGoogleAnalyticsLoggedIn,
  setGoogleAnalyticsPageContext,
  trackGoogleAnalyticsPageView,
} from "~/lib/google-analytics.client";
import {
  consumePendingAuthEvent,
  rememberPendingAuthEvent,
  sanitizeGoogleAnalyticsEventParameters,
  setGoogleAnalyticsPageKey,
  trackEventShopPlanSaved,
  trackGoogleAnalyticsEvent,
  trackGoogleAnalyticsEventIfAllowed,
} from "~/lib/google-analytics-events.client";
import { useConsumeGoogleAnalyticsEventCookie, useTrackGoogleAnalyticsSearch } from "~/lib/google-analytics-hooks";
import ResourceInventoryFilterPanel, {
  createResourceInventoryFilterState,
} from "~/routes/utils.resources._components/ResourceInventoryFilterPanel";

function DoubleMountedResourceSearchProbe() {
  const [filter, setFilter] = useState(createResourceInventoryFilterState);
  useTrackGoogleAnalyticsSearch(filter.search, "resources", 3);
  return createElement(
    "div",
    null,
    createElement(ResourceInventoryFilterPanel, { value: filter, onChange: setFilter }),
    createElement(ResourceInventoryFilterPanel, { value: filter, onChange: setFilter }),
  );
}

function AnalyticsErrorRootProbe() {
  setGoogleAnalyticsEnabled(true);
  setGoogleAnalyticsPageContext({ routePattern: "/students/:id", contentGroup: "students" });
  useEffect(() => initializeGoogleAnalytics(), []);
  return createElement(Outlet);
}

function AnalyticsEventCookieProbe() {
  const location = useLocation();
  const pageViewLocationKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (location.pathname !== "/destination" || pageViewLocationKeyRef.current === location.key) return;
    pageViewLocationKeyRef.current = location.key;
    const gtag = getGoogleAnalyticsGtag();
    if (!gtag) return;
    trackGoogleAnalyticsPageView(gtag, {
      routePattern: "/students/:id",
      contentGroup: "students",
      loggedIn: false,
    });
  }, [location.key, location.pathname]);
  useConsumeGoogleAnalyticsEventCookie();
  return createElement(
    "output",
    { "data-testid": "location" },
    `${location.pathname}${location.search}${location.hash}`,
  );
}

describe("Google Analytics events", () => {
  beforeEach(() => {
    setGoogleAnalyticsPageContext({ routePattern: "/test", contentGroup: "test" });
    setGoogleAnalyticsEnabled(true);
  });

  afterEach(() => {
    delete (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
    delete (window as Window & { dataLayer?: unknown[] }).dataLayer;
    document.querySelectorAll("script[data-mollulog-google-analytics]").forEach((script) => {
      script.remove();
    });
    document.cookie = "__mllg_analytics_events=; Max-Age=0; Path=/";
    setGoogleAnalyticsEnabled(false);
    setGoogleAnalyticsLoggedIn(false);
  });

  it("copies only allowed event parameters and always adds logged_in", () => {
    expect(
      sanitizeGoogleAnalyticsEventParameters(
        "search",
        {
          scope: "global",
          result_bucket: "1-5",
          searchTerm: "private query",
          userId: "user-123",
          url: "https://mollulog.net/contact/ticket?token=secret",
        },
        true,
      ),
    ).toEqual({
      scope: "global",
      result_bucket: "1-5",
      logged_in: true,
      page_location: "https://mollulog.net/test",
      page_title: "/test",
      page_referrer: "",
    });

    expect(
      sanitizeGoogleAnalyticsEventParameters(
        "web_vitals",
        { metric: "LCP", value: Number.POSITIVE_INFINITY, rating: "good", extra: "private" },
        false,
      ),
    ).toEqual({
      metric: "LCP",
      rating: "good",
      logged_in: false,
      page_location: "https://mollulog.net/test",
      page_title: "/test",
      page_referrer: "",
    });
  });

  it("does not forward runtime-added keys or send when GA is unavailable", () => {
    const gtag = jest.fn();
    Object.defineProperty(window, "gtag", { configurable: true, value: gtag });
    setGoogleAnalyticsLoggedIn(true);

    trackGoogleAnalyticsEvent("nav_menu_click", { menu_id: "students", arbitrary: "secret" } as unknown as {
      menu_id: "students";
    });
    expect(gtag).toHaveBeenCalledWith("event", "nav_menu_click", {
      menu_id: "students",
      logged_in: true,
      page_location: "https://mollulog.net/test",
      page_title: "/test",
      page_referrer: "",
    });

    setGoogleAnalyticsEnabled(false);
    delete (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
    expect(() => trackGoogleAnalyticsEvent("account_deleted")).not.toThrow();
  });

  it("counts a settled search once when its filter is mounted in both responsive panels", async () => {
    const gtag = jest.fn();
    Object.defineProperty(window, "gtag", { configurable: true, value: gtag });
    render(createElement(DoubleMountedResourceSearchProbe));

    fireEvent.change(screen.getAllByPlaceholderText("재화 이름")[0], { target: { value: "report" } });

    await waitFor(() => {
      expect(
        gtag.mock.calls.filter(([command, eventName]) => command === "event" && eventName === "search"),
      ).toHaveLength(1);
    });
  });

  it("remembers only an allowlisted auth method until the authenticated root consumes it", () => {
    rememberPendingAuthEvent("login", "discord");
    expect(consumePendingAuthEvent()).toEqual({ eventName: "login", method: "discord" });
    expect(consumePendingAuthEvent()).toBeNull();

    window.sessionStorage.setItem(
      "mollulog.analytics.pending-auth-event",
      JSON.stringify({ eventName: "login", method: "discord", createdAt: Date.now(), userId: "private" }),
    );
    expect(consumePendingAuthEvent()).toEqual({ eventName: "login", method: "discord" });
  });

  it("deduplicates first-per-page events", () => {
    const gtag = jest.fn();
    Object.defineProperty(window, "gtag", { configurable: true, value: gtag });
    setGoogleAnalyticsPageKey("page-one");

    trackEventShopPlanSaved(false);
    trackEventShopPlanSaved(true);
    trackEventShopPlanSaved(true);

    expect(gtag.mock.calls.filter(([command]) => command === "event")).toEqual([
      [
        "event",
        "event_shop_plan_saved",
        {
          logged_in: false,
          page_location: "https://mollulog.net/test",
          page_title: "/test",
          page_referrer: "",
        },
      ],
    ]);
  });

  it("consumes an event cookie once without navigating or duplicating the destination page view", async () => {
    const gtag = jest.fn();
    Object.defineProperty(window, "gtag", { configurable: true, value: gtag });
    document.cookie = `__mllg_analytics_events=${encodeURIComponent(
      JSON.stringify([
        {
          eventName: "search",
          parameters: { scope: "global", result_bucket: "1-5", searchTerm: "private", userId: 7 },
        },
        { eventName: "not_a_catalog_event", parameters: { userId: "private" } },
      ]),
    )}; Path=/; Max-Age=120`;
    let destinationLoaderCalls = 0;
    const router = createMemoryRouter(
      [
        {
          path: "*",
          loader: ({ request }) => {
            if (new URL(request.url).pathname === "/destination") destinationLoaderCalls += 1;
            return null;
          },
          element: createElement(AnalyticsEventCookieProbe),
        },
      ],
      {
        initialEntries: ["/start"],
      },
    );
    const view = render(createElement(RouterProvider, { router }));

    await act(async () => {
      await router.navigate("/destination");
    });

    expect((await screen.findByTestId("location")).textContent).toBe("/destination");
    const destinationLocationKey = router.state.location.key;
    expect(destinationLoaderCalls).toBe(1);
    expect(document.cookie).not.toContain("__mllg_analytics_events");
    expect(router.state.location.key).toBe(destinationLocationKey);
    expect(gtag.mock.calls.filter(([command, eventName]) => command === "event" && eventName === "search")).toEqual([
      [
        "event",
        "search",
        {
          scope: "global",
          result_bucket: "1-5",
          logged_in: false,
          page_location: "https://mollulog.net/students/:id",
          page_title: "/students/:id",
          page_referrer: "",
        },
      ],
    ]);
    expect(
      gtag.mock.calls.filter(
        ([command, eventName, parameters]) =>
          command === "event" &&
          eventName === "page_view" &&
          (parameters as Record<string, unknown>).page_location === "https://mollulog.net/students/:id",
      ),
    ).toHaveLength(1);

    view.rerender(createElement(RouterProvider, { router }));
    await act(async () => {
      await router.navigate("/other");
    });
    expect(
      gtag.mock.calls.filter(([command, eventName]) => command === "event" && eventName === "search"),
    ).toHaveLength(1);

    trackGoogleAnalyticsEventIfAllowed("not_a_catalog_event", { userId: "private" });
    trackGoogleAnalyticsEventIfAllowed("planner_saved", { action: "unknown-action" });
    trackGoogleAnalyticsEventIfAllowed("planner_saved", { action: "update" });
    expect(
      gtag.mock.calls.filter(([command, eventName]) => command === "event" && eventName === "planner_saved"),
    ).toHaveLength(2);
    expect(gtag).toHaveBeenLastCalledWith("event", "planner_saved", {
      action: "update",
      logged_in: false,
      page_location: "https://mollulog.net/students/:id",
      page_title: "/students/:id",
      page_referrer: "",
    });
    view.unmount();
  });

  it("drops invalid event names and unsupported parameter values from the event cookie", async () => {
    const gtag = jest.fn();
    Object.defineProperty(window, "gtag", { configurable: true, value: gtag });
    document.cookie = `__mllg_analytics_events=${encodeURIComponent(
      JSON.stringify([
        { eventName: "search", parameters: { scope: "private search", result_bucket: "6+" } },
        { eventName: "unknown_event", parameters: { value: "secret" } },
      ]),
    )}; Path=/; Max-Age=120`;
    const router = createMemoryRouter([{ path: "*", element: createElement(AnalyticsEventCookieProbe) }], {
      initialEntries: ["/destination"],
    });
    render(createElement(RouterProvider, { router }));

    expect(gtag.mock.calls.filter(([command, eventName]) => command === "event" && eventName === "search")).toEqual([
      [
        "event",
        "search",
        {
          result_bucket: "6+",
          logged_in: false,
          page_location: "https://mollulog.net/students/:id",
          page_title: "/students/:id",
          page_referrer: "",
        },
      ],
    ]);
  });

  it("queues a route error event after safe context and GA config on the first enabled render", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: createElement(AnalyticsErrorRootProbe),
          children: [
            {
              path: "students/:id",
              loader: () => {
                throw new Error("first load failure");
              },
              element: createElement("div"),
              errorElement: createElement(RouteErrorBoundary),
            },
          ],
        },
      ],
      { initialEntries: ["/students/STU_001"] },
    );
    const originalResponse = globalThis.Response;
    if (typeof originalResponse === "undefined") {
      Object.defineProperty(globalThis, "Response", { configurable: true, value: class TestResponse {} });
    }
    try {
      render(createElement(RouterProvider, { router }));

      const analyticsWindow = window as Window & { dataLayer?: unknown[] };
      await waitFor(() => {
        const commands = (analyticsWindow.dataLayer ?? []).map((command) => Array.from(command as ArrayLike<unknown>));
        expect(commands.some(([command, eventName]) => command === "event" && eventName === "error_shown")).toBe(true);
      });

      const commands = (analyticsWindow.dataLayer ?? []).map((command) => Array.from(command as ArrayLike<unknown>));
      const pageContextIndex = commands.findIndex(([command]) => command === "set");
      const configIndex = commands.findIndex(([command]) => command === "config");
      const errorEventIndex = commands.findIndex(
        ([command, eventName]) => command === "event" && eventName === "error_shown",
      );
      expect(pageContextIndex).toBeGreaterThanOrEqual(0);
      expect(pageContextIndex).toBeLessThan(configIndex);
      expect(configIndex).toBeLessThan(errorEventIndex);
      expect(commands[errorEventIndex]).toEqual(["event", "error_shown", expect.objectContaining({ kind: "server" })]);
    } finally {
      if (typeof originalResponse === "undefined") delete (globalThis as { Response?: unknown }).Response;
    }
  });

  it("sets sanitized page context before sending regular events", () => {
    const gtag = jest.fn();
    Object.defineProperty(window, "gtag", { configurable: true, value: gtag });
    setGoogleAnalyticsPageContext({
      routePattern: "/contact/:uid",
      contentGroup: "contact",
      referrer: "https://external.example/private-path?token=secret",
    });

    trackGoogleAnalyticsEvent("account_deleted");

    expect(gtag).toHaveBeenNthCalledWith(1, "set", {
      page_location: "https://mollulog.net/contact/:uid",
      page_title: "/contact/:uid",
      page_referrer: "https://external.example",
    });
    expect(gtag).toHaveBeenCalledWith("event", "account_deleted", {
      logged_in: false,
      page_location: "https://mollulog.net/contact/:uid",
      page_title: "/contact/:uid",
      page_referrer: "https://external.example",
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/private-path|token=secret/);
  });
});
