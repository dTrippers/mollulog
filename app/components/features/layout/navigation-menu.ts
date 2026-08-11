import {
  ArchiveBoxIcon as ArchiveBoxIconOutline,
  ArrowsRightLeftIcon as ArrowsRightLeftIconOutline,
  BoltIcon as BoltIconOutline,
  BookOpenIcon as BookOpenIconOutline,
  CalendarIcon as CalendarIconOutline,
  CameraIcon as CameraIconOutline,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconOutline,
  ClockIcon as ClockIconOutline,
  Cog6ToothIcon as Cog6ToothIconOutline,
  CreditCardIcon as CreditCardIconOutline,
  EllipsisHorizontalCircleIcon as EllipsisHorizontalCircleIconOutline,
  EnvelopeIcon as EnvelopeIconOutline,
  FireIcon as FireIconOutline,
  GiftIcon as GiftIconOutline,
  HeartIcon as HeartIconOutline,
  HomeIcon as HomeIconOutline,
  IdentificationIcon as IdentificationIconOutline,
  ListBulletIcon as ListBulletIconOutline,
  MegaphoneIcon as MegaphoneIconOutline,
  QueueListIcon as QueueListIconOutline,
  RectangleGroupIcon as RectangleGroupIconOutline,
  TableCellsIcon as TableCellsIconOutline,
  TicketIcon as TicketIconOutline,
} from "@heroicons/react/24/outline";
import {
  ArchiveBoxIcon as ArchiveBoxIconSolid,
  ArrowsRightLeftIcon as ArrowsRightLeftIconSolid,
  BoltIcon as BoltIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  CalendarIcon as CalendarIconSolid,
  CameraIcon as CameraIconSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  ClockIcon as ClockIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  CreditCardIcon as CreditCardIconSolid,
  EllipsisHorizontalCircleIcon as EllipsisHorizontalCircleIconSolid,
  EnvelopeIcon as EnvelopeIconSolid,
  FireIcon as FireIconSolid,
  GiftIcon as GiftIconSolid,
  HeartIcon as HeartIconSolid,
  HomeIcon as HomeIconSolid,
  IdentificationIcon as IdentificationIconSolid,
  ListBulletIcon as ListBulletIconSolid,
  MegaphoneIcon as MegaphoneIconSolid,
  QueueListIcon as QueueListIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  TableCellsIcon as TableCellsIconSolid,
  TicketIcon as TicketIconSolid,
} from "@heroicons/react/24/solid";
import type { ComponentProps, ComponentType } from "react";
import { isInstantAfter, isInstantBefore, nowUtcIso, type UtcIsoString } from "~/lib/date-time";

type IconComponent = ComponentType<ComponentProps<"svg">>;

export type NavigationSurface = "desktop" | "mobileBottom" | "more" | "search";
type NavigationGroup = "primary" | "content" | "planner" | "external" | "profile" | "service" | "mobile";

export type NavigationItem = {
  to: string;
  name: string;
  favoriteId?: string;
  description?: string;
  OutlineIcon: IconComponent;
  SolidIcon: IconComponent;
  isActive?: boolean;
  showRedDot?: boolean;
  redDotAnimate?: boolean;
  badgeLabel?: string;
  disabled?: boolean;
  requiresSignIn?: boolean;
  mobileOrder?: number;
  group?: NavigationGroup;
  surfaces?: readonly NavigationSurface[];
};

type NavigationCatalogItem = NavigationItem & {
  group: NavigationGroup;
  surfaces: readonly NavigationSurface[];
};

export type NavigationSection = {
  name: string;
  description?: string;
  OutlineIcon: IconComponent;
  SolidIcon: IconComponent;
  isActive: boolean;
  items: NavigationItem[];
};

export type NavigationSectionStates = {
  isCommunityActive: boolean;
  isContentActive: boolean;
  isUtilActive: boolean;
  isExternalActive: boolean;
  isProfileActive: boolean;
  isMoreActive: boolean;
};

