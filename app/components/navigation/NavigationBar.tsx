import dayjs from "dayjs";
import { MoonIcon, EnvelopeIcon, MegaphoneIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import {
  HomeIcon as HomeIconOutline,
  CalendarIcon as CalendarIconOutline,
  UserCircleIcon as UserCircleIconOutline,
  IdentificationIcon as IdentificationIconOutline,
  FireIcon as FireIconOutline,
  Bars3Icon,
  HeartIcon as HeartIconOutline,
  BoltIcon as BoltIconOutline,
  ClockIcon as ClockIconOutline,
  WalletIcon as WalletIconOutline,
  BookOpenIcon as BookOpenIconOutline,
  RectangleGroupIcon as RectangleGroupIconOutline,
  Cog6ToothIcon as Cog6ToothIconOutline,
  GiftIcon as GiftIconOutline,
  TicketIcon as TicketIconOutline,
} from "@heroicons/react/24/outline";
import {
  HomeIcon as HomeIconSolid,
  CalendarIcon as CalendarIconSolid,
  UserCircleIcon as UserCircleIconSolid,
  IdentificationIcon as IdentificationIconSolid,
  FireIcon as FireIconSolid,
  HeartIcon as HeartIconSolid,
  BoltIcon as BoltIconSolid,
  ClockIcon as ClockIconSolid,
  WalletIcon as WalletIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  GiftIcon as GiftIconSolid,
  TicketIcon as TicketIconSolid,
} from "@heroicons/react/24/solid";
import { Transition } from "@headlessui/react";
import { Link, useMatches, useSubmit } from "react-router";
import { useState } from "react";
import { useSignIn } from "~/contexts/SignInProvider";
import { sanitizeClassName } from "~/prophandlers";
import { submitPreference } from "~/routes/api.preference";

type NavigationBarProps = {
  currentUsername: string | null;
  darkMode: boolean;
  setDarkMode: (fn: (prev: boolean) => boolean) => void;
  upcomingEvent: { uid: string; since: Date; until: Date } | null;
  hasRecentNews: boolean;
};

export default function NavigationBar({ currentUsername, darkMode, setDarkMode, upcomingEvent, hasRecentNews }: NavigationBarProps) {
  const matches = useMatches();
  const pathname = matches[matches.length - 1].pathname;

  const { showSignIn } = useSignIn();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMenuClose = () => {
    setIsMenuOpen(false);
  };

  return (
    <div className={sanitizeClassName(`
      fixed xl:relative w-full xl:w-96 xl:h-screen bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm
      border-b xl:border-b-0 xl:border-r border-neutral-200 dark:border-neutral-700 shadow-xl shadow-neutral-200/30 dark:shadow-neutral-900/30
      ${isMenuOpen ? "z-200" : "z-100"}
    `)}>
      <div className="px-4 py-3">
        <div className="flex items-center">
          <Bars3Icon className="p-2 -m-2 block xl:hidden size-10" strokeWidth={2} onClick={() => setIsMenuOpen(!isMenuOpen)} />
          <img src={darkMode ? "/logo-dark.png" : "/logo-light.png"} alt="몰루로그 로고" className="ml-2 mr-1 xl:mr-2 object-cover h-8 xl:h-10 aspect-4/3" />
          <h1 className="text-2xl xl:text-3xl font-ingame">
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
      className={sanitizeClassName(`my-2 px-2 py-1.5 xl:py-2 flex items-center hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition relative ${isActive ? "font-bold drop-shadow-lg" : ""}`)}
      onClick={() => onItemClick?.()}
    >
      {isActive ? <SolidIcon className="inline-block mr-3 size-6" /> : <OutlineIcon className="inline-block mr-3 size-6" />}
      <span className="text-lg relative">
        {name}
        {showRedDot && (
          <div className="absolute top-0 -right-3 size-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </span>
    </Link>
  );
}

function SubMenuItem({ to, name, OutlineIcon, SolidIcon, isActive, onItemClick, showRedDot, disabled }: MenuItemProps) {
  const child = (
    <div className={sanitizeClassName(`my-1 px-2 py-1.5 flex items-center hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition relative ${isActive ? "font-semibold drop-shadow-lg" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`)}>
      {isActive ? <SolidIcon className="inline-block mr-3 size-5" /> : <OutlineIcon className="inline-block mr-3 size-5" />}
      <span className="relative">
        {name}
        {showRedDot && (
          <div className="absolute top-0 -right-3 size-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </span>
    </div>
  );

  if (disabled) {
    return child;
  }
  return (
    <Link to={to} onClick={() => onItemClick?.()}>
      {child}
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
        className={sanitizeClassName(`w-full px-2 py-1.5 xl:py-2 flex items-center rounded-lg transition xl:cursor-default ${isActive ? "font-bold" : ""}`)}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isActive ? <SolidIcon className="inline-block mr-3 size-6" /> : <OutlineIcon className="inline-block mr-3 size-6" />}
        <span className="text-lg flex-1 text-left">{name}</span>
        <ChevronDownIcon className={`size-4 transition-transform xl:hidden ${showChildren ? "rotate-180" : ""}`} />
      </button>
      <div className={`ml-3 pl-3 border-l border-neutral-200 dark:border-neutral-700 xl:block ${showChildren ? "" : "hidden"}`}>
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
}

function MenuContent({ currentUsername, pathname, onMenuClose, onShowSignIn, onDarkModeToggle, hasRecentNews, upcomingEvent }: MenuContentProps) {
  const submit = useSubmit();

  const now = dayjs();

  const isContentActive =
    pathname.startsWith("/futures") ||
    pathname.startsWith("/events") ||
    pathname.startsWith("/raids") ||
    pathname.startsWith("/students") ||
    pathname.startsWith("/mainstory");

  const isUtilActive =
    pathname.startsWith("/utils") ||
    (upcomingEvent && pathname.startsWith(`/events/${upcomingEvent.uid}`));

  const isExternalActive = pathname.startsWith("/coupons");

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

      <MenuSection
        name="컨텐츠"
        OutlineIcon={RectangleGroupIconOutline}
        SolidIcon={RectangleGroupIconSolid}
        isActive={isContentActive}
      >
        <SubMenuItem
          to="/futures"
          name="미래시"
          OutlineIcon={CalendarIconOutline}
          SolidIcon={CalendarIconSolid}
          isActive={pathname.startsWith("/futures") || (pathname.startsWith("/events") && !(upcomingEvent && pathname.startsWith(`/events/${upcomingEvent.uid}`)))}
          onItemClick={onMenuClose}
        />
        <SubMenuItem
          to="/raids"
          name="총력전 / 대결전"
          OutlineIcon={FireIconOutline}
          SolidIcon={FireIconSolid}
          isActive={pathname.startsWith("/raids")}
          onItemClick={onMenuClose}
        />
        <SubMenuItem
          to="/students"
          name="학생부"
          OutlineIcon={IdentificationIconOutline}
          SolidIcon={IdentificationIconSolid}
          isActive={pathname.startsWith("/students")}
          onItemClick={onMenuClose}
        />
        <SubMenuItem
          to="/mainstory"
          name="메인 스토리"
          OutlineIcon={BookOpenIconOutline}
          SolidIcon={BookOpenIconSolid}
          isActive={pathname.startsWith("/mainstory")}
          onItemClick={onMenuClose}
        />
      </MenuSection>

      <MenuSection
        name="플래너 & 계산기"
        OutlineIcon={Cog6ToothIconOutline}
        SolidIcon={Cog6ToothIconSolid}
        isActive={!!isUtilActive}
      >
        <SubMenuItem
          name="청휘석 플래너"
          to="/utils/pyroxene"
          OutlineIcon={WalletIconOutline}
          SolidIcon={WalletIconSolid}
          isActive={pathname.startsWith("/utils/pyroxene")}
          onItemClick={onMenuClose}
        />
        {upcomingEvent ? (
          <SubMenuItem
            name="이벤트 소탕 계산기"
            to={`/events/${upcomingEvent.uid}/shop`}
            OutlineIcon={BoltIconOutline}
            SolidIcon={BoltIconSolid}
            onItemClick={onMenuClose}
            showRedDot={dayjs(upcomingEvent.since).isBefore(now) && dayjs(upcomingEvent.until).isAfter(now)}
            isActive={pathname.startsWith(`/events/${upcomingEvent.uid}`)}
          />
        ) : (
          <SubMenuItem
            name="이벤트 소탕 계산기"
            to="/futures"
            OutlineIcon={BoltIconOutline}
            SolidIcon={BoltIconSolid}
            onItemClick={onMenuClose}
            disabled
          />
        )}
        <SubMenuItem
          name="인연 랭크 계산기"
          to="/utils/relationship"
          OutlineIcon={HeartIconOutline}
          SolidIcon={HeartIconSolid}
          isActive={pathname.startsWith("/utils/relationship")}
          onItemClick={onMenuClose}
        />
        <SubMenuItem
          name="총력전 점수 계산기"
          to="/utils/raidscore"
          OutlineIcon={ClockIconOutline}
          SolidIcon={ClockIconSolid}
          isActive={pathname.startsWith("/utils/raidscore")}
          onItemClick={onMenuClose}
        />
      </MenuSection>

      <MenuSection
        name="게임 외 정보"
        OutlineIcon={GiftIconOutline}
        SolidIcon={GiftIconSolid}
        isActive={isExternalActive}
      >
        <SubMenuItem
          to="/coupons"
          name="쿠폰"
          OutlineIcon={TicketIconOutline}
          SolidIcon={TicketIconSolid}
          isActive={pathname.startsWith("/coupons")}
          onItemClick={onMenuClose}
          showRedDot  // TODO: implement
        />
      </MenuSection>

      {currentUsername ? (
        <MenuItem
          to={currentUsername ? `/@${currentUsername}` : "/"}
          name="내 정보"
          OutlineIcon={UserCircleIconOutline}
          SolidIcon={UserCircleIconSolid}
          isActive={pathname.startsWith("/@") || pathname.startsWith("/edit")}
          onItemClick={currentUsername ? onMenuClose : () => { onShowSignIn(); onMenuClose(); }}
        />
      ) :(
        <div
          className="w-full my-4 py-3 bg-neutral-800 dark:bg-neutral-100 text-sm text-white dark:text-neutral-900 text-center rounded-full hover:opacity-50 transition-opacity cursor-pointer"
          onClick={() => {
            onShowSignIn();
            onMenuClose();
          }}
        >
          로그인 후 내 정보 관리
        </div>
      )}

      <Link
        to="/news"
        className="w-fit my-1.5 py-1 px-2 flex items-center text-neutral-500 dark:text-neutral-400 cursor-pointer hover:underline relative"
        onClick={onMenuClose}
      >
        <MegaphoneIcon className="size-4" />
        <span className="ml-2">업데이트 소식</span>
        {hasRecentNews && (
          <div className="absolute top-1 -right-1 size-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </Link>
      {currentUsername && (
        <Link
          to="/contact"
          className="w-fit my-1.5 py-1 px-2 flex items-center text-neutral-500 dark:text-neutral-400 cursor-pointer hover:underline"
          onClick={onMenuClose}
        >
          <EnvelopeIcon className="size-4" />
          <span className="ml-2">제안/문의</span>
        </Link>
      )}
      <div
        className="w-fit my-1.5 py-1 px-2 font-bold flex items-center text-yellow-600 dark:text-yellow-400 cursor-pointer hover:underline"
        onClick={() => {
          onDarkModeToggle((prev) => {
            submitPreference(submit, { darkMode: !prev });
            return !prev;
          });
        }}
      >
        <MoonIcon className="size-4" />
        <span className="ml-2">다크 모드</span>
      </div>
    </>
  );
}
