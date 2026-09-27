import {
  ArchiveBoxIcon as ArchiveBoxIconOutline,
  ArrowsRightLeftIcon as ArrowsRightLeftIconOutline,
  BoltIcon as BoltIconOutline,
  BookOpenIcon as BookOpenIconOutline,
  CalculatorIcon as CalculatorIconOutline,
  CalendarIcon as CalendarIconOutline,
  CameraIcon as CameraIconOutline,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconOutline,
  ClockIcon as ClockIconOutline,
  Cog6ToothIcon as Cog6ToothIconOutline,
  CreditCardIcon as CreditCardIconOutline,
  EllipsisHorizontalCircleIcon as EllipsisHorizontalCircleIconOutline,
  EnvelopeIcon as EnvelopeIconOutline,
  FireIcon as FireIconOutline,
  HeartIcon as HeartIconOutline,
  HomeIcon as HomeIconOutline,
  IdentificationIcon as IdentificationIconOutline,
  ListBulletIcon as ListBulletIconOutline,
  MapIcon as MapIconOutline,
  MegaphoneIcon as MegaphoneIconOutline,
  QueueListIcon as QueueListIconOutline,
  RectangleGroupIcon as RectangleGroupIconOutline,
  TableCellsIcon as TableCellsIconOutline,
  TicketIcon as TicketIconOutline,
  UserIcon as UserIconOutline,
  UserCircleIcon as UserCircleIconOutline,
  ChartBarIcon as ChartBarIconOutline,
  CircleStackIcon as CircleStackIconOutline,
} from "@heroicons/react/24/outline";
import {
  ArchiveBoxIcon as ArchiveBoxIconSolid,
  ArrowsRightLeftIcon as ArrowsRightLeftIconSolid,
  BoltIcon as BoltIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  CalculatorIcon as CalculatorIconSolid,
  CalendarIcon as CalendarIconSolid,
  CameraIcon as CameraIconSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  ClockIcon as ClockIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  CreditCardIcon as CreditCardIconSolid,
  EllipsisHorizontalCircleIcon as EllipsisHorizontalCircleIconSolid,
  EnvelopeIcon as EnvelopeIconSolid,
  FireIcon as FireIconSolid,
  HeartIcon as HeartIconSolid,
  HomeIcon as HomeIconSolid,
  IdentificationIcon as IdentificationIconSolid,
  ListBulletIcon as ListBulletIconSolid,
  MapIcon as MapIconSolid,
  MegaphoneIcon as MegaphoneIconSolid,
  QueueListIcon as QueueListIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  TableCellsIcon as TableCellsIconSolid,
  TicketIcon as TicketIconSolid,
  UserIcon as UserIconSolid,
  UserCircleIcon as UserCircleIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  CircleStackIcon as CircleStackIconSolid,
} from "@heroicons/react/24/solid";
import type { ComponentProps, ComponentType } from "react";
import {
  DEFAULT_MOBILE_NAVIGATION_IDS,
  MOBILE_NAVIGATION_IDS,
  type MobileNavigationId,
  normalizeMobileNavigationIds,
} from "~/domain/mobile-navigation";
import {
  applyMenuBadgeOverride,
  type NavigationMenuId,
  type ResolvedMenuBadgeOverride,
} from "~/domain/navigation-menu-badges";
import type { UtcIsoString } from "~/lib/date-time";

type IconComponent = ComponentType<ComponentProps<"svg">>;

export type NavigationSurface = "desktop" | "mobileBottom" | "more" | "search" | "account";
export type NavigationGroupId =
  | "home"
  | "game"
  | "planner"
  | "personal"
  | "community"
  | "news"
  | "settings"
  | "account";