export type UpcomingNavigationEvent = { uid: string; since: UtcIsoString; until: UtcIsoString } | null;

export type SearchableMenuItem = {
  id: string;
  name: string;
  to: string;
};

export type NavigationCatalogOptions = {
  pathname: string;
  upcomingEvent: UpcomingNavigationEvent;
  now?: UtcIsoString;
  hasOngoingRaid: boolean;
  hasUnconsumedCoupons: boolean;
  isSignedIn: boolean;
  currentUsername?: string | null;
  hasRecentNews?: boolean;
  hasUnreadFeedbackReplies?: boolean;
  sectionStates?: NavigationSectionStates;
};

const SECTION_DEFINITIONS = [
  {
    group: "content",
    name: "컨텐츠",
    description: "일정, 학생, 레이드 정보를 확인해보세요",
    OutlineIcon: RectangleGroupIconOutline,
    SolidIcon: RectangleGroupIconSolid,
    activeState: "isContentActive",
  },
  {
    group: "planner",
    name: "플래너 & 계산기",
    description: "계획과 계산 도구를 사용해보세요",
    OutlineIcon: Cog6ToothIconOutline,
    SolidIcon: Cog6ToothIconSolid,
    activeState: "isUtilActive",
  },
  {
    group: "external",
    name: "게임 외 정보",
    description: "게임 밖에서 챙길 정보를 확인해보세요",
    OutlineIcon: GiftIconOutline,
    SolidIcon: GiftIconSolid,
    activeState: "isExternalActive",
  },
] as const;

export function getNavigationSectionStates(
  pathname: string,
  upcomingEvent: UpcomingNavigationEvent,
): NavigationSectionStates {
  const isHomeActive = pathname === "/";
  const isFuturesActive = pathname.startsWith("/futures");
  const isCommunityActive = pathname.startsWith("/community");
  const isStudentActive = pathname.startsWith("/students");
  const isMoreActive =
    pathname.startsWith("/more") || !(isHomeActive || isFuturesActive || isCommunityActive || isStudentActive);

  return {
    isCommunityActive,
    isContentActive:
      isFuturesActive ||
      pathname.startsWith("/events") ||
      pathname.startsWith("/raids") ||
      isStudentActive ||
      pathname.startsWith("/mainstory"),
    isUtilActive:
      pathname.startsWith("/utils") ||
      pathname.startsWith("/timelines") ||
      !!(upcomingEvent && pathname.startsWith(`/events/${upcomingEvent.uid}`)),
    isExternalActive: pathname.startsWith("/coupons"),
    isProfileActive:
      pathname.startsWith("/@") ||
      pathname.startsWith("/edit") ||
      pathname.startsWith("/my") ||
      pathname.startsWith("/connect") ||
      pathname.startsWith("/scanner"),
    isMoreActive,
  };
}

