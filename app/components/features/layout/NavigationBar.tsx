import { Transition } from "@headlessui/react";
import { ChevronDownIcon, EnvelopeIcon, MegaphoneIcon, MoonIcon } from "@heroicons/react/16/solid";
import {
  Bars3Icon,
  BoltIcon as BoltIconOutline,
  BookOpenIcon as BookOpenIconOutline,
  CalendarIcon as CalendarIconOutline,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconOutline,
  ClockIcon as ClockIconOutline,
  Cog6ToothIcon as Cog6ToothIconOutline,
  CreditCardIcon as CreditCardIconOutline,
  FireIcon as FireIconOutline,
  GiftIcon as GiftIconOutline,
  HeartIcon as HeartIconOutline,
  HomeIcon as HomeIconOutline,
  IdentificationIcon as IdentificationIconOutline,
  RectangleGroupIcon as RectangleGroupIconOutline,
  TableCellsIcon as TableCellsIconOutline,
  TicketIcon as TicketIconOutline,
  UserCircleIcon as UserCircleIconOutline,
} from "@heroicons/react/24/outline";
import {
  BoltIcon as BoltIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  CalendarIcon as CalendarIconSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  ClockIcon as ClockIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  CreditCardIcon as CreditCardIconSolid,
  FireIcon as FireIconSolid,
  GiftIcon as GiftIconSolid,
  HeartIcon as HeartIconSolid,
  HomeIcon as HomeIconSolid,
  IdentificationIcon as IdentificationIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  TableCellsIcon as TableCellsIconSolid,
  TicketIcon as TicketIconSolid,
  UserCircleIcon as UserCircleIconSolid,
} from "@heroicons/react/24/solid";
import dayjs from "dayjs";
import { useState } from "react";
import { Link, useMatches, useSubmit } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import { sanitizeClassName } from "~/prophandlers";
import { submitPreference } from "~/routes/api.preference";

type NavigationBarProps = {
  currentUsername: string | null;
  darkMode: boolean;
  setDarkMode: (fn: (prev: boolean) => boolean) => void;
  upcomingEvent: { uid: string; since: Date; until: Date } | null;
  hasRecentNews: boolean;
  hasActiveCoupons: boolean;
};

export default function NavigationBar({
  currentUsername,
  darkMode,
  setDarkMode,
  upcomingEvent,
  hasRecentNews,
  hasActiveCoupons,
}: NavigationBarProps) {
  const matches = useMatches();
  const pathname = matches[matches.length - 1].pathname;

  const { showSignIn } = useSignIn();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMenuClose = () => {
    setIsMenuOpen(false);
  };

  return (
    <div
      className={sanitizeClassName(`
      fixed xl:relative w-full xl:w-84 xl:h-screen bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm
      border-b xl:border-b-0 xl:border-r border-neutral-200 dark:border-neutral-700 shadow-xl shadow-neutral-200/30 dark:shadow-neutral-900/30
      ${isMenuOpen ? "z-200" : "z-100"}
    `)}
    >
      <div className="px-4 py-3">
        <div className="flex items-center">
          <button
            type="button"
            className="block xl:hidden -m-2 rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label={isMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
          >
            <Bars3Icon className="size-6" strokeWidth={2} />
          </button>
          <img
            src={darkMode ? "/logo-dark.png" : "/logo-light.png"}
            alt="몰루로그 로고"
            className="ml-2 mr-1 xl:mr-2 object-cover h-8 xl:h-10 aspect-4/3"
          />
          <h1 className="text-xl xl:text-3xl font-ingame">
            <span className="font-bold">몰루</span>로그
          </h1>
        </div>
        <div className="mt-6 hidden xl:block">
          <MenuContent
            currentUsername={currentUsername}
            pathname={pathname}
            onMenuClose={handleMenuClose}
            onShowSignIn={showSignIn}
            onDarkModeToggle={setDarkMode}
            hasRecentNews={hasRecentNews}
            upcomingEvent={upcomingEvent}
            hasActiveCoupons={hasActiveCoupons}
          />
        </div>
      </div>
      <div>
        <Transition
          show={isMenuOpen}
          as="div"
          enter="transition duration-200 ease-out"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition duration-100 ease-in"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          className="px-4 pb-4"
        >
          <MenuContent
            currentUsername={currentUsername}
            pathname={pathname}
            onMenuClose={handleMenuClose}
            onShowSignIn={showSignIn}
            onDarkModeToggle={setDarkMode}
            hasRecentNews={hasRecentNews}
            upcomingEvent={upcomingEvent}
            hasActiveCoupons={hasActiveCoupons}
          />
        </Transition>
      </div>
    </div>
  );
}

