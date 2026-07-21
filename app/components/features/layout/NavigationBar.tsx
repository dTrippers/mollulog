import { MoonIcon, SunIcon } from "@heroicons/react/16/solid";
import {
  ArrowsRightLeftIcon as ArrowsRightLeftIconOutline,
  CalendarIcon as CalendarIconOutline,
  CameraIcon as CameraIconOutline,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconOutline,
  Cog6ToothIcon,
  EnvelopeIcon,
  HomeIcon as HomeIconOutline,
  IdentificationIcon as IdentificationIconOutline,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  RectangleGroupIcon as RectangleGroupIconOutline,
  UserCircleIcon as UserCircleIconOutline,
} from "@heroicons/react/24/outline";
import {
  ArrowsRightLeftIcon as ArrowsRightLeftIconSolid,
  CameraIcon as CameraIconSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  HomeIcon as HomeIconSolid,
  IdentificationIcon as IdentificationIconSolid,
} from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useLocation, useMatches, useSubmit } from "react-router";
import { ProfileImage } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { parseUtcTimestamp, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { timelineContentTypeLocale } from "~/locales/ko";
import { studentImageUrl } from "~/models/assets";
import { submitPreference } from "~/routes/api.preference";
import type { SearchResponse, SearchResult } from "~/routes/api.search";
import {
  getMobileNavigationItems,
  getNavigationSectionStates,
  getNavigationSections,
  type NavigationItem,
  type NavigationSectionStates,
} from "./navigation-menu";

type NavigationBarProps = {
  currentUsername: string | null;
  currentProfileStudentId: string | null;
  darkMode: boolean;
  setDarkMode: (fn: (prev: boolean) => boolean) => void;
  upcomingEvent: { uid: string; since: UtcIsoString; until: UtcIsoString } | null;
  hasRecentNews: boolean;
  hasOngoingRaid: boolean;
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
};

type NavigationSearchVariant = "desktop" | "mobile";

function NavigationSearch({ variant }: { variant: NavigationSearchVariant }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher<SearchResponse>();
  const fetcherLoad = fetcher.load;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  useEffect(() => {
    if (variant === "mobile") {
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
      if (event.key === "Escape") {
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
  }, [isPopupOpen]);

  const results = fetcher.data?.results ?? [];
  const hasQuery = Boolean(query.trim());
  const showPopup = Boolean(isPopupOpen && (!hasQuery || fetcher.data));
  const isLoading = fetcher.state !== "idle";

  const inputClassName = cn(`
    w-full rounded-md bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/30
  `);

  return (
    <div ref={rootRef} className={variant === "desktop" ? "relative" : "relative w-full"}>
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
            variant === "desktop"
              ? "absolute top-full left-0 z-layer-navigation-menu mt-1 w-96 overflow-hidden rounded-lg border border-border/70 bg-card text-card-foreground shadow-lg"
              : "absolute top-full left-0 right-0 z-layer-navigation-menu mt-1 overflow-hidden rounded-lg border border-border/70 bg-card text-card-foreground shadow-lg"
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

export default function NavigationBar({
  currentUsername,
  currentProfileStudentId,
  darkMode,
  setDarkMode,
  upcomingEvent,
  hasRecentNews,
  hasOngoingRaid,
  hasUnconsumedCoupons,
  hasUnreadFeedbackReplies,
}: NavigationBarProps) {
  const matches = useMatches();
  const location = useLocation();
  const pathname = matches[matches.length - 1].pathname;
  const searchResetKey = `${location.pathname}\n${location.search}`;
  const { showSignIn } = useSignIn();
  const sectionStates = getNavigationSectionStates(pathname, upcomingEvent);

  return (
    <>
      <aside
        className="
          hidden bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 lg:relative lg:z-layer-navigation lg:flex lg:h-screen lg:w-72 lg:flex-col xl:w-84
        "
      >
        <div className="flex h-16 items-center px-5">
          <img
            src={darkMode ? "/logo-dark.png" : "/logo-light.png"}
            alt="몰루로그 로고"
            className="mr-2 h-8 xl:h-9 aspect-4/3 object-cover"
          />
          <h1 className="font-ingame text-xl text-foreground xl:text-2xl">
            <span className="font-semibold">몰루</span>로그
          </h1>
        </div>

        <div className="px-3 pt-3 pb-2">
          <NavigationSearch key={`desktop:${searchResetKey}`} variant="desktop" />
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-2">
          <DesktopMenuContent
            currentUsername={currentUsername}
            pathname={pathname}
            hasRecentNews={hasRecentNews}
            upcomingEvent={upcomingEvent}
            hasOngoingRaid={hasOngoingRaid}
            hasUnconsumedCoupons={hasUnconsumedCoupons}
            hasUnreadFeedbackReplies={hasUnreadFeedbackReplies}
            sectionStates={sectionStates}
          />
        </div>

        <DesktopUtilityFooter
          currentUsername={currentUsername}
          currentProfileStudentId={currentProfileStudentId}
          darkMode={darkMode}
          onDarkModeToggle={setDarkMode}
          onShowSignIn={showSignIn}
        />
      </aside>

      <MobileBrandHeader
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        hasRecentNews={hasRecentNews}
        hasUnreadFeedbackReplies={hasUnreadFeedbackReplies}
        searchResetKey={searchResetKey}
      />

      <MobileBottomNavigation
        currentUsername={currentUsername}
        currentProfileStudentId={currentProfileStudentId}
        pathname={pathname}
        upcomingEvent={upcomingEvent}
      />
    </>
  );
}

function MobileBrandHeader({
  darkMode,
  setDarkMode,
  hasRecentNews,
  hasUnreadFeedbackReplies,
  searchResetKey,
}: {
  darkMode: boolean;
  setDarkMode: NavigationBarProps["setDarkMode"];
  hasRecentNews: boolean;
  hasUnreadFeedbackReplies: boolean;
  searchResetKey: string;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const submit = useSubmit();

  useEffect(() => {
    void searchResetKey;
    setIsSearchOpen(false);
    setIsMenuOpen(false);
  }, [searchResetKey]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  const toggleDarkMode = () => {
    const nextDarkMode = !darkMode;
    submitPreference(submit, { darkMode: nextDarkMode });
    setDarkMode(() => nextDarkMode);
    setIsMenuOpen(false);
  };
  const ModeIcon = darkMode ? SunIcon : MoonIcon;

  return (
    <header
      className="
        lg:hidden fixed inset-x-0 top-0 z-layer-navigation flex flex-col
        border-border border-b bg-background
      "
    >
      <div className="flex h-[var(--mobile-header-height)] w-full items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <Link
          to="/"
          className="-ml-1 flex w-fit items-center rounded-md px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <img
            src={darkMode ? "/logo-dark.png" : "/logo-light.png"}
            alt="몰루로그 로고"
            className="mr-2 h-7 aspect-4/3 object-cover"
          />
          <span className="text-lg font-ingame">
            <span className="font-bold">몰루</span>로그
          </span>
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
              setIsMenuOpen(false);
            }}
            aria-label={isSearchOpen ? "검색 닫기" : "검색 열기"}
            aria-expanded={isSearchOpen}
          >
            <MagnifyingGlassIcon className="size-5" strokeWidth={2} />
          </button>
          <button
            type="button"
            className="
              relative inline-flex size-9 items-center justify-center rounded-md bg-transparent text-foreground
              transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30
            "
            onClick={() => {
              setIsMenuOpen((prev) => !prev);
              setIsSearchOpen(false);
            }}
            aria-label="설정 메뉴 열기"
            aria-expanded={isMenuOpen}
          >
            <Cog6ToothIcon className="size-5" strokeWidth={2} />
            {hasRecentNews && (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-red-500" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {isSearchOpen && (
        <div className="relative w-full px-4 pb-3">
          <NavigationSearch key={`mobile:${searchResetKey}`} variant="mobile" />
        </div>
      )}

      {isMenuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-layer-navigation cursor-default bg-transparent"
            onClick={() => setIsMenuOpen(false)}
            aria-label="설정 메뉴 닫기"
          />
          <div
            className="
              absolute right-3 top-full z-layer-navigation-menu mt-2 flex w-56 flex-col gap-1 rounded-lg border border-border/70 bg-card p-2 text-card-foreground shadow-lg
            "
          >
            <MobileHeaderMenuButton
              as="button"
              Icon={ModeIcon}
              label={darkMode ? "라이트 모드" : "다크 모드"}
              tone="theme"
              onClick={toggleDarkMode}
            />
            <MobileHeaderMenuButton
              as="link"
              to="/contact"
              Icon={EnvelopeIcon}
              label="제안/문의"
              showRedDot={hasUnreadFeedbackReplies}
              onClick={() => setIsMenuOpen(false)}
            />
            <MobileHeaderMenuButton
              as="link"
              to="/news"
              Icon={MegaphoneIcon}
              label="업데이트 소식"
              showRedDot={hasRecentNews}
              onClick={() => setIsMenuOpen(false)}
            />
          </div>
        </>
      )}
    </header>
  );
}

type MobileHeaderMenuButtonProps = {
  Icon: React.ComponentType<React.ComponentProps<"svg">>;
  label: string;
  showRedDot?: boolean;
  tone?: "default" | "theme";
  onClick: () => void;
} & (
  | {
      as: "button";
      to?: never;
    }
  | {
      as: "link";
      to: string;
    }
);

function MobileHeaderMenuButton({
  as,
  to,
  Icon,
  label,
  showRedDot = false,
  tone = "default",
  onClick,
}: MobileHeaderMenuButtonProps) {
  const className = cn(`
    relative flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors
    hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30
    ${tone === "theme" ? "text-yellow-600 dark:text-yellow-400" : "text-foreground"}
  `);
  const iconClassName = cn(`
    size-4 shrink-0
    ${tone === "theme" ? "text-yellow-600 dark:text-yellow-400" : "text-foreground/70"}
  `);
  const content = (
    <>
      <Icon className={iconClassName} />
      <span className="min-w-0 flex-1 text-left">{label}</span>
      {showRedDot && <span className="size-1.5 rounded-full bg-red-500" aria-hidden="true" />}
    </>
  );

  if (as === "link") {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}

function MobileBottomNavigation({
  currentUsername,
  currentProfileStudentId,
  pathname,
  upcomingEvent,
}: {
  currentUsername: string | null;
  currentProfileStudentId: string | null;
  pathname: string;
  upcomingEvent: NavigationBarProps["upcomingEvent"];
}) {
  const items = getMobileNavigationItems({ pathname, upcomingEvent });

  return (
    <nav
      className="
        lg:hidden fixed inset-x-0 bottom-0 z-layer-navigation h-[var(--mobile-nav-height)]
        bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1 shadow-t-lg backdrop-blur-sm
      "
      aria-label="주요 메뉴"
    >
      <div className="mx-auto grid h-12 max-w-xl grid-cols-5">
        {items.map((item) => {
          const Icon = item.isActive ? item.SolidIcon : item.OutlineIcon;
          const className = cn(`
            relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium transition-colors
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
              <span className="block h-4 max-w-full truncate leading-4">{item.name}</span>
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

interface MenuItemProps extends NavigationItem {
  onItemClick?: () => void;
}

function DesktopMenuGroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 mb-1.5 px-2 text-sm font-medium text-foreground/65">{children}</div>;
}

function DesktopMenuSectionList({
  section,
}: {
  section: NonNullable<ReturnType<typeof getNavigationSections>[number]>;
}) {
  return (
    <>
      <DesktopMenuGroupLabel>{section.name}</DesktopMenuGroupLabel>
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <SubMenuItem key={item.name} {...item} />
        ))}
      </div>
    </>
  );
}

interface DesktopMenuContentProps {
  currentUsername: string | null;
  pathname: string;
  hasRecentNews: boolean;
  upcomingEvent: NavigationBarProps["upcomingEvent"];
  hasOngoingRaid: boolean;
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
  sectionStates: NavigationSectionStates;
}

function DesktopMenuContent({
  currentUsername,
  pathname,
  hasRecentNews,
  upcomingEvent,
  hasOngoingRaid,
  hasUnconsumedCoupons,
  hasUnreadFeedbackReplies,
  sectionStates,
}: DesktopMenuContentProps) {
  const menuSections = getNavigationSections({
    pathname,
    upcomingEvent,
    hasOngoingRaid,
    hasUnconsumedCoupons,
    isSignedIn: currentUsername !== null,
    sectionStates,
  });
  const contentSection = menuSections.find((section) => section.name === "컨텐츠");
  const utilSection = menuSections.find((section) => section.name === "플래너 & 계산기");
  const externalSection = menuSections.find((section) => section.name === "게임 외 정보");

  return (
    <nav aria-label="데스크톱 주요 메뉴">
      <div className="space-y-0.5">
        <SubMenuItem
          to="/"
          name="홈"
          OutlineIcon={HomeIconOutline}
          SolidIcon={HomeIconSolid}
          isActive={pathname === "/"}
        />

        <SubMenuItem
          to="/community"
          name="피드"
          OutlineIcon={ChatBubbleLeftRightIconOutline}
          SolidIcon={ChatBubbleLeftRightIconSolid}
          isActive={sectionStates.isCommunityActive}
        />
      </div>

      {contentSection && <DesktopMenuSectionList section={contentSection} />}

      {utilSection && <DesktopMenuSectionList section={utilSection} />}

      {externalSection && <DesktopMenuSectionList section={externalSection} />}

      {menuSections
        .filter((section) => section !== contentSection && section !== utilSection && section !== externalSection)
        .map((section) => (
          <DesktopMenuSectionList key={section.name} section={section} />
        ))}

      {currentUsername && (
        <>
          <DesktopMenuGroupLabel>내 정보</DesktopMenuGroupLabel>
          <div className="space-y-0.5">
            <SubMenuItem
              to={`/@${currentUsername}`}
              name="내 프로필"
              OutlineIcon={IdentificationIconOutline}
              SolidIcon={IdentificationIconSolid}
              isActive={pathname.startsWith("/@")}
            />
            <SubMenuItem
              to="/scanner/resource"
              name="스크린샷 인식기"
              badgeLabel="베타"
              showRedDot
              OutlineIcon={CameraIconOutline}
              SolidIcon={CameraIconSolid}
              isActive={pathname.startsWith("/scanner/resource")}
            />
            <SubMenuItem
              to="/connect/import"
              name="외부 데이터 연동"
              badgeLabel="베타"
              OutlineIcon={ArrowsRightLeftIconOutline}
              SolidIcon={ArrowsRightLeftIconSolid}
              isActive={pathname.startsWith("/connect")}
            />
          </div>
        </>
      )}

      <DesktopMenuGroupLabel>서비스</DesktopMenuGroupLabel>
      <div className="space-y-0.5">
        <DesktopMenuLink to="/news" label="업데이트 소식" Icon={MegaphoneIcon} showRedDot={hasRecentNews} />
        <DesktopMenuLink to="/contact" label="제안/문의" Icon={EnvelopeIcon} showRedDot={hasUnreadFeedbackReplies} />
      </div>
    </nav>
  );
}

function DesktopUtilityFooter({
  currentUsername,
  currentProfileStudentId,
  darkMode,
  onDarkModeToggle,
  onShowSignIn,
}: {
  currentUsername: string | null;
  currentProfileStudentId: string | null;
  darkMode: boolean;
  onDarkModeToggle: (fn: (prev: boolean) => boolean) => void;
  onShowSignIn: () => void;
}) {
  const submit = useSubmit();
  const ModeIcon = darkMode ? SunIcon : MoonIcon;

  return (
    <div className="shrink-0 px-3 py-2">
      <div className="flex items-center gap-2">
        {currentUsername ? (
          <Link
            to={`/@${currentUsername}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-background px-2 py-1.5 text-sm font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
          >
            {currentProfileStudentId ? (
              <ProfileImage studentUid={currentProfileStudentId} imageSize={6} />
            ) : (
              <span className="flex size-5 items-center justify-center">
                <UserCircleIconOutline className="size-4" />
              </span>
            )}
            <span className="min-w-0 truncate">{currentUsername}</span>
          </Link>
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-background px-2 py-1.5 text-left text-sm font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
            onClick={onShowSignIn}
          >
            <span className="flex size-5 items-center justify-center">
              <UserCircleIconOutline className="size-4" />
            </span>
            <span className="min-w-0 truncate">로그인</span>
          </button>
        )}
        <button
          type="button"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={() => {
            const nextDarkMode = !darkMode;
            submitPreference(submit, { darkMode: nextDarkMode });
            onDarkModeToggle(() => nextDarkMode);
          }}
          aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
          title={darkMode ? "라이트 모드" : "다크 모드"}
        >
          <ModeIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SubMenuItem({ to, name, OutlineIcon, SolidIcon, isActive, showRedDot, badgeLabel, disabled }: MenuItemProps) {
  const className = cn(
    `relative my-0.5 grid grid-cols-[1.25rem_1fr] items-center gap-3 rounded-md px-2 py-1 text-sm transition-colors hover:bg-background hover:text-foreground ${
      isActive ? "bg-background font-medium text-foreground" : "font-normal text-foreground/75"
    } ${disabled ? "opacity-40" : ""}`,
  );
  const content = (
    <>
      <span className="flex size-5 items-center justify-center">
        {isActive ? (
          <SolidIcon className="size-4 text-foreground" />
        ) : (
          <OutlineIcon className="size-4 text-foreground/70" />
        )}
      </span>
      <span className="min-w-0">
        <span className="relative inline-block">
          {name}
          {badgeLabel && (
            <span className="ml-1 inline-block origin-left scale-90 align-super text-xs font-normal leading-none text-muted-foreground/70">
              {badgeLabel}
            </span>
          )}
          {showRedDot && <div className="absolute top-0 -right-3 size-1.5 bg-red-500 rounded-full animate-pulse" />}
        </span>
      </span>
    </>
  );

  if (disabled) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
}

type DesktopMenuLinkProps = {
  label: string;
  Icon: React.ComponentType<React.ComponentProps<"svg">>;
  showRedDot?: boolean;
  to: string;
};

function DesktopMenuLink({ to, label, Icon, showRedDot = false }: DesktopMenuLinkProps) {
  const className =
    "relative my-0.5 grid w-full grid-cols-[1.25rem_1fr] items-center gap-3 rounded-md px-2 py-1 text-left text-sm font-normal text-foreground/75 transition-colors hover:bg-background hover:text-foreground";
  const content = (
    <>
      <span className="flex size-5 items-center justify-center">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="relative inline-block">
          {label}
          {showRedDot && (
            <span className="absolute top-0 -right-3 size-1.5 rounded-full bg-red-500" aria-hidden="true" />
          )}
        </span>
      </span>
    </>
  );

  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
}