export type NavigationItem = {
  menuId?: NavigationMenuId;
  to: string;
  name: string;
  favoriteId?: string;
  legacyFavoriteIds?: string[];
  description?: string;
  OutlineIcon: IconComponent;
  SolidIcon: IconComponent;
  isActive?: boolean;
  showRedDot?: boolean;
  badgeLabel?: string;
  disabled?: boolean;
  requiresSignIn?: boolean;
  mobileNavigationId?: MobileNavigationId;
  mobileLabel?: string;
  group?: NavigationGroupId;
  surfaces?: readonly NavigationSurface[];
};

type NavigationCatalogItem = NavigationItem & {
  group: NavigationGroupId;
  surfaces: readonly NavigationSurface[];
};

export type UpcomingNavigationEvent = { uid: string; since: UtcIsoString; until: UtcIsoString } | null;

export type SearchableMenuItem = {
  id: string;
  name: string;
  to: string;
  requiresSignIn?: boolean;
};

export type NavigationCatalogOptions = {
  pathname: string;
  upcomingEvent: UpcomingNavigationEvent;
  hasOngoingRaid: boolean;
  hasUnconsumedCoupons: boolean;
  isSignedIn: boolean;
  currentUsername?: string | null;
  hasRecentNews?: boolean;
  hasUnreadFeedbackReplies?: boolean;
  menuBadgeOverrides?: Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>>;
};

export type NavigationGroup = {
  id: Exclude<NavigationGroupId, "home" | "settings" | "account">;
  name: string;
  shortName: string;
  OutlineIcon: IconComponent;
  SolidIcon: IconComponent;
};

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  {
    id: "game",
    name: "게임 정보",
    shortName: "게임 정보",
    OutlineIcon: RectangleGroupIconOutline,
    SolidIcon: RectangleGroupIconSolid,
  },
  {
    id: "planner",
    name: "플래너·계산기",
    shortName: "플래너",
    OutlineIcon: CalculatorIconOutline,
    SolidIcon: CalculatorIconSolid,
  },
  {
    id: "community",
    name: "커뮤니티",
    shortName: "커뮤니티",
    OutlineIcon: ChatBubbleLeftRightIconOutline,
    SolidIcon: ChatBubbleLeftRightIconSolid,
  },
  {
    id: "personal",
    name: "나의 데이터",
    shortName: "나의 데이터",
    OutlineIcon: CircleStackIconOutline,
    SolidIcon: CircleStackIconSolid,
  },
  {
    id: "news",
    name: "소식·도움말",
    shortName: "소식·도움말",
    OutlineIcon: MegaphoneIconOutline,
    SolidIcon: MegaphoneIconSolid,
  },
];

const NAVIGATION_SEARCH_GROUP_ORDER: readonly NavigationGroupId[] = [
  "home",
  "game",
  "planner",
  "community",
  "personal",
  "news",
  "settings",
  "account",
];
const navigationSearchGroupRank = new Map(NAVIGATION_SEARCH_GROUP_ORDER.map((id, index) => [id, index]));

const MORE_GROUPS: readonly { id: NavigationGroupId; name: string }[] = [
  ...NAVIGATION_GROUPS.map(({ id, name }) => ({ id, name })),
  { id: "settings", name: "설정" },
];

export function isEventShopNavigationPath(pathname: string): boolean {
  return pathname === "/utils/event-shop" || /^\/events\/[^/]+\/shop(?:\/|$)/.test(pathname);
}