export function getNavigationCatalog({
  pathname,
  upcomingEvent,
  now = nowUtcIso(),
  hasOngoingRaid,
  hasUnconsumedCoupons,
  isSignedIn,
  currentUsername = null,
  hasRecentNews = false,
  hasUnreadFeedbackReplies = false,
  sectionStates = getNavigationSectionStates(pathname, upcomingEvent),
}: NavigationCatalogOptions): NavigationCatalogItem[] {
  const items: NavigationCatalogItem[] = [
    {
      group: "primary",
      surfaces: ["desktop", "mobileBottom", "search"],
      to: "/",
      name: "홈",
      OutlineIcon: HomeIconOutline,
      SolidIcon: HomeIconSolid,
      isActive: pathname === "/",
      mobileOrder: 0,
    },
    {
      group: "primary",
      surfaces: ["desktop", "mobileBottom", "search"],
      to: "/community",
      name: "피드",
      OutlineIcon: ChatBubbleLeftRightIconOutline,
      SolidIcon: ChatBubbleLeftRightIconSolid,
      isActive: sectionStates.isCommunityActive,
      mobileOrder: 2,
    },
    {
      group: "content",
      surfaces: ["desktop", "mobileBottom", "search"],
      to: "/futures",
      name: "미래시",
      favoriteId: "futures",
      description: "이벤트와 모집 일정을 확인해보세요",
      OutlineIcon: CalendarIconOutline,
      SolidIcon: CalendarIconSolid,
      isActive: pathname.startsWith("/futures"),
      mobileOrder: 1,
    },
    {
      group: "content",
      surfaces: ["desktop", "more", "search"],
      to: "/events",
      name: "이벤트",
      favoriteId: "events",
      description: "이벤트 개최, 복각, 상설 일정을 확인해보세요",
      OutlineIcon: ListBulletIconOutline,
      SolidIcon: ListBulletIconSolid,
      isActive: pathname.startsWith("/events"),
    },
    {
      group: "content",
      surfaces: ["desktop", "more", "search"],
      to: "/raids",
      name: "총력전 / 대결전",
      favoriteId: "raids",
      description: "시즌 요약, 상위권 편성, 공략 영상을 확인해보세요",
      badgeLabel: hasOngoingRaid ? "진행중" : undefined,
      OutlineIcon: FireIconOutline,
      SolidIcon: FireIconSolid,
      isActive: pathname.startsWith("/raids"),
    },
    {
      group: "content",
      surfaces: ["desktop", "mobileBottom", "search"],
      to: "/students",
      name: "학생부",
      favoriteId: "students",
      description: "학생 프로필과 평가를 확인해보세요",
      OutlineIcon: IdentificationIconOutline,
      SolidIcon: IdentificationIconSolid,
      isActive: pathname.startsWith("/students"),
      mobileOrder: 3,
    },
    {
      group: "content",
      surfaces: ["desktop", "more", "search"],
      to: "/mainstory",
      name: "메인 스토리",
      favoriteId: "main-story",
      description: "메인 스토리 공개 일정을 확인해보세요",
      OutlineIcon: BookOpenIconOutline,
      SolidIcon: BookOpenIconSolid,
      isActive: pathname.startsWith("/mainstory"),
    },
    {
      group: "planner",
      surfaces: ["desktop", "search"],
      to: "/utils/pyroxene",
      name: "청휘석 플래너",
      favoriteId: "pyroxene-planner",
      description: "모집 시점의 청휘석을 계산해보세요",
      badgeLabel: isSignedIn ? undefined : "로그인 없이 사용",
      OutlineIcon: CreditCardIconOutline,
      SolidIcon: CreditCardIconSolid,
      isActive: pathname.startsWith("/utils/pyroxene"),
    },
    {
      group: "planner",
      surfaces: ["desktop", "more", "search"],
      to: "/utils/growth/students",
      name: "학생 성장 플래너",
      favoriteId: "student-growth-planner",
      description: "성장에 필요한 재화를 정리해보세요",
      OutlineIcon: TableCellsIconOutline,
      SolidIcon: TableCellsIconSolid,
      isActive: pathname === "/utils/growth" || pathname.startsWith("/utils/growth/students"),
    },
    {
      group: "planner",
      surfaces: ["desktop", "more", "search"],
      to: "/utils/resources/inventory",
      name: "재화 관리/파밍 계산기",
      favoriteId: "resource-planner",
      description: "보유 재화와 장비 파밍 계획을 확인해보세요",
      OutlineIcon: ArchiveBoxIconOutline,
      SolidIcon: ArchiveBoxIconSolid,
      isActive: pathname.startsWith("/utils/resources"),
    },
    upcomingEvent
      ? {
          group: "planner",
          surfaces: ["desktop", "more", "search"],
          to: `/events/${upcomingEvent.uid}/shop`,
          name: "이벤트 소탕 계산기",
          favoriteId: "event-shop-calculator",
          description: "이벤트 효율과 상점을 확인해보세요",
          OutlineIcon: BoltIconOutline,
          SolidIcon: BoltIconSolid,
          badgeLabel:
            isInstantBefore(upcomingEvent.since, now) && isInstantAfter(upcomingEvent.until, now)
              ? "개최중"
              : undefined,
          isActive: pathname.startsWith(`/events/${upcomingEvent.uid}`),
        }
      : {
          group: "planner",
          surfaces: ["desktop", "more", "search"],
          to: "/futures",
          name: "이벤트 소탕 계산기",
          favoriteId: "event-shop-calculator",
          description: "진행중인 이벤트 상점을 확인해보세요",
          OutlineIcon: BoltIconOutline,
          SolidIcon: BoltIconSolid,
          disabled: true,
        },
    {
      group: "planner",
      surfaces: ["desktop", "search"],
      to: "/utils/relationship",
      name: "인연 랭크 계산기",
      favoriteId: "relationship-calculator",
      description: "학생별 인연 랭크를 계산해보세요",
      OutlineIcon: HeartIconOutline,
      SolidIcon: HeartIconSolid,
      isActive: pathname.startsWith("/utils/relationship"),
    },
    {
      group: "planner",
      surfaces: ["desktop", "more", "search"],
      to: "/timelines",
      name: "공략 타임라인",
      favoriteId: "strategy-timeline",
      description: "공략을 찾아보고 실전에서 순서대로 확인해보세요",
      OutlineIcon: QueueListIconOutline,
      SolidIcon: QueueListIconSolid,
      isActive: pathname.startsWith("/timelines"),
      badgeLabel: "베타",
    },
    {
      group: "planner",
      surfaces: ["desktop", "more", "search"],
      to: "/utils/raidscore",
      name: "총력전 점수 계산기",
      favoriteId: "raid-score-calculator",
      description: "클리어 시간 기준 점수를 계산해보세요",
      OutlineIcon: ClockIconOutline,
      SolidIcon: ClockIconSolid,
      isActive: pathname.startsWith("/utils/raidscore"),
    },
    {
      group: "external",
      surfaces: ["desktop", "search"],
      to: "/coupons",
      name: "쿠폰",
      favoriteId: "coupons",
      description: "사용 가능한 쿠폰을 확인하고 등록해보세요",
      OutlineIcon: TicketIconOutline,
      SolidIcon: TicketIconSolid,
      isActive: pathname.startsWith("/coupons"),
      showRedDot: hasUnconsumedCoupons,
    },
    ...(currentUsername
      ? [
          {
            group: "profile" as const,
            surfaces: ["desktop", "search"] as const,
            to: `/@${currentUsername}`,
            name: "내 프로필",
            favoriteId: "profile",
            OutlineIcon: IdentificationIconOutline,
            SolidIcon: IdentificationIconSolid,
            isActive: pathname.startsWith("/@"),
          },
        ]
      : []),
    {
      group: "profile",
      surfaces: ["desktop", "search"],
      to: "/scanner/resource",
      name: "스크린샷/영상 인식기",
      favoriteId: "scanner-resource",
      badgeLabel: "v1.2",
      showRedDot: true,
      requiresSignIn: true,
      OutlineIcon: CameraIconOutline,
      SolidIcon: CameraIconSolid,
      isActive: pathname.startsWith("/scanner"),
    },
    {
      group: "profile",
      surfaces: ["desktop", "search"],
      to: "/connect/import",
      name: "외부 데이터 연동",
      favoriteId: "connect-import",
      badgeLabel: "베타",
      requiresSignIn: true,
      OutlineIcon: ArrowsRightLeftIconOutline,
      SolidIcon: ArrowsRightLeftIconSolid,
      isActive: pathname.startsWith("/connect"),
    },
    {
      group: "service",
      surfaces: ["desktop", "search"],
      to: "/news",
      name: "업데이트 소식",
      favoriteId: "news",
      OutlineIcon: MegaphoneIconOutline,
      SolidIcon: MegaphoneIconSolid,
      showRedDot: hasRecentNews,
      redDotAnimate: false,
    },
    {
      group: "service",
      surfaces: ["desktop", "search"],
      to: "/contact",
      name: "제안/문의",
      favoriteId: "contact",
      OutlineIcon: EnvelopeIconOutline,
      SolidIcon: EnvelopeIconSolid,
      showRedDot: hasUnreadFeedbackReplies,
      redDotAnimate: false,
    },
    {
      group: "mobile",
      surfaces: ["mobileBottom"],
      to: "/more",
      name: "더보기",
      OutlineIcon: EllipsisHorizontalCircleIconOutline,
      SolidIcon: EllipsisHorizontalCircleIconSolid,
      isActive: sectionStates.isMoreActive,
      mobileOrder: 4,
    },
  ];

  return items;
}

