import { XMarkIcon } from "@heroicons/react/16/solid";
import {
  CalendarIcon as CalendarIconOutline,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  RectangleGroupIcon as RectangleGroupIconOutline,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useFetcher, useLocation, useMatches, useSubmit } from "react-router";
import { ProfileImage } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { DEFAULT_MOBILE_NAVIGATION_IDS, type MobileNavigationPair } from "~/domain/mobile-navigation";
import {
  normalizeDesktopNavigationExpandedGroups,
  type DesktopNavigationExpandedGroups,
  type DesktopNavigationPreferenceGroupId,
} from "~/domain/desktop-navigation-preference";
import type { NavigationMenuId, ResolvedMenuBadgeOverride } from "~/domain/navigation-menu-badges";
import {
  getAvailableNavigationFavorites,
  normalizeNavigationFavoriteIds,
  toggleNavigationFavoriteId,
} from "~/domain/navigation-favorites";
import type { SiteBanner as SiteBannerData } from "~/domain/site-banner";
import { parseUtcTimestamp, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { timelineContentTypeLocale } from "~/locales/ko";
import { studentImageUrl } from "~/models/assets";
import { submitPreference } from "~/routes/api.preference";
import type { SearchResponse, SearchResult } from "~/routes/api.search";
import { mobileNavigationTutorialStorageKey } from "./mobile-navigation-tutorial";
import NotificationHistoryPopover from "./NotificationHistoryPopover";
import { NavigationAccountPopover } from "./NavigationAccountPopover";
import { NavigationFlyout } from "./NavigationFlyout";
import { NavigationFavoriteMenuRow, NavigationMenuRow } from "./NavigationMenuRow";
import { NavigationRail, type NavigationRailGroup } from "./NavigationRail";
import {
  getAccountNavigationActions,
  getDesktopNavigation,
  getMobileNavigationItems,
  getNavigationFavoriteItems,
  getNavigationGroupBadgeSummary,
  isAccountNavigationActive,
  NAVIGATION_GROUPS,
  type NavigationItem,
} from "./navigation-menu";
import { SiteBanner, shouldRenderGlobalSiteBanner } from "./SiteBanner";

type NavigationBarProps = {
  currentUsername: string | null;
  currentProfileStudentId: string | null;
  favoriteNavigationIds: string[];
  mobileNavigationIds: MobileNavigationPair;
  desktopNavigationCollapsed?: boolean;
  desktopNavigationExpandedGroups?: DesktopNavigationExpandedGroups;
  darkMode: boolean;
  setDarkMode: (fn: (prev: boolean) => boolean) => void;
  upcomingEvent: { uid: string; since: UtcIsoString; until: UtcIsoString } | null;
  hasRecentNews: boolean;
  hasOngoingRaid: boolean;
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
  unreadNotificationCount: number;
  menuBadgeOverrides: Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>>;
  siteBanner: SiteBannerData | null;
};

type NavigationSearchVariant = "desktop" | "mobile" | "rail";

const FAVORITES_EMPTY_HINT = "☆를 눌러 즐겨찾기에 추가";

export function NavigationFavoriteEmptyHint() {
  return <p className="px-2 py-2 text-xs text-muted-foreground">{FAVORITES_EMPTY_HINT}</p>;
}

function NavigationSearch({ variant }: { variant: NavigationSearchVariant }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher<SearchResponse>();
  const fetcherLoad = fetcher.load;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  useEffect(() => {
    if (variant === "mobile" || variant === "rail") {
      inputRef.current?.focus();
    }
  }, [variant]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      return;
    }

    fetcherLoad(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
    setIsPopupOpen(true);
  }, [debouncedQuery, fetcherLoad]);

  useEffect(() => {
    if (!isPopupOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsPopupOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && variant !== "rail") {
        setIsPopupOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isPopupOpen, variant]);

  const results = fetcher.data?.results ?? [];
  const hasQuery = Boolean(query.trim());
  const showPopup = Boolean(isPopupOpen && (!hasQuery || fetcher.data));
  const isLoading = fetcher.state !== "idle";

  const inputClassName = cn(
    "w-full rounded-md bg-background py-2 pr-3 pl-9 text-foreground outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/30",
    variant === "desktop" ? "text-xs" : "text-sm",
  );

  return (
    <div ref={rootRef} className={variant === "mobile" ? "relative w-full" : "relative"}>
      <div className="pointer-events-none absolute left-2.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground">
        {isLoading ? (
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : (
          <MagnifyingGlassIcon className="size-4" strokeWidth={2} />
        )}
      </div>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="검색"
        className={inputClassName}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsPopupOpen(true);
        }}
        onFocus={() => {
          setIsPopupOpen(true);
        }}
        aria-label="전역 검색"
      />

      {showPopup && (
        <SearchResultPopup
          results={results}
          isEmpty={!hasQuery}
          onResultClick={() => setIsPopupOpen(false)}
          className={
            variant === "rail"
              ? "relative -mx-2 mt-2 max-h-[calc(100dvh-8rem)] w-96 overflow-y-auto"
              : variant === "desktop"
                ? "absolute top-full left-0 z-layer-navigation-menu mt-1 w-96 overflow-hidden popover-surface"
                : "absolute top-full left-0 right-0 z-layer-navigation-menu mt-1 overflow-hidden popover-surface"
          }
        />
      )}
    </div>
  );
}