function itemIsActive(menuId: NavigationMenuId, pathname: string, currentUsername: string | null): boolean {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  switch (menuId) {
    case "home":
      return pathname === "/";
    case "futures":
      return pathname.startsWith("/futures");
    case "events":
      return pathname.startsWith("/events") && !isEventShopNavigationPath(pathname);
    case "raids":
      return pathname.startsWith("/raids");
    case "students":
      return pathname.startsWith("/students");
    case "main-story":
      return pathname.startsWith("/mainstory");
    case "furniture-catalog":
      return pathname === "/furniture" || pathname.startsWith("/furniture/");
    case "coupons":
      return pathname.startsWith("/coupons");
    case "pyroxene-planner":
      return pathname.startsWith("/utils/pyroxene");
    case "student-growth-planner":
      return pathname === "/utils/growth" || pathname.startsWith("/utils/growth/students");
    case "resource-planner":
      return (
        pathname.startsWith("/utils/resources/inventory") ||
        pathname.startsWith("/utils/resources/drafts/")
      );
    case "farming-calculator":
      return normalizedPathname === "/utils/resources/farming";
    case "event-shop-calculator":
      return isEventShopNavigationPath(pathname);
    case "relationship-calculator":
      return pathname.startsWith("/utils/relationship");
    case "raid-score-calculator":
      return pathname.startsWith("/utils/raidscore");
    case "my-students":
      return Boolean(currentUsername && pathname.startsWith(`/@${currentUsername}/students`));
    case "pickup-history":
      return Boolean(currentUsername && pathname.startsWith(`/@${currentUsername}/pickups`));
    case "favorite-students":
      return Boolean(currentUsername && pathname.startsWith(`/@${currentUsername}/futures`));
    case "my-walkthroughs":
      return Boolean(
        currentUsername &&
          (pathname.startsWith(`/@${currentUsername}/timelines`) || pathname.startsWith(`/@${currentUsername}/parties`)),
      );
    case "screen-scanner":
      return pathname === "/scanner" || pathname.startsWith("/scanner/");
    case "external-data":
      return pathname === "/connect" || pathname.startsWith("/connect/");
    case "profile":
      return Boolean(currentUsername && normalizedPathname === `/@${currentUsername}`);
    case "community-feed":
      return pathname.startsWith("/community");
    case "community-timelines":
      return pathname === "/timelines" || pathname.startsWith("/timelines/");
    case "news":
      return pathname.startsWith("/news");
    case "contact":
      return pathname.startsWith("/contact");
  }
}

function accountIsActive(pathname: string, currentUsername: string | null): boolean {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return Boolean(
    currentUsername &&
      (normalizedPathname.startsWith(`/@${currentUsername}/friends`) ||
        normalizedPathname.startsWith("/edit") ||
        normalizedPathname.startsWith("/notifications")),
  );
}