export function getNavigationSections(options: NavigationCatalogOptions): NavigationSection[] {
  const catalog = getNavigationCatalog(options);
  const sectionStates = options.sectionStates ?? getNavigationSectionStates(options.pathname, options.upcomingEvent);

  return SECTION_DEFINITIONS.map((section) => ({
    name: section.name,
    description: section.description,
    OutlineIcon: section.OutlineIcon,
    SolidIcon: section.SolidIcon,
    isActive: sectionStates[section.activeState],
    items: catalog.filter((item) => item.group === section.group),
  }));
}

export type DesktopNavigation = {
  primaryItems: NavigationItem[];
  sections: NavigationSection[];
  profileItems: NavigationItem[];
  serviceItems: NavigationItem[];
};

export function getDesktopNavigation(options: NavigationCatalogOptions): DesktopNavigation {
  const catalog = getNavigationCatalog(options).filter(
    (item) => item.surfaces.includes("desktop") && (!item.requiresSignIn || options.isSignedIn),
  );
  const sections = getNavigationSections(options);

  return {
    primaryItems: catalog.filter((item) => item.group === "primary"),
    sections,
    profileItems: catalog.filter((item) => item.group === "profile"),
    serviceItems: catalog.filter((item) => item.group === "service"),
  };
}

export function getMobileNavigationItems({
  pathname,
  upcomingEvent,
}: {
  pathname: string;
  upcomingEvent: UpcomingNavigationEvent;
}): NavigationItem[] {
  return getNavigationCatalog({
    pathname,
    upcomingEvent,
    hasOngoingRaid: false,
    hasUnconsumedCoupons: false,
    isSignedIn: false,
  })
    .filter((item) => item.surfaces.includes("mobileBottom"))
    .sort((a, b) => (a.mobileOrder ?? Number.POSITIVE_INFINITY) - (b.mobileOrder ?? Number.POSITIVE_INFINITY));
}

