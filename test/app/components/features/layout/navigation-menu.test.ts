import { describe, expect, it } from "@jest/globals";
import {
  getDesktopNavigation,
  getMobileNavigationItems,
  getMobileNavigationOptions,
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

  it("keeps the event-shop favorite ID with the fixed utility path", () => {
    const eventShop = getNavigationSections({
      pathname: "/",
      upcomingEvent: null,
      hasOngoingRaid: false,
      hasUnconsumedCoupons: false,
      isSignedIn: false,
    })
      .flatMap((section) => section.items)
      .find((item) => item.name === "이벤트 상점 계산기");

    expect(eventShop).toMatchObject({
      favoriteId: "event-shop-calculator",
      to: "/utils/event-shop",
      name: "이벤트 상점 계산기",
      mobileLabel: "상점 계산기",
    });
    expect(eventShop?.disabled).toBeUndefined();
  });
});

describe("navigation surface projections", () => {
  it("derives the mobile bottom navigation from the catalog", () => {
    const items = getMobileNavigationItems({ pathname: "/more", upcomingEvent: null });

    expect(items.map((item) => item.to)).toEqual(["/", "/futures", "/community", "/students", "/more"]);
    expect(items.filter((item) => item.isActive).map((item) => item.name)).toEqual(["더보기"]);
  });

  it.each([
    { pathname: "/community", mobileNavigationIds: ["events", "raids"] as const },
    { pathname: "/students", mobileNavigationIds: ["events", "raids"] as const },
  ])("leaves every item inactive when the route is not selected", ({ pathname, mobileNavigationIds }) => {
    const items = getMobileNavigationItems({ pathname, upcomingEvent: null, mobileNavigationIds });

    expect(items.filter((item) => item.isActive).map((item) => item.name)).toEqual([]);
  });

  it("exposes exactly the approved mobile candidates and labels in order", () => {
    const options = getMobileNavigationOptions(navigationOptions);

    expect(options).toHaveLength(12);
    expect(options.map((item) => item.mobileNavigationId)).toEqual([
      "feed",
      "students",
      "events",
      "raids",
      "main-story",
      "pyroxene-planner",
      "student-growth-planner",
      "resource-planner",
      "event-shop-calculator",
      "relationship-calculator",
      "strategy-timeline",
      "raid-score-calculator",
    ]);
    expect(options.map((item) => item.name)).toEqual([
      "피드",
      "학생부",
      "이벤트",
      "총력전",
      "메인 스토리",
      "청휘석 플래너",
      "성장 플래너",
      "재화 관리",
      "상점 계산기",
      "인연 계산기",
      "공략",
      "점수 계산기",
    ]);
    expect(options.every((item) => item.name.replace(/[\s/]/g, "").length <= 6)).toBe(true);
  });

  it("keeps signed-in desktop-only items out of the guest desktop menu", () => {
    const guest = getDesktopNavigation(navigationOptions);
    const signedIn = getDesktopNavigation({ ...navigationOptions, isSignedIn: true, currentUsername: "sensei" });

    expect(guest.profileItems).toEqual([]);
    expect(signedIn.profileItems.map((item) => item.to)).toEqual([
      "/@sensei",
      "/scanner/resource",
      "/connect/import",
      "/notifications",
    ]);
  });

  it("uses explicit surface membership for the more screen", () => {
    const guestItems = getMoreNavigationItems(navigationOptions);
    const signedInItems = getMoreNavigationItems({ ...navigationOptions, isSignedIn: true });

    expect(guestItems.map((item) => item.to)).toEqual([
      "/community",
      "/events",
      "/raids",
      "/students",
      "/mainstory",
      "/utils/pyroxene",
      "/utils/growth/students",
      "/utils/resources/inventory",
      "/utils/event-shop",
      "/utils/relationship",
      "/timelines",
      "/utils/raidscore",
    ]);

    expect(guestItems.map((item) => item.name)).toEqual([
      "피드",
      "이벤트",
      "총력전 / 대결전",
      "학생부",
      "메인 스토리",
      "청휘석 플래너",
      "학생 성장 플래너",
      "재화 관리/파밍 계산기",
      "이벤트 상점 계산기",
      "인연 랭크 계산기",
      "공략 타임라인",
      "총력전 점수 계산기",
    ]);

    expect(signedInItems.map((item) => item.name)).toEqual([
      ...guestItems.map((item) => item.name),
      "스크린샷/영상 인식기",
      "외부 데이터 연동",
      "알림 설정",
    ]);
  });

  it("always exposes the relationship calculator in the guest More menu", () => {
    expect(getMoreNavigationItems(navigationOptions)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "인연 랭크 계산기", to: "/utils/relationship" })]),
    );
  });

  it("exposes auth-gated links and the unavailable event-shop entry to search", () => {
    const guestSearchItems = getSearchableMenuItems();
    const signedInSearchItems = getSearchableMenuItems({ currentUsername: "sensei" });

    expect(guestSearchItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "스크린샷/영상 인식기", to: "/scanner/resource" }),
        expect.objectContaining({ name: "외부 데이터 연동", to: "/connect/import" }),
        expect.objectContaining({ name: "알림 설정", to: "/notifications" }),
        expect.objectContaining({ name: "이벤트 상점 계산기", to: "/utils/event-shop" }),
      ]),
    );
    expect(signedInSearchItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "profile", name: "내 프로필", to: "/@sensei" })]),
    );
  });

  it("keeps red dots only on the resource scanner and uses the v1.2 badge", () => {
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

  it("keeps the selected event-shop tab active on the resolved shop screen only", () => {
    const items = getMobileNavigationItems({
      pathname: "/events/event-uid/shop",
      upcomingEvent: null,
      mobileNavigationIds: ["events", "event-shop-calculator"],
    });

    expect(items.map((item) => [item.name, item.isActive])).toEqual([
      ["홈", false],
      ["미래시", false],
      ["이벤트", false],
      ["상점 계산기", true],
      ["더보기", false],
    ]);
  });
});
