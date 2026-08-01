import { describe, expect, it } from "@jest/globals";
import { getNavigationSections } from "~/components/features/layout/navigation-menu";

function getMenuItems({ hasOngoingRaid = false, isSignedIn = false } = {}) {
  return getNavigationSections({
    pathname: "/",
    upcomingEvent: null,
    hasOngoingRaid,
    hasUnconsumedCoupons: false,
    isSignedIn,
  }).flatMap((section) => section.items);
}

describe("getNavigationSections", () => {
  it("labels the raid menu only while a raid is ongoing", () => {
    expect(getMenuItems({ hasOngoingRaid: true }).find((item) => item.to === "/raids")?.badgeLabel).toBe("진행중");
    expect(getMenuItems().find((item) => item.to === "/raids")?.badgeLabel).toBeUndefined();
  });

  it("labels guest access to the pyroxene planner only while signed out", () => {
    expect(getMenuItems().find((item) => item.to === "/utils/pyroxene")?.badgeLabel).toBe("로그인 없이 사용");
    expect(
      getMenuItems({ isSignedIn: true }).find((item) => item.to === "/utils/pyroxene")?.badgeLabel,
    ).toBeUndefined();
  });

  it("keeps stable favorite IDs across dynamic event-shop availability", () => {
    const unavailable = getNavigationSections({
      pathname: "/",
      upcomingEvent: null,
      hasOngoingRaid: false,
      hasUnconsumedCoupons: false,
      isSignedIn: false,
    })
      .flatMap((section) => section.items)
      .find((item) => item.name === "이벤트 소탕 계산기");
    const available = getNavigationSections({
      pathname: "/",
      upcomingEvent: { uid: "event-uid", since: "2026-01-01T00:00:00.000Z", until: "2026-01-02T00:00:00.000Z" },
      hasOngoingRaid: false,
      hasUnconsumedCoupons: false,
      isSignedIn: false,
      now: "2026-01-01T12:00:00.000Z",
    })
      .flatMap((section) => section.items)
      .find((item) => item.name === "이벤트 소탕 계산기");

    expect(unavailable).toMatchObject({ favoriteId: "event-shop-calculator", disabled: true });
    expect(available).toMatchObject({
      favoriteId: "event-shop-calculator",
      to: "/events/event-uid/shop",
    });
    expect(available?.disabled).toBeUndefined();
  });
});
