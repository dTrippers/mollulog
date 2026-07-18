import {
  ArchiveBoxIcon as ArchiveBoxIconOutline,
  BoltIcon as BoltIconOutline,
  BookOpenIcon as BookOpenIconOutline,
  CalendarIcon as CalendarIconOutline,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconOutline,
  ClockIcon as ClockIconOutline,
  Cog6ToothIcon as Cog6ToothIconOutline,
  CreditCardIcon as CreditCardIconOutline,
  EllipsisHorizontalCircleIcon as EllipsisHorizontalCircleIconOutline,
  FireIcon as FireIconOutline,
  GiftIcon as GiftIconOutline,
  HeartIcon as HeartIconOutline,
  HomeIcon as HomeIconOutline,
  IdentificationIcon as IdentificationIconOutline,
  ListBulletIcon as ListBulletIconOutline,
  QueueListIcon as QueueListIconOutline,
  RectangleGroupIcon as RectangleGroupIconOutline,
  TableCellsIcon as TableCellsIconOutline,
  TicketIcon as TicketIconOutline,
} from "@heroicons/react/24/outline";
import {
  ArchiveBoxIcon as ArchiveBoxIconSolid,
  BoltIcon as BoltIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  CalendarIcon as CalendarIconSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  ClockIcon as ClockIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  CreditCardIcon as CreditCardIconSolid,
  EllipsisHorizontalCircleIcon as EllipsisHorizontalCircleIconSolid,
  FireIcon as FireIconSolid,
  GiftIcon as GiftIconSolid,
  HeartIcon as HeartIconSolid,
  HomeIcon as HomeIconSolid,
  IdentificationIcon as IdentificationIconSolid,
  ListBulletIcon as ListBulletIconSolid,
  QueueListIcon as QueueListIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  TableCellsIcon as TableCellsIconSolid,
  TicketIcon as TicketIconSolid,
} from "@heroicons/react/24/solid";
import type { ComponentProps, ComponentType } from "react";
import { isInstantAfter, isInstantBefore, nowUtcIso, type UtcIsoString } from "~/lib/date-time";

type IconComponent = ComponentType<ComponentProps<"svg">>;

export type NavigationItem = {
  to: string;
  name: string;
  description?: string;
  OutlineIcon: IconComponent;
  SolidIcon: IconComponent;
  isActive?: boolean;
  showRedDot?: boolean;
  badgeLabel?: string;
  disabled?: boolean;
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
  name: string;
  to: string;
};

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
      pathname.startsWith("/connect"),
    isMoreActive,
  };
}