export function getMoreNavigationItems(options: NavigationCatalogOptions): NavigationItem[] {
  return getNavigationCatalog(options).filter((item) => item.surfaces.includes("more"));
}

export function getServiceNavigationItems({
  pathname,
  hasRecentNews = false,
  hasUnreadFeedbackReplies = false,
}: {
  pathname: string;
  hasRecentNews?: boolean;
  hasUnreadFeedbackReplies?: boolean;
}): NavigationItem[] {
  return getNavigationCatalog({
    pathname,
    upcomingEvent: null,
    hasOngoingRaid: false,
    hasUnconsumedCoupons: false,
    isSignedIn: false,
    hasRecentNews,
    hasUnreadFeedbackReplies,
  }).filter((item) => item.group === "service");
}

export function getSearchableMenuItems({
  currentUsername = null,
}: {
  currentUsername?: string | null;
} = {}): SearchableMenuItem[] {
  return getNavigationCatalog({
    pathname: "",
    upcomingEvent: null,
    hasOngoingRaid: false,
    hasUnconsumedCoupons: false,
    isSignedIn: false,
    currentUsername,
  })
    .filter((item) => item.surfaces.includes("search"))
    .map((item) => ({
      id: item.favoriteId ?? item.to,
      name: item.name,
      to: item.to,
    }));
}