interface MenuItemProps {
  to: string;
  name: string;
  OutlineIcon: React.ComponentType<React.ComponentProps<"svg">>;
  SolidIcon: React.ComponentType<React.ComponentProps<"svg">>;
  isActive?: boolean;
  onItemClick?: () => void;
  showRedDot?: boolean;
  disabled?: boolean;
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
    <div className="mt-2 mb-4">
      <button
        type="button"
        className={sanitizeClassName(
          `w-full px-2 py-1 flex items-center rounded-lg transition xl:cursor-default ${isActive ? "font-bold" : ""}`,
        )}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isActive ? (
          <SolidIcon className="inline-block mr-3 size-6" />
        ) : (
          <OutlineIcon className="inline-block mr-3 size-6" />
        )}
        <span className="flex-1 text-left">{name}</span>
        <ChevronDownIcon className={`size-4 transition-transform xl:hidden ${showChildren ? "rotate-180" : ""}`} />
      </button>
      <div
        className={`ml-3 pl-3 border-l border-neutral-200 dark:border-neutral-700 xl:block ${showChildren ? "" : "hidden"}`}
      >
        {children}
      </div>
    </div>
  );
}

interface MenuContentProps {
  currentUsername: string | null;
  pathname: string;
  onMenuClose: () => void;
  onShowSignIn: () => void;
  onDarkModeToggle: (fn: (prev: boolean) => boolean) => void;
  hasRecentNews: boolean;
  upcomingEvent: { uid: string; since: Date; until: Date } | null;
  hasActiveCoupons: boolean;
}

function MenuContent({
  currentUsername,
  pathname,
  onMenuClose,
  onShowSignIn,
  onDarkModeToggle,
  hasRecentNews,
  upcomingEvent,
  hasActiveCoupons,
}: MenuContentProps) {
  const submit = useSubmit();
  const now = dayjs();
  const sectionStates = getMenuSectionStates(pathname, upcomingEvent);
  const menuSections = getMenuSections({
    pathname,
    upcomingEvent,
    now,
    hasActiveCoupons,
    onMenuClose,
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
        onItemClick={onMenuClose}
      />

      <MenuItem
        to="/community"
        name="커뮤니티"
        OutlineIcon={ChatBubbleLeftRightIconOutline}
        SolidIcon={ChatBubbleLeftRightIconSolid}
        isActive={sectionStates.isCommunityActive}
        onItemClick={onMenuClose}
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
        <MenuItem
          to={currentUsername ? `/@${currentUsername}` : "/"}
          name="내 정보"
          OutlineIcon={UserCircleIconOutline}
          SolidIcon={UserCircleIconSolid}
          isActive={pathname.startsWith("/@") || pathname.startsWith("/edit")}
          onItemClick={
            currentUsername
              ? onMenuClose
              : () => {
                  onShowSignIn();
                  onMenuClose();
                }
          }
        />
      ) : (
        <button
          type="button"
          className="my-4 w-full rounded-full bg-neutral-800 py-3 text-center text-sm text-white transition-opacity hover:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          onClick={() => {
            onShowSignIn();
            onMenuClose();
          }}
        >
          로그인 후 내 정보 관리
        </button>
      )}

      <div className="mt-4">
        <UtilityLink
          to="/news"
          text="업데이트 소식"
          Icon={MegaphoneIcon}
          onClick={onMenuClose}
          showRedDot={hasRecentNews}
        />
        {currentUsername && <UtilityLink to="/contact" text="제안/문의" Icon={EnvelopeIcon} onClick={onMenuClose} />}
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

function SubMenuItem({ to, name, OutlineIcon, SolidIcon, isActive, onItemClick, showRedDot, disabled }: MenuItemProps) {
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
    <Link to={to} onClick={() => onItemClick?.()} className={className}>
      {content}
    </Link>
  );
}

function UtilityLink({
  to,
  text,
  Icon,
  onClick,
  showRedDot = false,
}: {
  to: string;
  text: string;
  Icon: React.ComponentType<React.ComponentProps<"svg">>;
  onClick?: () => void;
  showRedDot?: boolean;
}) {
  return (
    <Link
      to={to}
      className="relative my-1 flex w-fit items-center px-2 py-1 text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      onClick={onClick}
    >
      <Icon className="size-4" />
      <span className="ml-2">{text}</span>
      {showRedDot && <div className="absolute top-1 -right-1 size-1.5 bg-red-500 rounded-full animate-pulse" />}
    </Link>
  );
}

function getMenuSectionStates(pathname: string, upcomingEvent: NavigationBarProps["upcomingEvent"]) {
  return {
    isCommunityActive: pathname.startsWith("/community"),
    isContentActive:
      pathname.startsWith("/futures") ||
      pathname.startsWith("/events") ||
      pathname.startsWith("/raids") ||
      pathname.startsWith("/students") ||
      pathname.startsWith("/mainstory"),
    isUtilActive:
      pathname.startsWith("/utils") || !!(upcomingEvent && pathname.startsWith(`/events/${upcomingEvent.uid}`)),
    isExternalActive: pathname.startsWith("/coupons"),
  };
}

