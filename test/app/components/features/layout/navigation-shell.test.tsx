import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider, useMatches } from "react-router";
import NavigationBar, { NavigationFavoriteEmptyHint } from "~/components/features/layout/NavigationBar";
import type { DesktopNavigationExpandedGroups } from "~/domain/desktop-navigation-preference";

function renderNavigation(
  pathname: string,
  collapsed?: boolean,
  username: string | null = null,
  hasUnconsumedCoupons = false,
  expandedGroups?: DesktopNavigationExpandedGroups,
  favoriteNavigationIds: string[] = [],
): string {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <NavigationBar
            currentUsername={username}
            currentProfileStudentId={null}
            favoriteNavigationIds={favoriteNavigationIds}
            mobileNavigationIds={["feed", "students"]}
            desktopNavigationCollapsed={collapsed}
            desktopNavigationExpandedGroups={expandedGroups}
            darkMode={false}
            setDarkMode={() => undefined}
            upcomingEvent={null}
            hasRecentNews={false}
            hasOngoingRaid={false}
            hasUnconsumedCoupons={hasUnconsumedCoupons}
            hasUnreadFeedbackReplies={false}
            unreadNotificationCount={0}
            menuBadgeOverrides={{}}
            siteBanner={null}
          />
        ),
      },
    ],
    { initialEntries: [pathname] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function renderProfileRootNavigation(pathname: string): string {
  function NavigationLayout() {
    return (
      <>
        <NavigationBar
          currentUsername="hellodhlyn"
          currentProfileStudentId={null}
          favoriteNavigationIds={[]}
          mobileNavigationIds={["feed", "students"]}
          desktopNavigationCollapsed={false}
          desktopNavigationExpandedGroups={undefined}
          darkMode={false}
          setDarkMode={() => undefined}
          upcomingEvent={null}
          hasRecentNews={false}
          hasOngoingRaid={false}
          hasUnconsumedCoupons={false}
          hasUnreadFeedbackReplies={false}
          unreadNotificationCount={0}
          menuBadgeOverrides={{}}
          siteBanner={null}
        />
        <Outlet />
      </>
    );
  }

  function MatchPathnameProbe() {
    const matches = useMatches();
    return <output data-last-match-pathname={matches[matches.length - 1]?.pathname} />;
  }

  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <NavigationLayout />,
        children: [{ path: ":username", children: [{ index: true, element: <MatchPathnameProbe /> }] }],
      },
    ],
    { initialEntries: [pathname] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("desktop navigation shell rendering", () => {
  it("renders the shared expanded and rail structures from the new catalog", () => {
    const html = renderNavigation("/students");

    expect(html).toContain('data-desktop-navigation-mode="auto"');
    expect(html).toContain('data-navigation-variant="expanded"');
    expect(html).toContain('data-navigation-variant="rail"');
    expect(html).toContain("게임 정보");
    expect(html).toContain("플래너·계산기");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("플래너 & 계산기");
    expect(html).not.toContain("컨텐츠");
  });

  it("renders an explicit saved collapsed preference into the first server render", () => {
    const html = renderNavigation("/students", true);

    expect(html).toContain('data-desktop-navigation-mode="collapsed"');
  });

  it("starts all collapsible groups expanded and excludes favorites from group controls", () => {
    const html = renderNavigation("/@sensei/students", false, "sensei");

    expect(html).not.toContain('id="desktop-navigation-group-favorites"');
    expect(html).not.toContain('aria-controls="desktop-navigation-group-favorites"');
    expect(html).toContain('aria-expanded="true" aria-controls="desktop-navigation-group-game"');
    expect(html).toContain('aria-expanded="true" aria-controls="desktop-navigation-group-planner"');
    expect(html).toContain('aria-expanded="true" aria-controls="desktop-navigation-group-community"');
    expect(html).toContain('aria-expanded="true" aria-controls="desktop-navigation-group-personal"');
    expect(html).toContain('aria-expanded="true" aria-controls="desktop-navigation-group-news"');
    expect(html).not.toContain('id="desktop-navigation-group-game" hidden');
  });

  it("omits the empty favorites group so Game info follows Home with section spacing", () => {
    const html = renderNavigation("/students");
    const expandedNav = html.match(/<nav aria-label="데스크톱 주요 메뉴"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const homeIndex = expandedNav.indexOf('aria-label="홈"');
    const favoritesGroupIndex = expandedNav.indexOf('<ul aria-label="즐겨찾기"');
    const gameGroupIndex = expandedNav.indexOf('aria-controls="desktop-navigation-group-game"');

    expect(homeIndex).toBeGreaterThanOrEqual(0);
    expect(favoritesGroupIndex).toBe(-1);
    expect(gameGroupIndex).toBeGreaterThan(homeIndex);
    expect(expandedNav).not.toContain("☆를 눌러 즐겨찾기에 추가");
    expect(expandedNav).toContain('<section class="mt-4"><button type="button" class="flex min-h-7');
  });

  it("renders saved favorites as normal menu rows under Home in saved order", () => {
    const html = renderNavigation("/students", false, null, true, undefined, ["students", "coupons"]);
    const expandedNav = html.match(/<nav aria-label="데스크톱 주요 메뉴"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const homeIndex = expandedNav.indexOf('aria-label="홈"');
    const favoritesGroupIndex = expandedNav.indexOf('<ul aria-label="즐겨찾기"');
    const firstFavoriteIndex = expandedNav.indexOf('aria-label="학생부"');
    const secondFavoriteIndex = expandedNav.indexOf('href="/coupons"');

    expect(homeIndex).toBeGreaterThanOrEqual(0);
    expect(homeIndex).toBeLessThan(favoritesGroupIndex);
    expect(favoritesGroupIndex).toBeLessThan(firstFavoriteIndex);
    expect(firstFavoriteIndex).toBeLessThan(secondFavoriteIndex);
    expect(expandedNav).toContain('aria-label="학생부 즐겨찾기에서 제거" aria-pressed="true"');
    expect(expandedNav).toContain('aria-label="쿠폰, 새 항목 있음"');
    expect(expandedNav).not.toContain("☆를 눌러 즐겨찾기에 추가");
  });

  it("keeps a favorited route active in its catalog group but inactive in favorites", () => {
    const html = renderNavigation("/students", false, null, false, undefined, ["students"]);
    const expandedNav = html.match(/<nav aria-label="데스크톱 주요 메뉴"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const studentRows = [...expandedNav.matchAll(/<a\b[^>]*href="\/students"[^>]*>/g)].map(([anchor]) => anchor);

    expect(studentRows).toHaveLength(2);
    expect(studentRows[0]).not.toContain('aria-current="page"');
    expect(studentRows[1]).toContain('aria-current="page"');
  });

  it("keeps the exact favorites-empty copy and row classes in the rail flyout", () => {
    const html = renderToStaticMarkup(<NavigationFavoriteEmptyHint />);

    expect(html).toBe('<p class="px-2 py-2 text-xs text-muted-foreground">☆를 눌러 즐겨찾기에 추가</p>');
  });

  it("respects saved collapse choices for non-favorites groups", () => {
    const html = renderNavigation("/@sensei/students", false, "sensei", false, {
      game: false,
      community: false,
    });

    expect(html).toContain('aria-expanded="false" aria-controls="desktop-navigation-group-game"');
    expect(html).toContain('aria-expanded="false" aria-controls="desktop-navigation-group-community"');
    expect(html).toContain('aria-expanded="true" aria-controls="desktop-navigation-group-planner"');
    expect(html).not.toMatch(/<button[^>]*aria-controls="desktop-navigation-group-favorites"/);
  });

  it("uses the specified compact expanded-menu spacing and rail pitch", () => {
    const html = renderNavigation("/@sensei/students", true, "sensei");

    expect(html).toContain('class="mt-4"');
    expect(html).toContain("min-h-6.5 min-w-0 items-center rounded-md px-2 text-xs transition-colors");
    expect(html).toContain("min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs");
    expect(html).toContain('class="mt-1 space-y-0.5"');
    expect(html).toContain("gap-1.5 overflow-y-auto px-1.5 py-2");
    expect(html).toContain("min-h-12 w-full flex-col items-center");
  });

  it("uses compact text only for the named expanded navigation elements", () => {
    const html = renderNavigation("/@sensei/students", false, "sensei");
    const desktopSearchInput = html.match(/<input type="search"[^>]*aria-label="전역 검색"[^>]*>/)?.[0];

    expect(html).toContain("px-2 text-xs transition-colors");
    expect(html).toContain("px-2 text-left text-xs font-semibold");
    expect(desktopSearchInput).toContain("text-xs");
    expect(desktopSearchInput).toContain("placeholder:text-muted-foreground/70");
  });

  it("uses the rectangular brand mark in the rail while leaving the expanded logo intact", () => {
    const html = renderNavigation("/students", true);

    expect(html).toContain('src="/mollulog-rectangle-light.png"');
    expect(html).toContain('class="h-7 w-14 object-contain"');
    expect(html).toContain('src="/mollulog-full-light.png"');
  });

  it("renders auto-mode toggle controls with first-paint states for each CSS-selected variant", () => {
    const html = renderNavigation("/students");
    const expandedToggleStart = html.indexOf('data-navigation-toggle-variant="expanded"');
    const railToggleStart = html.indexOf('data-navigation-toggle-variant="rail"');
    const expandedToggle = html.slice(html.lastIndexOf("<button", expandedToggleStart), html.indexOf("</button>", expandedToggleStart));
    const railToggle = html.slice(html.lastIndexOf("<button", railToggleStart), html.indexOf("</button>", railToggleStart));

    expect(expandedToggle).toContain('aria-expanded="true"');
    expect(expandedToggle).toContain('title="메뉴 접기"');
    expect(railToggle).toContain('aria-expanded="false"');
    expect(railToggle).toContain('title="메뉴 펼치기"');
  });

  it("anchors the active rail group's red-dot summary to the icon corner", () => {
    const html = renderNavigation("/students", true, null, true);

    expect(html).toContain('aria-label="게임 정보, 새 항목 있음"');
    expect(html).toContain('class="relative flex size-5 items-center justify-center"');
    expect(html).toContain(
      'class="absolute top-0 right-0 size-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive"',
    );
  });

  it("renders signed-in personal navigation and the account/notification triggers", () => {
    const html = renderNavigation("/@sensei/students", false, "sensei");

    expect(html).toContain("나의 데이터");
    expect(html).toContain('aria-label="계정 sensei"');
    expect(html).toContain("읽지 않은 알림 0개");
    expect(html).toContain('aria-label="알림, 읽지 않은 알림 0개, 열기"');
  });

  it.each(["/@hellodhlyn", "/@hellodhlyn/"])(
    "activates only the personal profile row for the profile index match produced by %s",
    (pathname) => {
      const html = renderProfileRootNavigation(pathname);
      const matchedPathname = html.match(/data-last-match-pathname="([^"]+)"/)?.[1];
      const accountTriggers = [...html.matchAll(/<button(?=[^>]*aria-label="계정 hellodhlyn")[^>]*>/g)].map(
        ([trigger]) => trigger,
      );
      const activeProfileRows = [...html.matchAll(/<a(?=[^>]*href="\/@hellodhlyn")(?=[^>]*aria-current="page")[^>]*aria-label="프로필"[^>]*>/g)];
      const activeRailGroupNames = [...html.matchAll(/<button(?=[^>]*bg-background font-bold text-foreground)(?=[^>]*aria-label="([^"]+)")[^>]*>/g)].map(
        ([, accessibleName]) => accessibleName,
      );

      expect(matchedPathname).toBe("/@hellodhlyn/");
      expect(accountTriggers).toHaveLength(2);
      expect(accountTriggers.every((trigger) => !trigger.includes("bg-muted text-foreground"))).toBe(true);
      expect(activeProfileRows).toHaveLength(1);
      expect(activeRailGroupNames).toEqual(["나의 데이터"]);
      expect(html).toContain('aria-label="프로필"');
    },
  );
});
