import { describe, expect, it } from "@jest/globals";
import {
  getDesktopNavigation,
  getMobileNavigationItems,
  getMoreNavigationItems,
  getNavigationCatalog,
  getNavigationSections,
  getSearchableMenuItems,
} from "~/components/features/layout/navigation-menu";

const navigationOptions = {
  pathname: "/",
  upcomingEvent: null,
  hasOngoingRaid: false,
  hasUnconsumedCoupons: false,
  isSignedIn: false,
};

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

describe("navigation surface projections", () => {
  it("derives the mobile bottom navigation from the catalog", () => {
    expect(getMobileNavigationItems({ pathname: "/more", upcomingEvent: null }).map((item) => item.to)).toEqual([
      "/",
      "/futures",
      "/community",
      "/students",
      "/more",
    ]);
  });

  it("keeps signed-in desktop-only items out of the guest desktop menu", () => {
    const guest = getDesktopNavigation(navigationOptions);
    const signedIn = getDesktopNavigation({ ...navigationOptions, isSignedIn: true, currentUsername: "sensei" });

    expect(guest.profileItems).toEqual([]);
    expect(signedIn.profileItems.map((item) => item.to)).toEqual(["/@sensei", "/scanner/resource", "/connect/import"]);
  });

  it("uses explicit surface membership for the more screen", () => {
    expect(getMoreNavigationItems(navigationOptions).map((item) => item.to)).toEqual([
      "/events",
      "/raids",
      "/mainstory",
      "/utils/growth/students",
      "/utils/resources/inventory",
      "/futures",
      "/timelines",
      "/utils/raidscore",
    ]);
  });

  it("exposes auth-gated links and the unavailable event-shop entry to search", () => {
    const guestSearchItems = getSearchableMenuItems();
    const signedInSearchItems = getSearchableMenuItems({ currentUsername: "sensei" });

    expect(guestSearchItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "스크린샷/영상 인식기", to: "/scanner/resource" }),
        expect.objectContaining({ name: "외부 데이터 연동", to: "/connect/import" }),
        expect.objectContaining({ name: "이벤트 소탕 계산기", to: "/futures" }),
      ]),
    );
    expect(signedInSearchItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "profile", name: "내 프로필", to: "/@sensei" })]),
    );
  });

  it("keeps static red dots only on the resource scanner and uses the v1.2 badge", () => {
    const catalog = getNavigationCatalog({ ...navigationOptions, isSignedIn: true, currentUsername: "sensei" });

    expect(catalog.filter((item) => item.showRedDot === true).map((item) => item.name)).toEqual([
      "스크린샷/영상 인식기",
    ]);
    expect(catalog.filter((item) => item.badgeLabel === "v1.2").map((item) => item.name)).toEqual([
      "스크린샷/영상 인식기",
    ]);
    expect(catalog.filter((item) => item.badgeLabel === "베타").map((item) => item.name)).toEqual([
      "공략 타임라인",
      "외부 데이터 연동",
    ]);
  });
});
