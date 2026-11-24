import { describe, expect, it } from "@jest/globals";
import { NAVIGATION_ICONS } from "~/components/v2/layout/navigation/navigation-icons";
import {
  getDesktopNavigation,
  getMobileNavigationItems,
  getMobileNavigationOptions,
  getMoreNavigationSections,
  getNavigationCatalog,
  getNavigationFavoriteItems,
  getNavigationGroupBadgeSummary,
  getSearchableMenuItems,
  isAccountNavigationActive,
} from "~/components/v2/layout/navigation/navigation-menu";
import { getAvailableNavigationFavorites } from "~/domain/navigation-favorites";
import { NAVIGATION_MENU_IDS, resolveMenuBadgeOverrides } from "~/domain/navigation-menu-badges";

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
const adminOptions = { ...signedInOptions, isAdmin: true };

describe("global navigation catalog", () => {
  it("keeps the account trigger inactive on the owner's profile root but active on account routes", () => {
    expect(isAccountNavigationActive("/@sensei", "sensei")).toBe(false);
    expect(isAccountNavigationActive("/@sensei/", "sensei")).toBe(false);
    expect(isAccountNavigationActive("/@sensei/friends", "sensei")).toBe(false);
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
      "ai-question": "AI 챗봇",
      "ap-planner": "AP 플래너",
      "resource-planner": "재화 플래너",
      "farming-calculator": "파밍 계산기",
      profile: "프로필",
      "my-students": "모집한 학생",
    });
  });

  it("adds the integrated planner while preserving detailed planner entries", () => {
    const items = getNavigationCatalog(guestOptions);

    expect(items.find((item) => item.to === "/planner")).toMatchObject({
      menuId: "integrated-planner",
      name: "통합 플래너",
      favoriteId: "integrated-planner",
      mobileNavigationId: "integrated-planner",
      OutlineIcon: NAVIGATION_ICONS["integrated-planner"].OutlineIcon,
    });
    expect(items.map((item) => item.to)).toEqual(
      expect.arrayContaining(["/planner", "/utils/pyroxene", "/utils/event-shop"]),
    );
  });

  it("groups recruit recommendations and the chatbot under Arona Intelligence", () => {
    const catalog = getNavigationCatalog({ ...guestOptions, pathname: "/ai/recruit" });
    const aiItems = catalog.filter(({ group }) => group === "ai");

    expect(aiItems.map(({ menuId }) => menuId)).toEqual(["recruit-recommendation", "ai-question"]);
    expect(aiItems[0]).toMatchObject({
      to: "/ai/recruit",
      name: "모집 추천 (β)",
      favoriteId: "recruit-recommendation",
      mobileNavigationId: "recruit-recommendation",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      isActive: true,
    });
    expect(aiItems[0].requiresSignIn).toBeUndefined();
    expect(aiItems[0].requiresAdmin).toBeUndefined();
    const recruitActive = (pathname: string) =>
      getNavigationCatalog({ ...guestOptions, pathname }).find(({ menuId }) => menuId === "recruit-recommendation")
        ?.isActive;
    expect(recruitActive("/ai")).toBe(true);
    expect(recruitActive("/aibot")).toBe(false);
    expect(recruitActive("/chat")).toBe(false);
    expect(getDesktopNavigation(guestOptions).groups.find(({ id }) => id === "ai")?.name).toBe("Arona Intelligence");
  });

  it("shows the chatbot as coming soon to non-admins and opens it only for admins", () => {
    for (const options of [guestOptions, signedInOptions]) {
      const desktopChat = getDesktopNavigation(options)
        .groups.flatMap(({ items }) => items)
        .find(({ to }) => to === "/chat");
      const moreChat = getMoreNavigationSections(options)
        .flatMap(({ items }) => items)
        .find(({ to }) => to === "/chat");
      expect(desktopChat).toMatchObject({ name: "AI 챗봇", disabled: true, badgeLabel: "준비중" });
      expect(moreChat).toMatchObject({ disabled: true, badgeLabel: "준비중" });
      expect(
        getSearchableMenuItems({
          currentUsername: options.isSignedIn ? "sensei" : null,
          isSignedIn: options.isSignedIn,
        }).some(({ to }) => to === "/chat"),
      ).toBe(false);
    }

    const adminChat = getDesktopNavigation(adminOptions)
      .groups.flatMap(({ items }) => items)
      .find(({ to }) => to === "/chat");
    expect(adminChat).toMatchObject({ name: "AI 챗봇", disabled: false, badgeLabel: undefined });
    expect(adminChat?.OutlineIcon).not.toBe(
      getNavigationCatalog(guestOptions).find(({ menuId }) => menuId === "recruit-recommendation")?.OutlineIcon,
    );
    expect(getSearchableMenuItems({ currentUsername: "sensei", isAdmin: true })).toContainEqual(
      expect.objectContaining({ id: "ai-question", to: "/chat" }),
    );
    expect(getMobileNavigationItems(guestOptions)).not.toContainEqual(
      expect.objectContaining({ menuId: "ai-question" }),
    );
  });

  it("exposes the public API screens in the settings group and marks nested pages active", () => {
    const items = getNavigationCatalog({ ...guestOptions, pathname: "/developers/docs" });
    const api = items.find(({ to }) => to === "/developers");

    expect(api).toMatchObject({
      menuId: "mollulog-api",
      name: "개발자 센터",
      group: "settings",
      surfaces: ["account", "more", "search"],
      isActive: true,
    });
    expect(getSearchableMenuItems()).toContainEqual(
      expect.objectContaining({ id: "mollulog-api", name: "개발자 센터", to: "/developers" }),
    );
  });

  it("exposes AP planner as a favoritable sibling utility", () => {
    const planner = getNavigationCatalog(guestOptions).find((item) => item.to === "/utils/ap");

    expect(planner).toMatchObject({ menuId: "ap-planner", name: "AP 플래너", favoriteId: "ap-planner" });
  });

  it("applies the API menu badge saved by admin to the more navigation", () => {
    const { overrides, warnings } = resolveMenuBadgeOverrides([
      { menuId: "mollulog-api", labelMode: "custom", label: "베타", redDotMode: "show", startsAt: null, endsAt: null },
    ]);
    expect(warnings).toEqual([]);
    const options = { ...guestOptions, menuBadgeOverrides: overrides };
    const more = getMoreNavigationSections(options).find(({ id }) => id === "settings");
    expect(more?.items.find(({ to }) => to === "/developers")).toMatchObject({
      menuId: "mollulog-api",
      name: "개발자 센터",
      badgeLabel: "베타",
      dot: "attention",
    });
    expect(getNavigationCatalog(guestOptions).find(({ to }) => to === "/developers")).toMatchObject({
      badgeLabel: undefined,
      dot: undefined,
    });
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

    // A signed-out visitor has no 나의 데이터 group, because every item in it needs a sign-in.
    expect(desktop.groups.map(({ name }) => name)).toEqual([
      "게임 정보",
      "플래너·계산기",
      "Arona Intelligence",
      "커뮤니티",
      "소식·도움말",
    ]);
    expect(desktop.groups.map(({ id }) => id)).toEqual(["game", "planner", "ai", "community", "news"]);
    expect(desktop.groups.flatMap(({ name }) => [name])).not.toEqual(
      expect.arrayContaining(["컨텐츠", "플래너 & 계산기", "게임 외 정보", "내 정보", "서비스"]),
    );

    const signedIn = getDesktopNavigation(signedInOptions);
    expect(signedIn.groups.map(({ name }) => name)).toEqual([
      "게임 정보",
      "플래너·계산기",
      "Arona Intelligence",
      "커뮤니티",
      "나의 데이터",
      "소식·도움말",
    ]);
    expect(signedIn.groups.find(({ id }) => id === "personal")?.items.map(({ to }) => to)).toEqual([
      "/@sensei",
      "/@sensei/students",
      "/@sensei/pickups",
      "/@sensei/raids",
      "/scanner",
    ]);
    expect(signedIn.groups.find(({ id }) => id === "community")?.items.map(({ to }) => to)).toEqual([
      "/community",
      "/timelines",
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
      "/products/recruit-tickets",
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
    expect(itemsByGroup.ai).toEqual(["/ai/recruit", "/chat"]);
    expect(itemsByGroup.community).toEqual(["/community", "/timelines"]);
    expect(itemsByGroup.personal).toBeUndefined();
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
      "recruit-recommendation",
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
      "모집 추천 (β)",
    ]);
  });

  it("projects the More groups with the chatbot as coming soon to non-admins", () => {
    const guestSections = getMoreNavigationSections(guestOptions);
    const signedInSections = getMoreNavigationSections(signedInOptions);
    const adminSections = getMoreNavigationSections(adminOptions);

    expect(guestSections.map(({ name }) => name)).toEqual([
      "게임 정보",
      "플래너·계산기",
      "Arona Intelligence",
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
      "상품 / 패키지",
      "쿠폰",
    ]);
    expect(guestSections.find(({ id }) => id === "ai")?.items.map(({ to, disabled }) => [to, disabled])).toEqual([
      ["/ai/recruit", undefined],
      ["/chat", true],
    ]);
    expect(signedInSections.find(({ id }) => id === "ai")?.items.at(-1)).toMatchObject({ to: "/chat", disabled: true });
    expect(adminSections.find(({ id }) => id === "ai")?.items.at(-1)).toMatchObject({ to: "/chat", disabled: false });
    expect(signedInSections.map(({ name }) => name)).toEqual([
      "게임 정보",
      "플래너·계산기",
      "Arona Intelligence",
      "커뮤니티",
      "나의 데이터",
      "소식·도움말",
      "설정",
    ]);
    expect(signedInSections.find(({ id }) => id === "personal")?.items.map(({ name }) => name)).toEqual([
      "프로필",
      "모집한 학생",
      "모집 기록",
      "총력전·대결전 기록",
      "화면 인식·데이터 연동",
    ]);
    expect(signedInSections.find(({ id }) => id === "community")?.items.map(({ name }) => name)).toEqual([
      "피드",
      "공략/타임라인",
    ]);
    expect(signedInSections.find(({ id }) => id === "settings")?.items.map(({ name }) => name)).toEqual([
      "프로필 편집",
      "알림 설정",
      "개발자 센터",
    ]);
  });

  it.each([
    "/scanner",
    "/scanner/resource",
    "/scanner/student",
    "/connect/import",
    "/connect/export",
    "/data-history",
  ])("activates the single screen recognition and data connection entry at %s", (pathname) => {
    const catalog = getNavigationCatalog({ ...signedInOptions, pathname });
    expect(catalog.find(({ menuId }) => menuId === "screen-scanner")).toMatchObject({
      to: "/scanner",
      name: "화면 인식·데이터 연동",
      group: "personal",
      isActive: true,
      requiresSignIn: true,
    });
    expect(catalog.some(({ menuId }) => (menuId as string) === "external-data")).toBe(false);
  });

  it("does not activate the entry on unrelated or lookalike paths", () => {
    for (const pathname of ["/scanners", "/connection", "/data-history-x", "/@sensei", "/developers"]) {
      const catalog = getNavigationCatalog({ ...signedInOptions, pathname });
      expect(catalog.find(({ menuId }) => menuId === "screen-scanner")?.isActive).toBe(false);
    }
  });

  it("removes the favorite students menu from the catalog", () => {
    const catalog = getNavigationCatalog(signedInOptions);
    expect(catalog.some(({ menuId }) => menuId === ("favorite-students" as never))).toBe(false);
    expect(catalog.some(({ to }) => to === "/@sensei/futures")).toBe(false);
  });

  it("resolves saved IDs for moved account entries and merges the former scanner and import favorites", () => {
    const items = getAvailableNavigationFavorites(
      ["profile", "notifications", "connect-import", "scanner-resource", "news", "contact"],
      getNavigationFavoriteItems(signedInOptions),
    );

    expect(items.map(({ favoriteId, name, to }) => [favoriteId, name, to])).toEqual([
      ["profile", "프로필", "/@sensei"],
      ["notifications", "알림 설정", "/notifications"],
      ["connect-import", "화면 인식·데이터 연동", "/scanner"],
      ["news", "업데이트 소식", "/news"],
      ["contact", "제안/문의", "/contact"],
    ]);
  });

  it("respects sign-in requirements in shared search and adds personal routes only for a signed-in user", () => {
    const guestItems = getSearchableMenuItems();
    const signedInItems = getSearchableMenuItems({ currentUsername: "sensei" });
    const adminItems = getSearchableMenuItems({ currentUsername: "sensei", isAdmin: true });

    expect(guestItems.some(({ requiresSignIn }) => requiresSignIn)).toBe(false);
    expect(guestItems.some(({ to }) => to === "/chat")).toBe(false);
    expect(signedInItems.some(({ to }) => to === "/chat")).toBe(false);
    expect(adminItems).toContainEqual(expect.objectContaining({ id: "ai-question", to: "/chat" }));
    expect(guestItems).toContainEqual(expect.objectContaining({ id: "recruit-recommendation", to: "/ai/recruit" }));
    expect(guestItems.some(({ to }) => to === "/unauthorized")).toBe(false);
    expect(guestItems).toEqual(expect.arrayContaining([expect.objectContaining({ name: "이벤트", to: "/events" })]));
    expect(signedInItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "profile", name: "프로필", to: "/@sensei" }),
        expect.objectContaining({ id: "my-students", name: "모집한 학생", to: "/@sensei/students" }),
        expect.objectContaining({ id: "mollulog-api", name: "개발자 센터", to: "/developers" }),
        expect.objectContaining({ id: "farming-calculator", name: "파밍 계산기", to: "/utils/resources/farming" }),
        expect.objectContaining({ id: "screen-scanner", name: "화면 인식·데이터 연동", to: "/scanner" }),
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

  it("activates the products menu on every products page and nowhere else", () => {
    const isActive = (pathname: string) =>
      getNavigationCatalog({ ...guestOptions, pathname }).find(({ menuId }) => menuId === "products")?.isActive;
    expect(isActive("/products")).toBe(true);
    expect(isActive("/products/recruit-tickets")).toBe(true);
    expect(isActive("/productsx")).toBe(false);
    expect(isActive("/coupons")).toBe(false);
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

    expect(itemById.get("integrated-planner")).toMatchObject({ badgeLabel: "새 달력", dot: "attention" });
    expect(itemById.get("ap-planner")).toMatchObject({ badgeLabel: "새 기능", dot: "attention" });
    expect(itemById.get("raids")).toMatchObject({ badgeLabel: "새 시즌", dot: undefined });
    // The operator's red-dot "hidden" never hides the user's own account dot.
    expect(itemById.get("coupons")).toMatchObject({ badgeLabel: undefined, dot: "account" });
    expect(itemById.get("news")).toMatchObject({ badgeLabel: undefined, dot: "attention" });
    expect(itemById.get("contact")).toMatchObject({ dot: "account" });
    expect(catalog.find(({ to }) => to === "/notifications")?.dot).toBeUndefined();
  });

  it("does not keep the retired hard-coded labels or notification dot", () => {
    const catalog = getNavigationCatalog({ ...signedInOptions, hasRecentNews: false, hasUnreadFeedbackReplies: false });

    expect(catalog.some(({ badgeLabel }) => badgeLabel === "v1.2" || badgeLabel === "베타")).toBe(false);
    expect(catalog.find(({ to }) => to === "/notifications")?.dot).toBeUndefined();
    expect(catalog.find(({ to }) => to === "/utils/pyroxene")?.badgeLabel).toBeUndefined();
    expect(catalog.find(({ to }) => to === "/raids")?.badgeLabel).toBeUndefined();
  });

  it("marks coupons and contact replies as account dots and recent news as an attention dot", () => {
    const catalog = getNavigationCatalog({
      ...signedInOptions,
      hasUnconsumedCoupons: true,
      hasRecentNews: true,
      hasUnreadFeedbackReplies: true,
    });
    const dotByMenuId = new Map(catalog.flatMap((item) => (item.menuId ? [[item.menuId, item.dot] as const] : [])));

    expect(dotByMenuId.get("coupons")).toBe("account");
    expect(dotByMenuId.get("contact")).toBe("account");
    expect(dotByMenuId.get("news")).toBe("attention");
  });

  it("summarizes a group with mixed dots as an attention dot", () => {
    const catalog = getNavigationCatalog({ ...signedInOptions, hasRecentNews: true, hasUnreadFeedbackReplies: true });
    const newsGroup = catalog.filter((item) => item.group === "news");
    const accountOnly = catalog.filter((item) => item.menuId === "contact" || item.menuId === "coupons");

    expect(getNavigationGroupBadgeSummary(newsGroup)).toBe("attention");
    expect(getNavigationGroupBadgeSummary(accountOnly)).toBe("account");
    expect(getNavigationGroupBadgeSummary(catalog.filter((item) => item.menuId === "home"))).toBeUndefined();
  });

  it("keeps the automatic raid label and no guest-planner label", () => {
    const activeRaid = getDesktopNavigation({ ...guestOptions, hasOngoingRaid: true });
    const raidItem = activeRaid.groups.find(({ id }) => id === "game")?.items.find(({ to }) => to === "/raids");
    const guestPlanner = getDesktopNavigation(guestOptions)
      .groups.find(({ id }) => id === "planner")
      ?.items.find(({ to }) => to === "/utils/pyroxene");

    expect(raidItem?.badgeLabel).toBe("진행중");
    expect(guestPlanner?.badgeLabel).toBeUndefined();
  });
});