export function getNavigationCatalog({
  pathname,
  upcomingEvent,
  hasOngoingRaid,
  hasUnconsumedCoupons,
  isSignedIn,
  currentUsername = null,
  hasRecentNews = false,
  hasUnreadFeedbackReplies = false,
  menuBadgeOverrides,
}: NavigationCatalogOptions): NavigationCatalogItem[] {
  void upcomingEvent;
  const items: NavigationCatalogItem[] = [
    {
      menuId: "home",
      group: "home",
      surfaces: ["desktop", "mobileBottom", "search"],
      to: "/",
      name: "홈",
      OutlineIcon: HomeIconOutline,
      SolidIcon: HomeIconSolid,
      isActive: itemIsActive("home", pathname, currentUsername),
    },
    {
      menuId: "community-feed",
      group: "community",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/community",
      name: "피드",
      mobileNavigationId: "feed",
      OutlineIcon: ChatBubbleLeftRightIconOutline,
      SolidIcon: ChatBubbleLeftRightIconSolid,
      isActive: itemIsActive("community-feed", pathname, currentUsername),
    },
    {
      menuId: "futures",
      group: "game",
      surfaces: ["desktop", "mobileBottom", "search"],
      to: "/futures",
      name: "미래시",
      favoriteId: "futures",
      description: "이벤트와 모집 일정을 확인해보세요",
      mobileNavigationId: undefined,
      OutlineIcon: CalendarIconOutline,
      SolidIcon: CalendarIconSolid,
      isActive: itemIsActive("futures", pathname, currentUsername),
    },
    {
      menuId: "events",
      group: "game",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/events",
      name: "이벤트",
      mobileNavigationId: "events",
      favoriteId: "events",
      description: "이벤트 개최, 복각, 상설 일정을 확인해보세요",
      OutlineIcon: ListBulletIconOutline,
      SolidIcon: ListBulletIconSolid,
      isActive: itemIsActive("events", pathname, currentUsername),
    },
    {
      menuId: "raids",
      group: "game",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/raids",
      name: "총력전 / 대결전",
      mobileNavigationId: "raids",
      mobileLabel: "총력전",
      favoriteId: "raids",
      description: "시즌 요약, 상위권 편성, 공략 영상을 확인해보세요",
      badgeLabel: hasOngoingRaid ? "진행중" : undefined,
      OutlineIcon: FireIconOutline,
      SolidIcon: FireIconSolid,
      isActive: itemIsActive("raids", pathname, currentUsername),
    },
    {
      menuId: "students",
      group: "game",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/students",
      name: "학생부",
      mobileNavigationId: "students",
      favoriteId: "students",
      description: "학생 프로필과 평가를 확인해보세요",
      OutlineIcon: IdentificationIconOutline,
      SolidIcon: IdentificationIconSolid,
      isActive: itemIsActive("students", pathname, currentUsername),
    },
    {
      menuId: "main-story",
      group: "game",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/mainstory",
      name: "메인 스토리",
      mobileNavigationId: "main-story",
      favoriteId: "main-story",
      description: "메인 스토리 공개 일정을 확인해보세요",
      OutlineIcon: BookOpenIconOutline,
      SolidIcon: BookOpenIconSolid,
      isActive: itemIsActive("main-story", pathname, currentUsername),
    },
    {
      menuId: "furniture-catalog",
      group: "game",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/furniture",
      name: "가구 도감",
      mobileNavigationId: "furniture-catalog",
      favoriteId: "furniture-catalog",
      description: "테마별 가구 구성과 보유 현황을 확인해보세요",
      OutlineIcon: RectangleGroupIconOutline,
      SolidIcon: RectangleGroupIconSolid,
      isActive: itemIsActive("furniture-catalog", pathname, currentUsername),
    },
    {
      menuId: "coupons",
      group: "game",
      surfaces: ["desktop", "more", "search"],
      to: "/coupons",
      name: "쿠폰",
      favoriteId: "coupons",
      description: "사용 가능한 쿠폰을 확인하고 등록해보세요",
      OutlineIcon: TicketIconOutline,
      SolidIcon: TicketIconSolid,
      isActive: itemIsActive("coupons", pathname, currentUsername),
      showRedDot: hasUnconsumedCoupons,
    },
    {
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/planner",
      name: "통합 플래너",
      mobileNavigationId: "integrated-planner",
      mobileLabel: "통합 플래너",
      favoriteId: "integrated-planner",
      description: "모집·청휘석·이벤트 상점 계획을 날짜별로 확인해보세요",
      OutlineIcon: CalendarIconOutline,
      SolidIcon: CalendarIconSolid,
      isActive: pathname.startsWith("/planner"),
    },
    {
      menuId: "pyroxene-planner",
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/utils/pyroxene",
      name: "청휘석 플래너",
      mobileNavigationId: "pyroxene-planner",
      favoriteId: "pyroxene-planner",
      description: "모집 시점의 청휘석을 계산해보세요",
      badgeLabel: isSignedIn ? undefined : "로그인 없이 사용",
      OutlineIcon: CreditCardIconOutline,
      SolidIcon: CreditCardIconSolid,
      isActive: itemIsActive("pyroxene-planner", pathname, currentUsername),
    },
    {
      group: "planner",
      surfaces: ["desktop", "more", "search"],
      to: "/utils/ap",
      name: "AP 플래너",
      favoriteId: "ap-planner",
      description: "상점 목표에 필요한 AP를 준비해보세요",
      OutlineIcon: BoltIconOutline,
      SolidIcon: BoltIconSolid,
      isActive: pathname.startsWith("/utils/ap"),
    },
    {
      menuId: "student-growth-planner",
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/utils/growth/students",
      name: "학생 성장 플래너",
      mobileNavigationId: "student-growth-planner",
      mobileLabel: "성장 플래너",
      favoriteId: "student-growth-planner",
      description: "성장에 필요한 재화를 정리해보세요",
      OutlineIcon: TableCellsIconOutline,
      SolidIcon: TableCellsIconSolid,
      isActive: itemIsActive("student-growth-planner", pathname, currentUsername),
    },
    {
      menuId: "resource-planner",
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/utils/resources/inventory",
      name: "재화 플래너",
      mobileNavigationId: "resource-planner",
      mobileLabel: "재화 플래너",
      favoriteId: "resource-planner",
      description: "각 재화의 보유·필요 수량을 관리해요",
      OutlineIcon: ArchiveBoxIconOutline,
      SolidIcon: ArchiveBoxIconSolid,
      isActive: itemIsActive("resource-planner", pathname, currentUsername),
    },
    {
      menuId: "farming-calculator",
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/utils/resources/farming",
      name: "파밍 계산기",
      mobileNavigationId: "farming-calculator",
      mobileLabel: "파밍 계산기",
      favoriteId: "farming-calculator",
      description: "필요 장비를 얻을 스테이지를 계산해요",
      OutlineIcon: MapIconOutline,
      SolidIcon: MapIconSolid,
      isActive: itemIsActive("farming-calculator", pathname, currentUsername),
    },
    {
      menuId: "event-shop-calculator",
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/utils/event-shop",
      name: "이벤트 상점 계산기",
      mobileNavigationId: "event-shop-calculator",
      mobileLabel: "상점 계산기",
      favoriteId: "event-shop-calculator",
      description: "이벤트 효율과 상점을 확인해보세요",
      OutlineIcon: BoltIconOutline,
      SolidIcon: BoltIconSolid,
      isActive: itemIsActive("event-shop-calculator", pathname, currentUsername),
    },
    {
      menuId: "relationship-calculator",
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/utils/relationship",
      name: "인연 랭크 계산기",
      mobileNavigationId: "relationship-calculator",
      mobileLabel: "인연 계산기",
      favoriteId: "relationship-calculator",
      description: "학생별 인연 랭크를 계산해보세요",
      OutlineIcon: HeartIconOutline,
      SolidIcon: HeartIconSolid,
      isActive: itemIsActive("relationship-calculator", pathname, currentUsername),
    },
    {
      menuId: "raid-score-calculator",
      group: "planner",
      surfaces: ["desktop", "mobileBottom", "more", "search"],
      to: "/utils/raidscore",
      name: "총력전 점수 계산기",
      mobileNavigationId: "raid-score-calculator",
      mobileLabel: "점수 계산기",
      favoriteId: "raid-score-calculator",
      description: "클리어 시간 기준 점수를 계산해보세요",
      OutlineIcon: ClockIconOutline,
      SolidIcon: ClockIconSolid,
      isActive: itemIsActive("raid-score-calculator", pathname, currentUsername),
    },
    {
      menuId: "profile",
      group: "personal",
      surfaces: ["desktop", "more", "search"],
      to: currentUsername ? `/@${currentUsername}` : "/unauthorized",
      name: "프로필",
      favoriteId: "profile",
      requiresSignIn: true,
      OutlineIcon: UserCircleIconOutline,
      SolidIcon: UserCircleIconSolid,
      isActive: itemIsActive("profile", pathname, currentUsername),
    },
    {
      menuId: "my-students",
      group: "personal",
      surfaces: ["desktop", "more", "search"],
      to: currentUsername ? `/@${currentUsername}/students` : "/unauthorized",
      name: "모집한 학생",
      requiresSignIn: true,
      OutlineIcon: UserIconOutline,
      SolidIcon: UserIconSolid,
      isActive: itemIsActive("my-students", pathname, currentUsername),
    },
    {
      menuId: "pickup-history",
      group: "personal",
      surfaces: ["desktop", "more", "search"],
      to: currentUsername ? `/@${currentUsername}/pickups` : "/unauthorized",
      name: "모집 기록",
      requiresSignIn: true,
      OutlineIcon: ChartBarIconOutline,
      SolidIcon: ChartBarIconSolid,
      isActive: itemIsActive("pickup-history", pathname, currentUsername),
    },
    {
      menuId: "favorite-students",
      group: "personal",
      surfaces: ["desktop", "more", "search"],
      to: currentUsername ? `/@${currentUsername}/futures` : "/unauthorized",
      name: "관심 학생",
      requiresSignIn: true,
      OutlineIcon: HeartIconOutline,
      SolidIcon: HeartIconSolid,
      isActive: itemIsActive("favorite-students", pathname, currentUsername),
    },
    {
      menuId: "my-walkthroughs",
      group: "personal",
      surfaces: ["desktop", "more", "search"],
      to: currentUsername ? `/@${currentUsername}/timelines` : "/unauthorized",
      name: "공략 작성하기",
      requiresSignIn: true,
      OutlineIcon: QueueListIconOutline,
      SolidIcon: QueueListIconSolid,
      isActive: itemIsActive("my-walkthroughs", pathname, currentUsername),
    },
    {
      menuId: "screen-scanner",
      group: "personal",
      surfaces: ["desktop", "more", "search"],
      to: "/scanner/resource",
      name: "게임 화면 인식기",
      favoriteId: "scanner-resource",
      requiresSignIn: true,
      OutlineIcon: CameraIconOutline,
      SolidIcon: CameraIconSolid,
      isActive: itemIsActive("screen-scanner", pathname, currentUsername),
    },
    {
      menuId: "external-data",
      group: "personal",
      surfaces: ["desktop", "more", "search"],
      to: "/connect/import",
      name: "외부 데이터 연동",
      favoriteId: "connect-import",
      requiresSignIn: true,
      OutlineIcon: ArrowsRightLeftIconOutline,
      SolidIcon: ArrowsRightLeftIconSolid,
      isActive: itemIsActive("external-data", pathname, currentUsername),
    },
    {
      menuId: "community-timelines",
      group: "community",
      surfaces: ["desktop", "more", "search"],
      to: "/timelines",
      name: "공략 타임라인",
      mobileNavigationId: "strategy-timeline",
      mobileLabel: "공략",
      favoriteId: "strategy-timeline",
      description: "공략을 찾아보고 실전에서 순서대로 확인해보세요",
      OutlineIcon: QueueListIconOutline,
      SolidIcon: QueueListIconSolid,
      isActive: itemIsActive("community-timelines", pathname, currentUsername),
    },
    {
      menuId: "news",
      group: "news",
      surfaces: ["desktop", "more", "search"],
      to: "/news",
      name: "업데이트 소식",
      favoriteId: "news",
      OutlineIcon: MegaphoneIconOutline,
      SolidIcon: MegaphoneIconSolid,
      showRedDot: hasRecentNews,
      isActive: itemIsActive("news", pathname, currentUsername),
    },
    {
      menuId: "contact",
      group: "news",
      surfaces: ["desktop", "more", "search"],
      to: "/contact",
      name: "제안/문의",
      favoriteId: "contact",
      OutlineIcon: EnvelopeIconOutline,
      SolidIcon: EnvelopeIconSolid,
      showRedDot: hasUnreadFeedbackReplies,
      isActive: itemIsActive("contact", pathname, currentUsername),
    },
    {
      group: "account",
      surfaces: ["account"],
      to: currentUsername ? `/@${currentUsername}` : "/",
      name: "내 프로필 보기",
      OutlineIcon: IdentificationIconOutline,
      SolidIcon: IdentificationIconOutline,
      isActive: accountIsActive(pathname, currentUsername),
      requiresSignIn: true,
    },
    {
      group: "settings",
      surfaces: ["account", "more"],
      to: "/edit",
      name: "프로필 편집",
      OutlineIcon: UserCircleIconOutline,
      SolidIcon: UserCircleIconSolid,
      isActive: pathname.startsWith("/edit"),
      requiresSignIn: true,
    },
    {
      group: "settings",
      surfaces: ["account", "more", "search"],
      to: "/notifications",
      name: "알림 설정",
      favoriteId: "notifications",
      description: "게임 일정을 잊지 않도록 알림으로 받아보세요",
      OutlineIcon: Cog6ToothIconOutline,
      SolidIcon: Cog6ToothIconSolid,
      isActive: pathname.startsWith("/notifications"),
      requiresSignIn: true,
    },
    {
      group: "account",
      surfaces: ["account"],
      to: "/signout",
      name: "로그아웃",
      OutlineIcon: ArrowsRightLeftIconOutline,
      SolidIcon: ArrowsRightLeftIconSolid,
      requiresSignIn: true,
    },
    {
      group: "account",
      surfaces: ["mobileBottom"],
      to: "/more",
      name: "더보기",
      OutlineIcon: EllipsisHorizontalCircleIconOutline,
      SolidIcon: EllipsisHorizontalCircleIconSolid,
      isActive: pathname === "/more" || pathname.startsWith("/more/"),
    },
  ];

  return items.map((item) => {
    if (!item.menuId) return item;
    const badge = applyMenuBadgeOverride(
      item.menuId,
      { label: item.badgeLabel, showRedDot: item.showRedDot },
      menuBadgeOverrides?.[item.menuId],
    );
    return { ...item, badgeLabel: badge.label, showRedDot: badge.showRedDot };
  });
}

