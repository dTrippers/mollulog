import { CalendarIcon as CalendarIconOutline } from "@heroicons/react/24/outline";
import { describe, expect, it } from "@jest/globals";
import {
  getDesktopNavigation,
  getMobileNavigationItems,
  getMobileNavigationOptions,
  getMoreNavigationSections,
  getNavigationCatalog,
  getNavigationFavoriteItems,
  getSearchableMenuItems,
  isAccountNavigationActive,
} from "~/components/features/layout/navigation-menu";
import { getAvailableNavigationFavorites } from "~/domain/navigation-favorites";
import { NAVIGATION_MENU_IDS } from "~/domain/navigation-menu-badges";

const guestOptions = {
  pathname: "/",
  upcomingEvent: null,
  hasOngoingRaid: false,
  hasUnconsumedCoupons: false,
  isSignedIn: false,
};

const signedInOptions = {
  ...guestOptions,
  isSignedIn: true,
  currentUsername: "sensei",
};

describe("global navigation catalog", () => {
  it("keeps the account trigger inactive on the owner's profile root but active on account routes", () => {
    expect(isAccountNavigationActive("/@sensei", "sensei")).toBe(false);
    expect(isAccountNavigationActive("/@sensei/", "sensei")).toBe(false);
    expect(isAccountNavigationActive("/@sensei/friends", "sensei")).toBe(true);
    expect(isAccountNavigationActive("/edit", "sensei")).toBe(true);
    expect(isAccountNavigationActive("/notifications", "sensei")).toBe(true);
    expect(isAccountNavigationActive("/@sensei/students", "sensei")).toBe(false);
    expect(isAccountNavigationActive("/@other/", "sensei")).toBe(false);
    expect(isAccountNavigationActive("/@me", "sensei")).toBe(false);
    expect(isAccountNavigationActive("/@me/friends", "sensei")).toBe(false);
  });

  it("defines the stable admin badge IDs once in the catalog", () => {
    const menuEntries = getNavigationCatalog(signedInOptions).flatMap(({ menuId, name }) =>
      menuId ? ([[menuId, name]] as const) : [],
    );
    const catalogIds = menuEntries.map(([menuId]) => menuId).sort();
    const namesById = Object.fromEntries(menuEntries);

    expect(catalogIds).toEqual([...NAVIGATION_MENU_IDS].sort());
    expect(namesById).toMatchObject({
      "integrated-planner": "통합 플래너",
      "ap-planner": "AP 플래너",
      "resource-planner": "재화 플래너",
      "farming-calculator": "파밍 계산기",
      profile: "프로필",
      "my-students": "모집한 학생",
      "my-walkthroughs": "공략 작성하기",
    });
  });

  it("adds the integrated planner while preserving detailed planner entries", () => {
    const items = getNavigationCatalog(guestOptions);

    expect(items.find((item) => item.to === "/planner")).toMatchObject({
      menuId: "integrated-planner",
      name: "통합 플래너",
      favoriteId: "integrated-planner",
      mobileNavigationId: "integrated-planner",
      OutlineIcon: CalendarIconOutline,
    });
    expect(items.map((item) => item.to)).toEqual(
      expect.arrayContaining(["/planner", "/utils/pyroxene", "/utils/event-shop"]),
    );
  });

  it("exposes AP planner as a favoritable sibling utility", () => {
    const planner = getNavigationCatalog(guestOptions).find((item) => item.to === "/utils/ap");

    expect(planner).toMatchObject({ menuId: "ap-planner", name: "AP 플래너", favoriteId: "ap-planner" });
  });

  it.each(["/planner", "/planner/import"])("activates the integrated planner at %s", (pathname) => {
    const planner = getDesktopNavigation({ ...guestOptions, pathname }).groups.find(({ id }) => id === "planner");

    expect(planner?.items.find((item) => item.name === "통합 플래너")).toMatchObject({
      to: "/planner",
      isActive: true,
    });
  });

  it("uses the approved desktop group names and order", () => {
    const desktop = getDesktopNavigation(guestOptions);

    expect(desktop.groups.map(({ name }) => name)).toEqual(["게임 정보", "플래너·계산기", "커뮤니티", "소식·도움말"]);
    expect(desktop.groups.map(({ id }) => id)).toEqual(["game", "planner", "community", "news"]);
    expect(desktop.groups.flatMap(({ name }) => [name])).not.toEqual(
      expect.arrayContaining(["컨텐츠", "플래너 & 계산기", "게임 외 정보", "내 정보", "서비스"]),
    );

    const signedIn = getDesktopNavigation(signedInOptions);
    expect(signedIn.groups.map(({ name }) => name)).toEqual([
      "게임 정보",
      "플래너·계산기",
      "커뮤니티",
      "나의 데이터",
      "소식·도움말",
    ]);
    expect(signedIn.groups.find(({ id }) => id === "personal")?.items.map(({ to }) => to)).toEqual([
      "/@sensei",
      "/@sensei/students",
      "/@sensei/pickups",
      "/@sensei/futures",
      "/@sensei/timelines",
      "/scanner/resource",
      "/connect/import",
    ]);
  });

  it("keeps every existing game and planner destination in its new group", () => {
    const desktop = getDesktopNavigation(guestOptions);
    const itemsByGroup = Object.fromEntries(desktop.groups.map(({ id, items }) => [id, items.map(({ to }) => to)]));

    expect(itemsByGroup.game).toEqual([
      "/futures",
      "/events",
      "/raids",
      "/students",
      "/mainstory",
      "/furniture",
      "/coupons",
    ]);
    expect(itemsByGroup.planner).toEqual([
      "/planner",
      "/utils/pyroxene",
      "/utils/ap",
      "/utils/growth/students",
      "/utils/resources/inventory",
      "/utils/resources/farming",
      "/utils/event-shop",
      "/utils/relationship",
      "/utils/raidscore",
    ]);
    expect(itemsByGroup.community).toEqual(["/community", "/timelines"]);
    expect(itemsByGroup.news).toEqual(["/news", "/contact"]);
  });

  it("keeps the mobile bottom navigation at home, futures, two saved choices, and more", () => {
    const items = getMobileNavigationItems({
      pathname: "/more",
      upcomingEvent: null,
      currentUsername: "sensei",
      mobileNavigationIds: ["feed", "students"],
    });

    expect(items.map(({ to }) => to)).toEqual(["/", "/futures", "/community", "/students", "/more"]);
    expect(items.filter(({ isActive }) => isActive).map(({ name }) => name)).toEqual(["더보기"]);
  });

  it("keeps all supported mobile pin IDs and their compact labels", () => {
    const options = getMobileNavigationOptions(guestOptions);

    expect(options.map(({ mobileNavigationId }) => mobileNavigationId)).toEqual([
      "feed",
      "students",
      "events",
      "raids",
      "main-story",
      "furniture-catalog",
      "integrated-planner",
      "pyroxene-planner",
      "student-growth-planner",
      "resource-planner",
      "farming-calculator",
      "event-shop-calculator",
      "relationship-calculator",
      "strategy-timeline",
      "raid-score-calculator",
    ]);
    expect(options.map(({ name }) => name)).toEqual([
      "피드",
      "학생부",
      "이벤트",
      "총력전",
      "메인 스토리",
      "가구 도감",
      "통합 플래너",
      "청휘석 플래너",
      "성장 플래너",
      "재화 플래너",
      "파밍 계산기",
      "상점 계산기",
      "인연 계산기",
      "공략",
      "점수 계산기",
    ]);
  });

  it("projects the exact More groups and keeps coupons visible to guests", () => {
    const guestSections = getMoreNavigationSections(guestOptions);
    const signedInSections = getMoreNavigationSections(signedInOptions);

    expect(guestSections.map(({ name }) => name)).toEqual([
      "게임 정보",
      "플래너·계산기",
      "커뮤니티",
      "소식·도움말",
      "설정",
    ]);
    expect(guestSections.find(({ id }) => id === "game")?.items.map(({ name }) => name)).toEqual([
      "이벤트",
      "총력전 / 대결전",
      "학생부",
      "메인 스토리",
      "가구 도감",
      "쿠폰",
    ]);
    expect(guestSections.find(({ id }) => id === "game")?.items.at(-1)?.to).toBe("/coupons");
    expect(signedInSections.map(({ name }) => name)).toEqual([
      "게임 정보",
      "플래너·계산기",
      "커뮤니티",
      "나의 데이터",
      "소식·도움말",
      "설정",
    ]);
    expect(signedInSections.find(({ id }) => id === "personal")?.items.map(({ name }) => name)).toEqual([
      "프로필",
      "모집한 학생",
      "모집 기록",
      "관심 학생",
      "공략 작성하기",
      "게임 화면 인식기",
      "외부 데이터 연동",
    ]);
    expect(signedInSections.find(({ id }) => id === "settings")?.items.map(({ name }) => name)).toEqual([
      "프로필 편집",
      "알림 설정",
    ]);
  });

  it("keeps the scanner and external data menus separate", () => {
    for (const pathname of ["/scanner/resource", "/scanner/student"]) {
      const catalog = getNavigationCatalog({ ...signedInOptions, pathname });
      expect(catalog.find(({ menuId }) => menuId === "screen-scanner")).toMatchObject({
        to: "/scanner/resource",
        name: "게임 화면 인식기",
        isActive: true,
        requiresSignIn: true,
      });
      expect(catalog.find(({ menuId }) => menuId === "external-data")?.isActive).toBe(false);
    }

    for (const pathname of ["/connect/import", "/connect/export"]) {
      const catalog = getNavigationCatalog({ ...signedInOptions, pathname });
      expect(catalog.find(({ menuId }) => menuId === "external-data")).toMatchObject({
        to: "/connect/import",
        name: "외부 데이터 연동",
        isActive: true,
        requiresSignIn: true,
      });
      expect(catalog.find(({ menuId }) => menuId === "screen-scanner")?.isActive).toBe(false);
    }
  });

  it("resolves saved IDs for moved account entries and the scanner and external data menus", () => {
    const items = getAvailableNavigationFavorites(
      ["profile", "notifications", "connect-import", "scanner-resource", "news", "contact"],
      getNavigationFavoriteItems(signedInOptions),
    );

    expect(items.map(({ favoriteId, name, to }) => [favoriteId, name, to])).toEqual([
      ["profile", "프로필", "/@sensei"],
      ["notifications", "알림 설정", "/notifications"],
      ["connect-import", "외부 데이터 연동", "/connect/import"],
      ["scanner-resource", "게임 화면 인식기", "/scanner/resource"],
      ["news", "업데이트 소식", "/news"],
      ["contact", "제안/문의", "/contact"],
    ]);
  });

  it("respects sign-in requirements in shared search and adds personal routes only for a signed-in user", () => {
    const guestItems = getSearchableMenuItems();
    const signedInItems = getSearchableMenuItems({ currentUsername: "sensei" });

    expect(guestItems.some(({ requiresSignIn }) => requiresSignIn)).toBe(false);
    expect(guestItems.some(({ to }) => to === "/unauthorized")).toBe(false);
    expect(guestItems).toEqual(expect.arrayContaining([expect.objectContaining({ name: "이벤트", to: "/events" })]));
    expect(signedInItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "profile", name: "프로필", to: "/@sensei" }),
        expect.objectContaining({ id: "my-students", name: "모집한 학생", to: "/@sensei/students" }),
        expect.objectContaining({ id: "my-walkthroughs", name: "공략 작성하기", to: "/@sensei/timelines" }),
        expect.objectContaining({ id: "farming-calculator", name: "파밍 계산기", to: "/utils/resources/farming" }),
        expect.objectContaining({ id: "screen-scanner", name: "게임 화면 인식기", to: "/scanner/resource" }),
        expect.objectContaining({ id: "external-data", name: "외부 데이터 연동", to: "/connect/import" }),
        expect.objectContaining({ id: "notifications", name: "알림 설정", to: "/notifications" }),
      ]),
    );
    expect(signedInItems.map(({ id }) => id).indexOf("community-timelines")).toBeLessThan(
      signedInItems.map(({ id }) => id).indexOf("profile"),
    );
    expect(signedInItems.map(({ id }) => id).indexOf("profile")).toBeLessThan(
      signedInItems.map(({ id }) => id).indexOf("news"),
    );
  });

  it("keeps saved planner favorites on the inventory page and activates farming separately", () => {
    const options = getNavigationFavoriteItems(signedInOptions);
    const resourceFavorite = getAvailableNavigationFavorites(["resource-planner"], options);
    const inventoryItem = getNavigationCatalog({
      ...signedInOptions,
      pathname: "/utils/resources/inventory",
    }).find(({ menuId }) => menuId === "resource-planner");
    const farmingItem = getNavigationCatalog({
      ...signedInOptions,
      pathname: "/utils/resources/farming",
    }).find(({ menuId }) => menuId === "farming-calculator");

    expect(resourceFavorite.map(({ name, to }) => [name, to])).toEqual([["재화 플래너", "/utils/resources/inventory"]]);
    expect(inventoryItem?.isActive).toBe(true);
    expect(farmingItem?.isActive).toBe(true);
    expect(
      getNavigationCatalog({ ...signedInOptions, pathname: "/utils/resources/farming" }).find(
        ({ menuId }) => menuId === "resource-planner",
      )?.isActive,
    ).toBe(false);
  });

  it("activates the profile menu only on the signed-in owner's root, including a trailing slash", () => {
    for (const pathname of ["/@sensei", "/@sensei/"]) {
      const profile = getNavigationCatalog({ ...signedInOptions, pathname }).find(({ menuId }) => menuId === "profile");
      expect(profile?.isActive).toBe(true);
    }
    expect(
      getNavigationCatalog({ ...signedInOptions, pathname: "/@other" }).find(({ menuId }) => menuId === "profile")
        ?.isActive,
    ).toBe(false);
    expect(
      getNavigationCatalog({ ...signedInOptions, pathname: "/@sensei/students" }).find(
        ({ menuId }) => menuId === "profile",
      )?.isActive,
    ).toBe(false);
  });

  it("keeps automatic states while applying manual label and dot modes independently", () => {
    const catalog = getNavigationCatalog({
      ...signedInOptions,
      hasOngoingRaid: true,
      hasUnconsumedCoupons: true,
      hasRecentNews: true,
      hasUnreadFeedbackReplies: true,
      menuBadgeOverrides: {
        "integrated-planner": {
          menuId: "integrated-planner",
          labelMode: "custom",
          label: "새 달력",
          redDotMode: "show",
        },
        "ap-planner": { menuId: "ap-planner", labelMode: "custom", label: "새 기능", redDotMode: "show" },
        raids: { menuId: "raids", labelMode: "custom", label: "새 시즌", redDotMode: "hidden" },
        coupons: { menuId: "coupons", labelMode: "auto", label: null, redDotMode: "hidden" },
        news: { menuId: "news", labelMode: "hidden", label: null, redDotMode: "show" },
      },
    });
    const itemById = new Map(catalog.flatMap((item) => (item.menuId ? [[item.menuId, item] as const] : [])));

    expect(itemById.get("integrated-planner")).toMatchObject({ badgeLabel: "새 달력", showRedDot: true });
    expect(itemById.get("ap-planner")).toMatchObject({ badgeLabel: "새 기능", showRedDot: true });
    expect(itemById.get("raids")).toMatchObject({ badgeLabel: "새 시즌", showRedDot: false });
    expect(itemById.get("coupons")).toMatchObject({ badgeLabel: undefined, showRedDot: false });
    expect(itemById.get("news")).toMatchObject({ badgeLabel: undefined, showRedDot: true });
    expect(itemById.get("contact")).toMatchObject({ showRedDot: true });
    expect(catalog.find(({ to }) => to === "/notifications")?.showRedDot).toBeUndefined();
  });

  it("does not keep the retired hard-coded labels or notification dot", () => {
    const catalog = getNavigationCatalog({ ...signedInOptions, hasRecentNews: false, hasUnreadFeedbackReplies: false });

    expect(catalog.some(({ badgeLabel }) => badgeLabel === "v1.2" || badgeLabel === "베타")).toBe(false);
    expect(catalog.find(({ to }) => to === "/notifications")?.showRedDot).toBeUndefined();
    expect(catalog.find(({ to }) => to === "/utils/pyroxene")?.badgeLabel).toBeUndefined();
    expect(catalog.find(({ to }) => to === "/raids")?.badgeLabel).toBeUndefined();
  });

  it("keeps automatic raid and guest-planner labels", () => {
    const activeRaid = getDesktopNavigation({ ...guestOptions, hasOngoingRaid: true });
    const raidItem = activeRaid.groups.find(({ id }) => id === "game")?.items.find(({ to }) => to === "/raids");
    const guestPlanner = getDesktopNavigation(guestOptions)
      .groups.find(({ id }) => id === "planner")
      ?.items.find(({ to }) => to === "/utils/pyroxene");

    expect(raidItem?.badgeLabel).toBe("진행중");
    expect(guestPlanner?.badgeLabel).toBe("로그인 없이 사용");
  });
});
