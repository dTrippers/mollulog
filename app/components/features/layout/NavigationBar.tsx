import {
  ChevronDownIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/16/solid";
import {
  ArrowsRightLeftIcon as ArrowsRightLeftIconOutline,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconOutline,
  Cog6ToothIcon,
  HomeIcon as HomeIconOutline,
  IdentificationIcon as IdentificationIconOutline,
  UserCircleIcon as UserCircleIconOutline,
} from "@heroicons/react/24/outline";
import {
  ArrowsRightLeftIcon as ArrowsRightLeftIconSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  HomeIcon as HomeIconSolid,
  IdentificationIcon as IdentificationIconSolid,
  UserCircleIcon as UserCircleIconSolid,
} from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";
import { Link, useMatches, useSubmit } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import { ProfileImage } from "~/components/primitives";
import { sanitizeClassName } from "~/prophandlers";
import { submitPreference } from "~/routes/api.preference";
import type { UtcIsoString } from "~/lib/date-time";
import {
  getMobileNavigationItems,
  getNavigationSections,
  getNavigationSectionStates,
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
  hasActiveCoupons: boolean;
};

export default function NavigationBar({
  currentUsername,
  currentProfileStudentId,
  darkMode,
  setDarkMode,
  upcomingEvent,
  hasRecentNews,
  hasActiveCoupons,
}: NavigationBarProps) {
  const matches = useMatches();
  const pathname = matches[matches.length - 1].pathname;
  const { showSignIn } = useSignIn();
  const sectionStates = getNavigationSectionStates(pathname, upcomingEvent);

  return (
    <>
      <aside
        className="
          hidden lg:block lg:relative lg:h-screen lg:w-72 xl:w-84 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm
          lg:border-r border-neutral-200 dark:border-neutral-700 shadow-xl shadow-neutral-200/30 dark:shadow-neutral-900/30
        "
      >
        <div className="px-4 py-3">
          <div className="flex items-center">
            <img
              src={darkMode ? "/logo-dark.png" : "/logo-light.png"}
              alt="몰루로그 로고"
              className="mr-2 h-9 xl:h-10 aspect-4/3 object-cover"
            />
            <h1 className="text-2xl xl:text-3xl font-ingame">
              <span className="font-bold">몰루</span>로그
            </h1>
          </div>

          <div className="mt-6">
            <DesktopMenuContent
              currentUsername={currentUsername}
              pathname={pathname}
              onShowSignIn={showSignIn}
              onDarkModeToggle={setDarkMode}
              hasRecentNews={hasRecentNews}
              upcomingEvent={upcomingEvent}
              hasActiveCoupons={hasActiveCoupons}
              sectionStates={sectionStates}
            />
          </div>
        </div>
      </aside>

      <MobileBrandHeader
        currentUsername={currentUsername}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        hasRecentNews={hasRecentNews}
      />

      <MobileBottomNavigation
        currentUsername={currentUsername}
        currentProfileStudentId={currentProfileStudentId}
        pathname={pathname}
        upcomingEvent={upcomingEvent}
        onShowSignIn={showSignIn}
      />
    </>
  );
}

function MobileBrandHeader({
  currentUsername,
  darkMode,
  setDarkMode,
  hasRecentNews,
}: {
  currentUsername: string | null;
  darkMode: boolean;
  setDarkMode: NavigationBarProps["setDarkMode"];
  hasRecentNews: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const submit = useSubmit();

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
    setDarkMode((prev) => {
      submitPreference(submit, { darkMode: !prev });
      return !prev;
    });
    setIsMenuOpen(false);
  };
  const ModeIcon = darkMode ? SunIcon : MoonIcon;

  return (
    <header
      className="
        lg:hidden fixed inset-x-0 top-0 z-layer-navigation flex h-[var(--mobile-header-height)] items-center justify-between
        border-b border-neutral-200/60 bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-sm
        dark:border-neutral-700/60 dark:bg-neutral-800/95
      "
    >
      <Link to="/" className="-ml-1 flex w-fit items-center rounded-md px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-800">
        <img
          src={darkMode ? "/logo-dark.png" : "/logo-light.png"}
          alt="몰루로그 로고"
          className="mr-2 h-7 aspect-4/3 object-cover"
        />
        <span className="text-lg font-ingame">
          <span className="font-bold">몰루</span>로그
        </span>
      </Link>

      <button
        type="button"
        className="
          relative -mr-1 inline-flex size-9 items-center justify-center rounded-md text-neutral-700
          transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
          dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus-visible:ring-offset-neutral-800
        "
        onClick={() => setIsMenuOpen((prev) => !prev)}
        aria-label="설정 메뉴 열기"
        aria-expanded={isMenuOpen}
      >
        <Cog6ToothIcon className="size-5" strokeWidth={2} />
        {hasRecentNews && (
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-red-500" aria-hidden="true" />
        )}
      </button>

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
              absolute right-3 top-full z-layer-navigation-menu mt-2 flex w-56 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg shadow-neutral-200/50
              dark:border-neutral-700 dark:bg-neutral-800 dark:shadow-neutral-950/30
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
  const className = sanitizeClassName(`
    relative flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors
    hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
    dark:hover:bg-neutral-700 dark:focus-visible:ring-offset-neutral-800
    ${tone === "theme" ? "text-yellow-600 dark:text-yellow-400" : "text-neutral-700 dark:text-neutral-200"}
  `);
  const iconClassName = sanitizeClassName(`
    size-4 shrink-0
    ${tone === "theme" ? "text-yellow-600 dark:text-yellow-400" : "text-neutral-500 dark:text-neutral-400"}
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
  onShowSignIn,
}: {
  currentUsername: string | null;
  currentProfileStudentId: string | null;
  pathname: string;
  upcomingEvent: NavigationBarProps["upcomingEvent"];
  onShowSignIn: () => void;
}) {
  const items = getMobileNavigationItems({ pathname, currentUsername, upcomingEvent });

  return (
    <nav
      className="
        lg:hidden fixed inset-x-0 bottom-0 z-layer-navigation h-[var(--mobile-nav-height)]
        border-t border-neutral-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1 shadow-t-lg backdrop-blur-sm
        dark:border-neutral-700 dark:bg-neutral-800/95
      "
      aria-label="주요 메뉴"
    >
      <div className="mx-auto grid h-12 max-w-xl grid-cols-5">
        {items.map((item) => {
          const Icon = item.isActive ? item.SolidIcon : item.OutlineIcon;
          const className = sanitizeClassName(`
            relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium transition-colors
            focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-800
            ${item.isActive ? "font-bold text-neutral-950 dark:text-neutral-50" : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}
          `);
          const content = (
            <>
              {currentUsername && item.to.startsWith("/@") && currentProfileStudentId ? (
                <ProfileImage studentUid={currentProfileStudentId} imageSize={6} />
              ) : (
                <Icon className="size-5 shrink-0" strokeWidth={2} />
              )}
              <span className="max-w-full truncate">{item.name}</span>
            </>
          );

          if (!currentUsername && item.to === "/my") {
            return (
              <button key={item.name} type="button" className={className} onClick={onShowSignIn}>
                {content}
              </button>
            );
          }

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

function MenuItem({ to, name, OutlineIcon, SolidIcon, isActive, onItemClick, showRedDot }: MenuItemProps) {
  return (
    <Link
      to={to}
      className={sanitizeClassName(
        `my-2 px-2 py-1 flex items-center hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition relative ${isActive ? "font-bold drop-shadow-lg" : ""}`,
      )}
      onClick={() => onItemClick?.()}
    >
      {isActive ? (
        <SolidIcon className="inline-block mr-3 size-6" />
      ) : (
        <OutlineIcon className="inline-block mr-3 size-6" />
      )}
      <span className="relative">
        {name}
        {showRedDot && <div className="absolute top-0 -right-3 size-1.5 bg-red-500 rounded-full animate-pulse" />}
      </span>
    </Link>
  );
}

interface MenuSectionProps {
  name: string;
  OutlineIcon: React.ComponentType<React.ComponentProps<"svg">>;
  SolidIcon: React.ComponentType<React.ComponentProps<"svg">>;
  isActive: boolean;
  children: React.ReactNode;
}

function MenuSection({ name, OutlineIcon, SolidIcon, isActive, children }: MenuSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const showChildren = isOpen || isActive;

  return (
    <div className="my-2">
      <button
        type="button"
        className={sanitizeClassName(
          `w-full px-2 py-1 flex items-center rounded-lg transition lg:cursor-default ${isActive ? "font-bold" : ""}`,
        )}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isActive ? (
          <SolidIcon className="inline-block mr-3 size-6" />
        ) : (
          <OutlineIcon className="inline-block mr-3 size-6" />
        )}
        <span className="flex-1 text-left">{name}</span>
        <ChevronDownIcon className={`size-4 transition-transform lg:hidden ${showChildren ? "rotate-180" : ""}`} />
      </button>
      <div
        className={`ml-3 pl-3 border-l border-neutral-200 dark:border-neutral-700 lg:block ${showChildren ? "" : "hidden"}`}
      >
        {children}
      </div>
    </div>
  );
}

interface DesktopMenuContentProps {
  currentUsername: string | null;
  pathname: string;
  onShowSignIn: () => void;
  onDarkModeToggle: (fn: (prev: boolean) => boolean) => void;
  hasRecentNews: boolean;
  upcomingEvent: NavigationBarProps["upcomingEvent"];
  hasActiveCoupons: boolean;
  sectionStates: NavigationSectionStates;
}

function DesktopMenuContent({
  currentUsername,
  pathname,
  onShowSignIn,
  onDarkModeToggle,
  hasRecentNews,
  upcomingEvent,
  hasActiveCoupons,
  sectionStates,
}: DesktopMenuContentProps) {
  const submit = useSubmit();
  const menuSections = getNavigationSections({
    pathname,
    upcomingEvent,
    hasActiveCoupons,
    sectionStates,
  });

  return (
    <>
      <MenuItem
        to="/"
        name="홈"
        OutlineIcon={HomeIconOutline}
        SolidIcon={HomeIconSolid}
        isActive={pathname === "/"}
      />

      <MenuItem
        to="/community"
        name="평가/의견"
        OutlineIcon={ChatBubbleLeftRightIconOutline}
        SolidIcon={ChatBubbleLeftRightIconSolid}
        isActive={sectionStates.isCommunityActive}
      />

      {menuSections.map((section) => (
        <MenuSection
          key={section.name}
          name={section.name}
          OutlineIcon={section.OutlineIcon}
          SolidIcon={section.SolidIcon}
          isActive={section.isActive}
        >
          {section.items.map((item) => (
            <SubMenuItem key={item.name} {...item} />
          ))}
        </MenuSection>
      ))}

      {currentUsername ? (
        <MenuSection
          name="내 정보"
          OutlineIcon={UserCircleIconOutline}
          SolidIcon={UserCircleIconSolid}
          isActive={sectionStates.isProfileActive}
        >
          <SubMenuItem
            to={`/@${currentUsername}`}
            name="내 프로필"
            OutlineIcon={IdentificationIconOutline}
            SolidIcon={IdentificationIconSolid}
            isActive={pathname.startsWith("/@")}
          />
          <SubMenuItem
            to="/connect/import"
            name="외부 데이터 연동"
            OutlineIcon={ArrowsRightLeftIconOutline}
            SolidIcon={ArrowsRightLeftIconSolid}
            isActive={pathname.startsWith("/connect")}
          />
        </MenuSection>
      ) : (
        <button
          type="button"
          className="my-4 w-full rounded-full bg-neutral-800 py-3 text-center text-sm text-white transition-opacity hover:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          onClick={onShowSignIn}
        >
          로그인 후 내 정보 관리
        </button>
      )}

      <div className="mt-4">
        <UtilityLink
          to="/news"
          text="업데이트 소식"
          Icon={MegaphoneIcon}
          showRedDot={hasRecentNews}
        />
        {currentUsername && <UtilityLink to="/contact" text="제안/문의" Icon={EnvelopeIcon} />}
        <button
          type="button"
          className="my-1 flex w-fit items-center text-sm px-2 py-1 font-bold text-yellow-600 hover:underline dark:text-yellow-400"
          onClick={() => {
            onDarkModeToggle((prev) => {
              submitPreference(submit, { darkMode: !prev });
              return !prev;
            });
          }}
        >
          <MoonIcon className="size-4" />
          <span className="ml-2">다크 모드</span>
        </button>
      </div>
    </>
  );
}

function SubMenuItem({ to, name, OutlineIcon, SolidIcon, isActive, showRedDot, disabled }: MenuItemProps) {
  const className = sanitizeClassName(
    `my-1 px-2 py-1.5 flex items-center hover:bg-neutral-200 dark:hover:bg-neutral-700 text-sm rounded-lg transition relative ${isActive ? "font-semibold drop-shadow-lg" : ""} ${disabled ? "opacity-40" : ""}`,
  );
  const content = (
    <>
      {isActive ? (
        <SolidIcon className="inline-block mr-3 size-5" />
      ) : (
        <OutlineIcon className="inline-block mr-3 size-5" />
      )}
      <span className="relative">
        {name}
        {showRedDot && <div className="absolute top-0 -right-3 size-1.5 bg-red-500 rounded-full animate-pulse" />}
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

function UtilityLink({
  to,
  text,
  Icon,
  showRedDot = false,
}: {
  to: string;
  text: string;
  Icon: React.ComponentType<React.ComponentProps<"svg">>;
  showRedDot?: boolean;
}) {
  return (
    <Link
      to={to}
      className="relative my-1 flex w-fit items-center px-2 py-1 text-sm text-neutral-500 hover:underline dark:text-neutral-400"
    >
      <Icon className="size-4" />
      <span className="ml-2">{text}</span>
      {showRedDot && <div className="absolute top-1 -right-1 size-1.5 bg-red-500 rounded-full animate-pulse" />}
    </Link>
  );
}