export type DesktopNavigation = {
  homeItem: NavigationItem;
  groups: { id: NavigationGroupId; name: string; items: NavigationItem[] }[];
};

export function getDesktopNavigation(options: NavigationCatalogOptions): DesktopNavigation {
  const catalog = getNavigationCatalog(options).filter(
    (item) => item.surfaces.includes("desktop") && (!item.requiresSignIn || options.isSignedIn),
  );
  const homeItem = catalog.find((item) => item.menuId === "home");
  if (!homeItem) throw new Error("Navigation catalog is missing the home item");

  return {
    homeItem,
    groups: NAVIGATION_GROUPS.map((group) => ({
      id: group.id,
      name: group.name,
      items: catalog.filter((item) => item.group === group.id),
    })).filter((group) => group.items.length > 0),
  };
}

export function getNavigationFavoriteItems(options: NavigationCatalogOptions): NavigationItem[] {
  return getNavigationCatalog(options).filter((item) => item.favoriteId && (!item.requiresSignIn || options.isSignedIn));
}

export function isAccountNavigationActive(pathname: string, currentUsername: string | null): boolean {
  return accountIsActive(pathname, currentUsername);
}

export function getMobileNavigationItems({
  pathname,
  upcomingEvent,
  currentUsername = null,
  mobileNavigationIds = DEFAULT_MOBILE_NAVIGATION_IDS,
  menuBadgeOverrides,
}: {
  pathname: string;
  upcomingEvent: UpcomingNavigationEvent;
  currentUsername?: string | null;
  mobileNavigationIds?: unknown;
  menuBadgeOverrides?: Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>>;
}): NavigationItem[] {
  const catalog = getNavigationCatalog({
    pathname,
    upcomingEvent,
    hasOngoingRaid: false,
    hasUnconsumedCoupons: false,
    isSignedIn: currentUsername !== null,
    currentUsername,
    menuBadgeOverrides,
  });
  const normalizedIds = normalizeMobileNavigationIds(mobileNavigationIds);
  const candidatesById = new Map(
    catalog
      .filter((item): item is NavigationCatalogItem & { mobileNavigationId: MobileNavigationId } =>
        Boolean(item.mobileNavigationId),
      )
      .map((item) => [item.mobileNavigationId, item]),
  );
  const selectedItems = normalizedIds.flatMap((id) => {
    const item = candidatesById.get(id);
    return item ? [{ ...item, name: item.mobileLabel ?? item.name }] : [];
  });
  const homeItem = catalog.find((item) => item.menuId === "home");
  const futuresItem = catalog.find((item) => item.menuId === "futures");
  const moreItem = catalog.find((item) => item.to === "/more");
  return [homeItem, futuresItem, ...selectedItems, moreItem].filter(
    (item): item is NavigationCatalogItem => Boolean(item),
  );
}