function getMenuSections({
  pathname,
  upcomingEvent,
  now,
  hasActiveCoupons,
  onMenuClose,
  sectionStates,
}: {
  pathname: string;
  upcomingEvent: NavigationBarProps["upcomingEvent"];
  now: dayjs.Dayjs;
  hasActiveCoupons: boolean;
  onMenuClose: () => void;
  sectionStates: ReturnType<typeof getMenuSectionStates>;
}) {
  return [
    {
      name: "컨텐츠",
      OutlineIcon: RectangleGroupIconOutline,
      SolidIcon: RectangleGroupIconSolid,
      isActive: sectionStates.isContentActive,
      items: [
        {
          to: "/futures",
          name: "미래시",
          OutlineIcon: CalendarIconOutline,
          SolidIcon: CalendarIconSolid,
          isActive:
            pathname.startsWith("/futures") ||
            (pathname.startsWith("/events") && !(upcomingEvent && pathname.startsWith(`/events/${upcomingEvent.uid}`))),
          onItemClick: onMenuClose,
        },
        {
          to: "/raids",
          name: "총력전 / 대결전",
          OutlineIcon: FireIconOutline,
          SolidIcon: FireIconSolid,
          isActive: pathname.startsWith("/raids"),
          onItemClick: onMenuClose,
        },
        {
          to: "/students",
          name: "학생부",
          OutlineIcon: IdentificationIconOutline,
          SolidIcon: IdentificationIconSolid,
          isActive: pathname.startsWith("/students"),
          onItemClick: onMenuClose,
        },
        {
          to: "/mainstory",
          name: "메인 스토리",
          OutlineIcon: BookOpenIconOutline,
          SolidIcon: BookOpenIconSolid,
          isActive: pathname.startsWith("/mainstory"),
          onItemClick: onMenuClose,
        },
      ],
    },
    {
      name: "플래너 & 계산기",
      OutlineIcon: Cog6ToothIconOutline,
      SolidIcon: Cog6ToothIconSolid,
      isActive: sectionStates.isUtilActive,
      items: [
        {
          to: "/utils/pyroxene",
          name: "청휘석 플래너",
          OutlineIcon: CreditCardIconOutline,
          SolidIcon: CreditCardIconSolid,
          isActive: pathname.startsWith("/utils/pyroxene"),
          onItemClick: onMenuClose,
        },
        {
          to: "/utils/growth/students",
          name: "학생 성장/재화 플래너",
          OutlineIcon: TableCellsIconOutline,
          SolidIcon: TableCellsIconSolid,
          isActive: pathname.startsWith("/utils/growth"),
          onItemClick: onMenuClose,
        },
        upcomingEvent
          ? {
              to: `/events/${upcomingEvent.uid}/shop`,
              name: "이벤트 소탕 계산기",
              OutlineIcon: BoltIconOutline,
              SolidIcon: BoltIconSolid,
              onItemClick: onMenuClose,
              showRedDot: dayjs(upcomingEvent.since).isBefore(now) && dayjs(upcomingEvent.until).isAfter(now),
              isActive: pathname.startsWith(`/events/${upcomingEvent.uid}`),
            }
          : {
              to: "/futures",
              name: "이벤트 소탕 계산기",
              OutlineIcon: BoltIconOutline,
              SolidIcon: BoltIconSolid,
              onItemClick: onMenuClose,
              disabled: true,
            },
        {
          to: "/utils/relationship",
          name: "인연 랭크 계산기",
          OutlineIcon: HeartIconOutline,
          SolidIcon: HeartIconSolid,
          isActive: pathname.startsWith("/utils/relationship"),
          onItemClick: onMenuClose,
        },
        {
          to: "/utils/raidscore",
          name: "총력전 점수 계산기",
          OutlineIcon: ClockIconOutline,
          SolidIcon: ClockIconSolid,
          isActive: pathname.startsWith("/utils/raidscore"),
          onItemClick: onMenuClose,
        },
      ],
    },
    {
      name: "게임 외 정보",
      OutlineIcon: GiftIconOutline,
      SolidIcon: GiftIconSolid,
      isActive: sectionStates.isExternalActive,
      items: [
        {
          to: "/coupons",
          name: "쿠폰",
          OutlineIcon: TicketIconOutline,
          SolidIcon: TicketIconSolid,
          isActive: pathname.startsWith("/coupons"),
          onItemClick: onMenuClose,
          showRedDot: hasActiveCoupons,
        },
      ],
    },
  ];
}