function SearchResultPopup({
  results,
  isEmpty,
  onResultClick,
  className,
}: {
  results: SearchResult[];
  isEmpty: boolean;
  onResultClick: () => void;
  className: string;
}) {
  return (
    <div className={className}>
      {isEmpty ? (
        <SearchEmptyView />
      ) : results.length > 0 ? (
        results.map((result) => (
          <Link
            key={`${result.type}:${result.to}`}
            to={result.to}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            onClick={onResultClick}
          >
            <SearchResultBadge result={result} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">{getSearchResultLabel(result)}</div>
              <div className="whitespace-pre-line">{result.name}</div>
            </div>
          </Link>
        ))
      ) : (
        <p className="px-3 py-3 text-sm text-muted-foreground">결과가 없어요</p>
      )}
    </div>
  );
}

function SearchEmptyView() {
  return (
    <div className="px-4 py-4 text-center text-sm">
      <div className="mx-auto flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <MagnifyingGlassIcon className="size-4" strokeWidth={2} />
      </div>
      <p className="mt-2 font-medium text-foreground">학생, 이벤트, 기능을 검색할 수 있어요</p>
      <p className="mt-1 text-xs text-muted-foreground">검색어를 입력해 원하는 항목을 찾아보세요</p>
    </div>
  );
}

function SearchResultBadge({ result }: { result: SearchResult }) {
  if (result.type === "student") {
    return (
      <img
        src={studentImageUrl(result.uid)}
        alt=""
        className="size-6 shrink-0 rounded-md bg-muted object-cover object-center dark:opacity-90"
        loading="lazy"
      />
    );
  }

  const Icon = result.type === "menu" ? RectangleGroupIconOutline : CalendarIconOutline;

  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}

function getSearchResultLabel(result: SearchResult): string {
  if (result.type === "menu") {
    return "기능";
  }

  if (result.type === "student") {
    return "학생";
  }

  return `${timelineContentTypeLocale[result.contentType]} · ${parseUtcTimestamp(result.startAt).format("YYYY-MM-DD")}`;
}

function useNavigationFavorites(initialFavoriteIds: string[]) {
  const [favoriteIds, setFavoriteIds] = useState(() => normalizeNavigationFavoriteIds(initialFavoriteIds));
  const favoriteIdsRef = useRef(favoriteIds);
  const pendingFavoriteIdsRef = useRef<string[] | null>(null);
  const isPersistingRef = useRef(false);

  const flushPendingFavoriteIds = () => {
    if (isPersistingRef.current || pendingFavoriteIdsRef.current === null) {
      return;
    }

    const favoriteNavigationIds = pendingFavoriteIdsRef.current;
    pendingFavoriteIdsRef.current = null;
    isPersistingRef.current = true;

    void fetch("/api/preference", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoriteNavigationIds }),
    })
      .catch(() => undefined)
      .finally(() => {
        isPersistingRef.current = false;
        flushPendingFavoriteIds();
      });
  };

  const toggleFavorite = (favoriteId: string) => {
    const nextFavoriteIds = toggleNavigationFavoriteId(favoriteIdsRef.current, favoriteId);
    favoriteIdsRef.current = nextFavoriteIds;
    pendingFavoriteIdsRef.current = nextFavoriteIds;
    setFavoriteIds(nextFavoriteIds);
    flushPendingFavoriteIds();
  };

  return [favoriteIds, toggleFavorite] as const;
}