export function getMobileNavigationOptions(options: NavigationCatalogOptions): NavigationItem[] {
  const catalog = getNavigationCatalog(options);
  const order = new Map<MobileNavigationId, number>(MOBILE_NAVIGATION_IDS.map((id, index) => [id, index]));
  return catalog
    .filter((item): item is NavigationCatalogItem & { mobileNavigationId: MobileNavigationId } =>
      Boolean(item.mobileNavigationId),
    )
    .sort(
      (a, b) =>
        (order.get(a.mobileNavigationId) ?? Number.POSITIVE_INFINITY) -
        (order.get(b.mobileNavigationId) ?? Number.POSITIVE_INFINITY),
    )
    .map((item) => ({ ...item, name: item.mobileLabel ?? item.name }));
}

export function getMoreNavigationItems(options: NavigationCatalogOptions): NavigationItem[] {
  return getNavigationCatalog(options).filter(
    (item) => item.surfaces.includes("more") && (!item.requiresSignIn || options.isSignedIn),
  );
}

export type MoreNavigationSection = {
  id: NavigationGroupId;
  name: string;
  items: NavigationItem[];
};

export function getMoreNavigationSections(options: NavigationCatalogOptions): MoreNavigationSection[] {
  const items = getMoreNavigationItems(options);
  return MORE_GROUPS.map((group) => ({
    id: group.id,
    name: group.name,
    items: items.filter((item) => item.group === group.id),
  })).filter((section) => section.items.length > 0 || section.id === "settings");
}