export function getNavigationSections({
  pathname,
  upcomingEvent,
  now = nowUtcIso(),
  hasUnconsumedCoupons,
  sectionStates = getNavigationSectionStates(pathname, upcomingEvent),
}: {
  pathname: string;
  upcomingEvent: UpcomingNavigationEvent;
  now?: UtcIsoString;
  hasUnconsumedCoupons: boolean;
  sectionStates?: NavigationSectionStates;
}): NavigationSection[] {
  return [
    {
      name: "컨텐츠",
      description: "일정, 학생, 레이드 정보를 확인해보세요",
      OutlineIcon: RectangleGroupIconOutline,
      SolidIcon: RectangleGroupIconSolid,
      isActive: sectionStates.isContentActive,
      items: [
        {
          to: "/futures",
          name: "미래시",
          description: "이벤트와 모집 일정을 확인해보세요",
          OutlineIcon: CalendarIconOutline,
          SolidIcon: CalendarIconSolid,
          isActive: pathname.startsWith("/futures"),
        },
        {
          to: "/events",
          name: "이벤트",
          description: "이벤트 개최, 복각, 상설 일정을 확인해보세요",
          OutlineIcon: ListBulletIconOutline,
          SolidIcon: ListBulletIconSolid,
          isActive: pathname.startsWith("/events"),
        },
        {
          to: "/raids",
          name: "총력전 / 대결전",
          description: "시즌 요약, 상위권 편성, 공략 영상을 확인해보세요",
          showRedDot: true,
          OutlineIcon: FireIconOutline,
          SolidIcon: FireIconSolid,
          isActive: pathname.startsWith("/raids"),
        },
        {
          to: "/students",
          name: "학생부",
          description: "학생 프로필과 평가를 확인해보세요",
          OutlineIcon: IdentificationIconOutline,
          SolidIcon: IdentificationIconSolid,
          isActive: pathname.startsWith("/students"),
        },
        {
          to: "/mainstory",
          name: "메인 스토리",
          description: "메인 스토리 공개 일정을 확인해보세요",
          OutlineIcon: BookOpenIconOutline,
          SolidIcon: BookOpenIconSolid,
          isActive: pathname.startsWith("/mainstory"),
        },
      ],
    },
    {
      name: "플래너 & 계산기",
      description: "계획과 계산 도구를 사용해보세요",
      OutlineIcon: Cog6ToothIconOutline,
      SolidIcon: Cog6ToothIconSolid,
      isActive: sectionStates.isUtilActive,
      items: [
        {
          to: "/timelines",
          name: "공략 타임라인",
          description: "공략을 찾아보고 실전에서 순서대로 확인해보세요",
          OutlineIcon: QueueListIconOutline,
          SolidIcon: QueueListIconSolid,
          isActive: pathname.startsWith("/timelines"),
          badgeLabel: "베타",
        },
        {
          to: "/utils/pyroxene",
          name: "청휘석 플래너",
          description: "모집 시점의 청휘석을 계산해보세요",
          OutlineIcon: CreditCardIconOutline,
          SolidIcon: CreditCardIconSolid,
          isActive: pathname.startsWith("/utils/pyroxene"),
        },
        {
          to: "/utils/growth/students",
          name: "학생 성장 플래너",
          description: "성장에 필요한 재화를 정리해보세요",
          OutlineIcon: TableCellsIconOutline,
          SolidIcon: TableCellsIconSolid,
          isActive: pathname === "/utils/growth" || pathname.startsWith("/utils/growth/students"),
        },
        {
          to: "/utils/resources/inventory",
          name: "재화 관리/파밍 계산기",
          description: "보유 재화와 장비 파밍 계획을 확인해보세요",
          OutlineIcon: ArchiveBoxIconOutline,
          SolidIcon: ArchiveBoxIconSolid,
          isActive: pathname.startsWith("/utils/resources"),
        },
        upcomingEvent
          ? {
              to: `/events/${upcomingEvent.uid}/shop`,
              name: "이벤트 소탕 계산기",
              description: "이벤트 효율과 상점을 확인해보세요",
              OutlineIcon: BoltIconOutline,
              SolidIcon: BoltIconSolid,
              showRedDot: isInstantBefore(upcomingEvent.since, now) && isInstantAfter(upcomingEvent.until, now),
              isActive: pathname.startsWith(`/events/${upcomingEvent.uid}`),
            }
          : {
              to: "/futures",
              name: "이벤트 소탕 계산기",
              description: "진행중인 이벤트 상점을 확인해보세요",
              OutlineIcon: BoltIconOutline,
              SolidIcon: BoltIconSolid,
              disabled: true,
            },
        {
          to: "/utils/relationship",
          name: "인연 랭크 계산기",
          description: "학생별 인연 랭크를 계산해보세요",
          OutlineIcon: HeartIconOutline,
          SolidIcon: HeartIconSolid,
          isActive: pathname.startsWith("/utils/relationship"),
        },
        {
          to: "/utils/raidscore",
          name: "총력전 점수 계산기",
          description: "클리어 시간 기준 점수를 계산해보세요",
          OutlineIcon: ClockIconOutline,
          SolidIcon: ClockIconSolid,
          isActive: pathname.startsWith("/utils/raidscore"),
        },
      ],
    },
    {
      name: "게임 외 정보",
      description: "게임 밖에서 챙길 정보를 확인해보세요",
      OutlineIcon: GiftIconOutline,
      SolidIcon: GiftIconSolid,
      isActive: sectionStates.isExternalActive,
      items: [
        {
          to: "/coupons",
          name: "쿠폰",
          description: "사용 가능한 쿠폰을 확인하고 등록해보세요",
          OutlineIcon: TicketIconOutline,
          SolidIcon: TicketIconSolid,
          isActive: pathname.startsWith("/coupons"),
          showRedDot: hasUnconsumedCoupons,
        },
      ],
    },
  ];
}

export function getSearchableMenuItems(): SearchableMenuItem[] {
  const sections = getNavigationSections({
    pathname: "",
    upcomingEvent: null,
    hasUnconsumedCoupons: false,
    sectionStates: {
      isCommunityActive: false,
      isContentActive: false,
      isUtilActive: false,
      isExternalActive: false,
      isProfileActive: false,
      isMoreActive: false,
    },
  });

  return [
    { name: "홈", to: "/" },
    { name: "평가/의견", to: "/community" },
    ...sections.flatMap((section) =>
      section.items
        .filter((item) => item.disabled !== true)
        .map((item) => ({
          name: item.name,
          to: item.to,
        })),
    ),
    { name: "업데이트 소식", to: "/news" },
    { name: "제안/문의", to: "/contact" },
  ];
}

export function getMobileNavigationItems({
  pathname,
  upcomingEvent,
}: {
  pathname: string;
  upcomingEvent: UpcomingNavigationEvent;
}): NavigationItem[] {
  const sectionStates = getNavigationSectionStates(pathname, upcomingEvent);

  return [
    {
      to: "/",
      name: "홈",
      OutlineIcon: HomeIconOutline,
      SolidIcon: HomeIconSolid,
      isActive: pathname === "/",
    },
    {
      to: "/futures",
      name: "미래시",
      OutlineIcon: CalendarIconOutline,
      SolidIcon: CalendarIconSolid,
      isActive: pathname.startsWith("/futures"),
    },
    {
      to: "/community",
      name: "평가/의견",
      OutlineIcon: ChatBubbleLeftRightIconOutline,
      SolidIcon: ChatBubbleLeftRightIconSolid,
      isActive: sectionStates.isCommunityActive,
    },
    {
      to: "/students",
      name: "학생부",
      OutlineIcon: IdentificationIconOutline,
      SolidIcon: IdentificationIconSolid,
      isActive: pathname.startsWith("/students"),
    },
    {
      to: "/more",
      name: "더보기",
      OutlineIcon: EllipsisHorizontalCircleIconOutline,
      SolidIcon: EllipsisHorizontalCircleIconSolid,
      isActive: sectionStates.isMoreActive,
    },
  ];
}