export default function NavigationBar({
  currentUsername,
  currentProfileStudentId,
  favoriteNavigationIds,
  mobileNavigationIds,
  desktopNavigationCollapsed,
  desktopNavigationExpandedGroups,
  darkMode,
  setDarkMode,
  upcomingEvent,
  hasRecentNews,
  hasOngoingRaid,
  hasUnconsumedCoupons,
  hasUnreadFeedbackReplies,
  unreadNotificationCount,
  menuBadgeOverrides,
  siteBanner,
}: NavigationBarProps) {
  const matches = useMatches();
  const location = useLocation();
  const pathname = matches[matches.length - 1]?.pathname ?? location.pathname;
  const searchResetKey = `${location.pathname}\n${location.search}`;
  const { showSignIn } = useSignIn();
  const submit = useSubmit();
  const navigationOptions = {
    pathname,
    upcomingEvent,
    hasOngoingRaid,
    hasUnconsumedCoupons,
    isSignedIn: currentUsername !== null,
    currentUsername,
    hasRecentNews,
    hasUnreadFeedbackReplies,
    menuBadgeOverrides,
  };
  const desktopNavigation = getDesktopNavigation(navigationOptions);
  const accountActions = getAccountNavigationActions(navigationOptions);
  const favoriteNavigationItems = getNavigationFavoriteItems(navigationOptions);
  const [localFavoriteNavigationIds, onFavoriteToggle] = useNavigationFavorites(favoriteNavigationIds);
  const [localUnreadNotificationCount, setLocalUnreadNotificationCount] = useState(unreadNotificationCount);
  const [expandedGroups, setExpandedGroups] = useState<DesktopNavigationExpandedGroups>(
    () => normalizeDesktopNavigationExpandedGroups(desktopNavigationExpandedGroups) ?? {},
  );
  const [collapsedPreference, setCollapsedPreference] = useState(desktopNavigationCollapsed);
  const [activeFlyout, setActiveFlyout] = useState<{
    id: string;
    title: string;
    kind: "group" | "search" | "banner";
    anchorEl: HTMLElement;
    group?: NavigationRailGroup;
  } | null>(null);
  const [railNotificationOpen, setRailNotificationOpen] = useState(false);
  const [expandedAccountOpen, setExpandedAccountOpen] = useState(false);
  const [railAccountOpen, setRailAccountOpen] = useState(false);

  useEffect(() => {
    setLocalUnreadNotificationCount(unreadNotificationCount);
  }, [unreadNotificationCount]);

  const navigationMode = collapsedPreference === undefined ? "auto" : collapsedPreference ? "collapsed" : "expanded";
  const allFavoriteItems = getAvailableNavigationFavorites(localFavoriteNavigationIds, favoriteNavigationItems);
  const favoriteIdSet = new Set(localFavoriteNavigationIds);
  const sectionById = new Map(desktopNavigation.groups.map((section) => [section.id, section]));
  const railGroups: NavigationRailGroup[] = NAVIGATION_GROUPS.flatMap((group) => {
    const section = sectionById.get(group.id);
    return section ? [{ ...group, items: section.items }] : [];
  });
  const railNewsGroup = railGroups.find((group) => group.id === "news") ?? null;
  const railScrollingGroups = railGroups.filter((group) => group.id !== "news");
  const desktopBannerVisible =
    siteBanner !== null && shouldRenderGlobalSiteBanner(siteBanner, "desktop_navigation", pathname);

  const openFlyout = useCallback(
    (flyout: NonNullable<typeof activeFlyout>) => {
      setRailNotificationOpen(false);
      setRailAccountOpen(false);
      setExpandedAccountOpen(false);
      setActiveFlyout((current) => (current?.id === flyout.id ? null : flyout));
    },
    [],
  );
  const closeFlyout = useCallback(
    (returnFocus = false) => {
      const anchorEl = activeFlyout?.anchorEl;
      setActiveFlyout(null);
      if (returnFocus) window.requestAnimationFrame(() => anchorEl?.focus());
    },
    [activeFlyout],
  );
  const handleOpenGroup = useCallback(
    (group: NavigationRailGroup, anchorEl: HTMLButtonElement) =>
      openFlyout({ id: group.id, title: group.name, kind: "group", anchorEl, group }),
    [openFlyout],
  );
  const handleOpenSearch = useCallback(
    (anchorEl: HTMLButtonElement) => openFlyout({ id: "search", title: "검색", kind: "search", anchorEl }),
    [openFlyout],
  );
  const handleOpenBanner = useCallback(
    (anchorEl: HTMLButtonElement) =>
      openFlyout({ id: "site-banner", title: "사이트 배너", kind: "banner", anchorEl }),
    [openFlyout],
  );
  const handleRailNotificationChange = useCallback((isOpen: boolean) => {
    setRailNotificationOpen(isOpen);
    if (isOpen) {
      setActiveFlyout(null);
      setRailAccountOpen(false);
      setExpandedAccountOpen(false);
    }
  }, []);
  const handleRailAccountChange = useCallback((isOpen: boolean) => {
    setRailAccountOpen(isOpen);
    if (isOpen) {
      setActiveFlyout(null);
      setRailNotificationOpen(false);
      setExpandedAccountOpen(false);
    }
  }, []);
  const handleExpandedAccountChange = useCallback((isOpen: boolean) => {
    setExpandedAccountOpen(isOpen);
    if (isOpen) {
      setRailNotificationOpen(false);
      setRailAccountOpen(false);
      setActiveFlyout(null);
    }
  }, []);

  const expandedToggleCollapsed = navigationMode === "auto" ? false : Boolean(collapsedPreference);
  const railToggleCollapsed = navigationMode === "auto" ? true : Boolean(collapsedPreference);

  const handleCollapseToggle = (displayedCollapsed: boolean) => {
    const nextCollapsed = !displayedCollapsed;
    setCollapsedPreference(nextCollapsed);
    setActiveFlyout(null);
    setRailNotificationOpen(false);
    setRailAccountOpen(false);
    setExpandedAccountOpen(false);
    submitPreference(submit, { desktopNavigationCollapsed: nextCollapsed });
  };

  const setGroupExpanded = (groupId: DesktopNavigationPreferenceGroupId, expanded: boolean) => {
    const nextExpandedGroups = { ...expandedGroups, [groupId]: expanded };
    setExpandedGroups(nextExpandedGroups);
    submitPreference(submit, { desktopNavigationExpandedGroups: nextExpandedGroups });
  };

  const groupIsExpanded = (groupId: DesktopNavigationPreferenceGroupId) => expandedGroups[groupId] ?? true;

  const favoriteRows = allFavoriteItems;
  const FlyoutNavigationRow = activeFlyout?.group?.id === "favorites" ? NavigationFavoriteMenuRow : NavigationMenuRow;

  const accountFooter = (
    <>
      <div className="min-w-0 flex-1">
        <NavigationAccountPopover
          variant="expanded"
          username={currentUsername}
          profileStudentId={currentProfileStudentId}
          darkMode={darkMode}
          isActive={isAccountNavigationActive(pathname, currentUsername)}
          actions={accountActions}
          isOpen={expandedAccountOpen}
          onOpenChange={handleExpandedAccountChange}
          onDarkModeChange={(next) => setDarkMode(() => next)}
          onShowSignIn={showSignIn}
        />
      </div>
      <button
        type="button"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="메뉴 접기/펼치기"
        aria-expanded={!expandedToggleCollapsed}
        title={expandedToggleCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
        data-navigation-toggle-variant="expanded"
        onClick={() => handleCollapseToggle(expandedToggleCollapsed)}
      >
        {expandedToggleCollapsed ? <ChevronDoubleRightIcon className="size-4" aria-hidden="true" /> : <ChevronDoubleLeftIcon className="size-4" aria-hidden="true" />}
      </button>
    </>
  );

  const railAccountFooter = (
    <>
      <NavigationAccountPopover
        variant="rail"
        username={currentUsername}
        profileStudentId={currentProfileStudentId}
        darkMode={darkMode}
        isActive={isAccountNavigationActive(pathname, currentUsername)}
        actions={accountActions}
        isOpen={railAccountOpen}
        onOpenChange={handleRailAccountChange}
        onDarkModeChange={(next) => setDarkMode(() => next)}
        onShowSignIn={showSignIn}
      />
      <button
        type="button"
        className="flex min-h-11 w-[60px] flex-col items-center justify-center gap-0.5 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="메뉴 접기/펼치기"
        aria-expanded={!railToggleCollapsed}
        title={railToggleCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
        data-navigation-toggle-variant="rail"
        onClick={() => handleCollapseToggle(railToggleCollapsed)}
      >
        {railToggleCollapsed ? <ChevronDoubleRightIcon className="size-5" aria-hidden="true" /> : <ChevronDoubleLeftIcon className="size-5" aria-hidden="true" />}
      </button>
    </>
  );

  return (
    <>
      <aside
        data-desktop-navigation-mode={navigationMode}
        className="mllg-navigation-shell hidden h-screen shrink-0 flex-col overflow-visible bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 lg:relative lg:z-layer-navigation lg:flex transition-[width] duration-200 motion-reduce:transition-none"
      >
        <div data-navigation-variant="expanded" className="mllg-navigation-expanded flex h-full min-h-0 min-w-0 flex-col">
          <Link
            to="/"
            className="flex h-14 shrink-0 items-center gap-1 px-3 transition-opacity duration-150 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 motion-reduce:transition-none"
            aria-label="몰루로그 홈으로 이동"
          >
            <img
              src={darkMode ? "/mollulog-full-dark.png" : "/mollulog-full-light.png"}
              alt="몰루로그 로고"
              className="h-9 object-cover"
            />
            <span className="pt-1 font-ingame text-sm font-light text-foreground">몰루로그</span>
          </Link>

          <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
            <div className="min-w-0 flex-1">
              <NavigationSearch key={`desktop:${searchResetKey}`} variant="desktop" />
            </div>
            {currentUsername ? (
              <NotificationHistoryPopover
                placement="desktop"
                unreadCount={localUnreadNotificationCount}
                onUnreadCountChange={setLocalUnreadNotificationCount}
              />
            ) : null}
          </div>

          {desktopBannerVisible && siteBanner ? (
            <div className="shrink-0 px-3 pb-2">
              <SiteBanner banner={siteBanner} slot="desktop_navigation" />
            </div>
          ) : null}

          <nav aria-label="데스크톱 주요 메뉴" className="navigation-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2">
            <div className="space-y-0.5">
              <NavigationMenuRow {...desktopNavigation.homeItem} />
              {favoriteRows.length > 0 ? (
                <ul aria-label="즐겨찾기" className="m-0 list-none space-y-0.5 p-0">
                  {favoriteRows.map((item) => (
                    <li key={`${item.menuId ?? item.to}:${item.favoriteId ?? ""}`} className="list-none">
                      <NavigationFavoriteMenuRow
                        {...item}
                        isFavorite={[item.favoriteId, ...(item.legacyFavoriteIds ?? [])].some((id) =>
                          Boolean(id && favoriteIdSet.has(id)),
                        )}
                        onFavoriteToggle={onFavoriteToggle}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {desktopNavigation.groups.map((section) => (
              <DesktopNavigationGroup
                key={section.id}
                id={section.id as DesktopNavigationPreferenceGroupId}
                title={section.name}
                items={section.items}
                expanded={groupIsExpanded(section.id as DesktopNavigationPreferenceGroupId)}
                hasRedDot={getNavigationGroupBadgeSummary(section.items)}
                active={section.items.some((item) => item.isActive)}
                favoriteIdSet={favoriteIdSet}
                onFavoriteToggle={onFavoriteToggle}
                onToggle={(next) => setGroupExpanded(section.id as DesktopNavigationPreferenceGroupId, next)}
              />
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            {accountFooter}
          </div>
        </div>

        <div className="mllg-navigation-rail h-full min-h-0 min-w-0 flex-1">
          <NavigationRail
            darkMode={darkMode}
            homeItem={desktopNavigation.homeItem}
            groups={railScrollingGroups}
            bottomGroup={railNewsGroup}
            favoriteItems={allFavoriteItems}
            activeFlyoutId={activeFlyout?.id ?? null}
            siteBannerVisible={desktopBannerVisible}
            onOpenSearch={handleOpenSearch}
            onOpenGroup={handleOpenGroup}
            onOpenBanner={handleOpenBanner}
            notificationControl={
              currentUsername ? (
                <NotificationHistoryPopover
                  placement="rail"
                  unreadCount={localUnreadNotificationCount}
                  onUnreadCountChange={setLocalUnreadNotificationCount}
                  isOpen={railNotificationOpen}
                  onOpenChange={handleRailNotificationChange}
                />
              ) : null
            }
            accountFooter={railAccountFooter}
          />
          {activeFlyout ? (
            <NavigationFlyout
              id={`navigation-flyout-${activeFlyout.id}`}
              title={activeFlyout.title}
              anchorEl={activeFlyout.anchorEl}
              onClose={closeFlyout}
              width={activeFlyout.kind === "search" ? "search" : "menu"}
              autoFocusFirstLink={activeFlyout.kind !== "search"}
            >
              {activeFlyout.kind === "search" ? (
                <NavigationSearch key={`rail:${searchResetKey}`} variant="rail" />
              ) : activeFlyout.kind === "banner" ? (
                siteBanner ? <SiteBanner banner={siteBanner} slot="desktop_navigation" /> : null
              ) : activeFlyout.group ? (
                activeFlyout.group.items.length === 0 && activeFlyout.group.id === "favorites" ? (
                  <NavigationFavoriteEmptyHint />
                ) : (
                  activeFlyout.group.items.map((item) => (
                    <FlyoutNavigationRow
                      key={`${item.menuId ?? item.to}:${item.favoriteId ?? ""}`}
                      {...item}
                      isFavorite={[item.favoriteId, ...(item.legacyFavoriteIds ?? [])].some((id) => Boolean(id && favoriteIdSet.has(id)))}
                      onFavoriteToggle={onFavoriteToggle}
                    />
                  ))
                )
              ) : null}
            </NavigationFlyout>
          ) : null}
        </div>
      </aside>

      <MobileBrandHeader
        currentUsername={currentUsername}
        unreadNotificationCount={localUnreadNotificationCount}
        onUnreadCountChange={setLocalUnreadNotificationCount}
        searchResetKey={searchResetKey}
        pathname={pathname}
        siteBanner={siteBanner}
      />

      <MobileBottomNavigation
        currentUsername={currentUsername}
        currentProfileStudentId={currentProfileStudentId}
        pathname={pathname}
        upcomingEvent={upcomingEvent}
        mobileNavigationIds={mobileNavigationIds}
        menuBadgeOverrides={menuBadgeOverrides}
      />
      <MobileNavigationPersonalizationTutorial
        mobileNavigationIds={mobileNavigationIds}
        isSignedIn={currentUsername !== null}
      />
    </>
  );
}

function DesktopNavigationGroup({
  id,
  title,
  items,
  expanded,
  hasRedDot,
  active,
  favoriteIdSet,
  onFavoriteToggle,
  onToggle,
}: {
  id: DesktopNavigationPreferenceGroupId;
  title: string;
  items: NavigationItem[];
  expanded: boolean;
  hasRedDot: boolean;
  active: boolean;
  favoriteIdSet: Set<string>;
  onFavoriteToggle: (favoriteId: string) => void;
  onToggle?: (expanded: boolean) => void;
}) {
  const controlsId = `desktop-navigation-group-${id}`;

  return (
    <section className="mt-4">
      <button
        type="button"
        className={cn(
          "flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold text-foreground/80 transition-colors hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          active && !expanded && "bg-background text-foreground",
        )}
        aria-expanded={expanded}
        aria-controls={controlsId}
        onClick={() => onToggle?.(!expanded)}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {!expanded && hasRedDot ? (
          <span className="size-1.5 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
        ) : null}
        <ChevronDownIcon
          className={cn("size-3 shrink-0 transition-transform", !expanded && "-rotate-90")}
          aria-hidden="true"
        />
      </button>
      <div id={controlsId} hidden={!expanded} className="mt-1 space-y-0.5">
        {items.map((item) => (
          <NavigationMenuRow
            key={`${item.menuId ?? item.to}:${item.favoriteId ?? ""}`}
            {...item}
            isFavorite={[item.favoriteId, ...(item.legacyFavoriteIds ?? [])].some((id) => Boolean(id && favoriteIdSet.has(id)))}
            onFavoriteToggle={onFavoriteToggle}
          />
        ))}
      </div>
    </section>
  );
}

function MobileNavigationPersonalizationTutorial({
  mobileNavigationIds,
  isSignedIn,
}: {
  mobileNavigationIds: MobileNavigationPair;
  isSignedIn: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const usesDefaultTabs = mobileNavigationIds.every((id, index) => id === DEFAULT_MOBILE_NAVIGATION_IDS[index]);

  useEffect(() => {
    const mobileMedia = window.matchMedia("(max-width: 1023px)");

    const showOnceOnMobile = () => {
      if (!isSignedIn || !mobileMedia.matches) {
        setIsVisible(false);
        return;
      }

      if (!usesDefaultTabs || hasSeenMobileNavigationTutorial()) {
        if (!usesDefaultTabs) {
          markMobileNavigationTutorialAsSeen();
        }
        setIsVisible(false);
        return;
      }

      setIsVisible(true);
    };

    const hideWhenSeenInAnotherTab = (event: StorageEvent) => {
      if (event.key === mobileNavigationTutorialStorageKey && event.newValue === "true") {
        setIsVisible(false);
      }
    };

    showOnceOnMobile();
    mobileMedia.addEventListener("change", showOnceOnMobile);
    window.addEventListener("storage", hideWhenSeenInAnotherTab);

    return () => {
      mobileMedia.removeEventListener("change", showOnceOnMobile);
      window.removeEventListener("storage", hideWhenSeenInAnotherTab);
    };
  }, [isSignedIn, usesDefaultTabs]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    markMobileNavigationTutorialAsSeen();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsVisible(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isVisible]);

  const close = () => {
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-nav-height)+0.5rem)] z-layer-navigation-menu px-3 lg:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-sm items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={close}
          aria-label="탭 설정 안내 닫기"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug" role="status" aria-live="polite">
          하단 탭을 자주 쓰는 메뉴로 변경할 수 있어요
        </p>
        <Link
          to="/more#mobile-navigation-settings"
          className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={close}
        >
          바꾸기
        </Link>
      </div>
    </div>
  );
}

function hasSeenMobileNavigationTutorial() {
  try {
    return localStorage.getItem(mobileNavigationTutorialStorageKey) === "true";
  } catch {
    return true;
  }
}

function markMobileNavigationTutorialAsSeen() {
  try {
    localStorage.setItem(mobileNavigationTutorialStorageKey, "true");
  } catch {
    // Storage access is unavailable, so the notice cannot safely be persisted.
  }
}

function MobileBrandHeader({
  currentUsername,
  unreadNotificationCount,
  onUnreadCountChange,
  searchResetKey,
  pathname,
  siteBanner,
}: {
  currentUsername: string | null;
  unreadNotificationCount: number;
  onUnreadCountChange: (count: number) => void;
  searchResetKey: string;
  pathname: string;
  siteBanner: SiteBannerData | null;
}) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const shouldRenderBanner = siteBanner ? shouldRenderGlobalSiteBanner(siteBanner, "mobile_header", pathname) : false;
    const updateHeight = () => {
      const height = shouldRenderBanner ? (bannerRef.current?.getBoundingClientRect().height ?? 0) : 0;
      if (height > 0) {
        root.style.setProperty("--mobile-site-banner-measured-height", `${Math.ceil(height)}px`);
      } else {
        root.style.removeProperty("--mobile-site-banner-measured-height");
      }
    };

    updateHeight();
    const banner = bannerRef.current;
    const observer = typeof ResizeObserver === "undefined" || !banner ? null : new ResizeObserver(updateHeight);
    if (observer && banner) {
      observer.observe(banner);
    }
    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      root.style.removeProperty("--mobile-site-banner-measured-height");
    };
  }, [pathname, siteBanner]);

  useEffect(() => {
    void searchResetKey;
    setIsSearchOpen(false);
    setIsNotificationOpen(false);
  }, [searchResetKey]);

  return (
    <header
      className="
        lg:hidden fixed inset-x-0 top-0 z-layer-navigation flex flex-col
        border-border border-b bg-background
      "
    >
      <div className="flex h-[var(--mobile-header-row-height)] w-full items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <Link
          to="/"
          className="-ml-1 flex w-fit items-center rounded-md px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="몰루로그 홈으로 이동"
        >
          <img src="/mollulog-full-light.png" alt="몰루로그 로고" className="mr-1 h-7 dark:hidden" />
          <img src="/mollulog-full-dark.png" alt="" aria-hidden="true" className="mr-1 hidden h-7 dark:block" />
        </Link>

        <div className="-mr-1 flex items-center gap-1">
          <button
            type="button"
            className="
              inline-flex size-9 items-center justify-center rounded-md bg-transparent text-foreground
              transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30
            "
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              setIsNotificationOpen(false);
            }}
            aria-label={isSearchOpen ? "검색 닫기" : "검색 열기"}
            aria-expanded={isSearchOpen}
          >
            <MagnifyingGlassIcon className="size-5" strokeWidth={2} />
          </button>
          {currentUsername ? (
            <NotificationHistoryPopover
              placement="mobile"
              unreadCount={unreadNotificationCount}
              onUnreadCountChange={onUnreadCountChange}
              isOpen={isNotificationOpen}
              onOpenChange={(nextIsOpen) => {
                setIsNotificationOpen(nextIsOpen);
                if (nextIsOpen) {
                  setIsSearchOpen(false);
                }
              }}
            />
          ) : null}
        </div>
      </div>

      {isSearchOpen && (
        <div className="relative w-full px-4 pb-3">
          <NavigationSearch key={`mobile:${searchResetKey}`} variant="mobile" />
        </div>
      )}

      {siteBanner && shouldRenderGlobalSiteBanner(siteBanner, "mobile_header", pathname) ? (
        <div ref={bannerRef}>
          <SiteBanner banner={siteBanner} slot="mobile_header" />
        </div>
      ) : null}
    </header>
  );
}

function MobileBottomNavigation({
  currentUsername,
  currentProfileStudentId,
  pathname,
  upcomingEvent,
  mobileNavigationIds,
  menuBadgeOverrides,
}: {
  currentUsername: string | null;
  currentProfileStudentId: string | null;
  pathname: string;
  upcomingEvent: NavigationBarProps["upcomingEvent"];
  mobileNavigationIds: MobileNavigationPair;
  menuBadgeOverrides: NavigationBarProps["menuBadgeOverrides"];
}) {
  const items = getMobileNavigationItems({
    pathname,
    upcomingEvent,
    currentUsername,
    mobileNavigationIds,
    menuBadgeOverrides,
  });

  return (
    <nav
      className="
        lg:hidden fixed inset-x-0 bottom-0 z-layer-navigation h-[var(--mobile-nav-height)]
        bg-card/95 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1 shadow-t-lg backdrop-blur-sm
      "
      aria-label="주요 메뉴"
    >
      <div className="mx-auto grid h-12 max-w-xl grid-cols-5">
        {items.map((item) => {
          const Icon = item.isActive ? item.SolidIcon : item.OutlineIcon;
          const className = cn(`
            relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-0 text-xs font-medium transition-colors
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30
            ${item.isActive ? "font-bold text-foreground" : "text-foreground/70 hover:text-foreground"}
          `);
          const content = (
            <>
              <span className="flex h-6 shrink-0 items-center justify-center">
                {currentUsername && item.name === "더보기" && currentProfileStudentId ? (
                  <ProfileImage studentUid={currentProfileStudentId} imageSize={6} />
                ) : (
                  <Icon className="size-5 shrink-0" strokeWidth={2} />
                )}
              </span>
              <span className="block h-4 whitespace-nowrap text-[11px] leading-4 tracking-tighter sm:text-xs">
                {item.name}
              </span>
            </>
          );

          return (
            <Link key={item.name} to={item.to} className={className}>
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