export function getSearchableMenuItems({
  currentUsername = null,
  isSignedIn = currentUsername !== null,
  menuBadgeOverrides,
}: {
  currentUsername?: string | null;
  isSignedIn?: boolean;
  menuBadgeOverrides?: Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>>;
} = {}): SearchableMenuItem[] {
  return getNavigationCatalog({
    pathname: "",
    upcomingEvent: null,
    hasOngoingRaid: false,
    hasUnconsumedCoupons: false,
    isSignedIn,
    currentUsername,
    menuBadgeOverrides,
  })
    .filter((item) => item.surfaces.includes("search") && (isSignedIn || !item.requiresSignIn))
    .sort(
      (left, right) =>
        (navigationSearchGroupRank.get(left.group) ?? Number.POSITIVE_INFINITY) -
        (navigationSearchGroupRank.get(right.group) ?? Number.POSITIVE_INFINITY),
    )
    .map((item) => ({
      id: item.menuId ?? item.favoriteId ?? item.to,
      name: item.name,
      to: item.to,
      requiresSignIn: item.requiresSignIn,
    }));
}

export function getAccountNavigationActions(options: NavigationCatalogOptions): NavigationItem[] {
  return getNavigationCatalog(options).filter(
    (item) => item.surfaces.includes("account") && (!item.requiresSignIn || options.isSignedIn),
  );
}

export function getNavigationGroupBadgeSummary(items: readonly NavigationItem[]): boolean {
  return items.some((item) => item.showRedDot === true);
}
