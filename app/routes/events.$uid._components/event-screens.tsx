import {
  InformationCircleIcon,
  MapIcon,
  RectangleStackIcon,
  ShoppingCartIcon,
  SparklesIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type { ScreenTabItem } from "~/components/v2/layout";
import { calendarDayDifference } from "~/domain/home-portal";
import { formatInstant, isInstantAfter, nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import { cardFlipLocale, jankenLocale, roadPuzzleLocale, treasureHuntLocale } from "~/locales/ko";
import type { ShopAvailableEvent } from "~/models/event-content";
import type { EventShopAvailability } from "./event-shop-availability";

export type EventDetailTabKey =
  | "overview"
  | "shop"
  | "simulator"
  | "card-flip"
  | "treasure-hunt"
  | "road-puzzle"
  | "janken";

// A screen of the event detail. The other tabs show it as a tab; the overview lists it in its aside with the description.
export type EventScreen = ScreenTabItem & { key: EventDetailTabKey; description?: string };

const MINIGAME_DESCRIPTION = "미니게임 정보와 결과 시뮬레이션";

export function getActiveEventDetailTab(pathname: string, uid: string): EventDetailTabKey | null {
  if (pathname === `/events/${uid}`) return "overview";
  if (pathname === `/events/${uid}/shop`) return "shop";
  if (pathname === `/events/${uid}/recruitment-simulator`) return "simulator";
  if (pathname === `/events/${uid}/shop/card-flip`) return "card-flip";
  if (pathname === `/events/${uid}/treasure-hunt`) return "treasure-hunt";
  if (pathname === `/events/${uid}/road-puzzle`) return "road-puzzle";
  if (pathname === `/events/${uid}/shop/janken`) return "janken";
  return null;
}

export function buildEventScreens({
  uid,
  recruitmentGroupUid,
  minigameType,
  shopAvailability,
  activeTab,
  linkState,
}: {
  uid: string;
  recruitmentGroupUid: string | null | undefined;
  minigameType: string | null;
  shopAvailability: EventShopAvailability;
  activeTab: EventDetailTabKey | null;
  linkState: unknown;
}): EventScreen[] {
  const shopDisabled = shopAvailability === "no-data" || shopAvailability === "unavailable";
  const shopDisabledReason =
    shopAvailability === "unavailable"
      ? "정보를 불러오지 못했어요"
      : "이 이벤트에는 상점 정보가 아직 없어요. 정보가 들어오면 바로 열려요.";
  const screens: EventScreen[] = [
    {
      key: "overview",
      text: "개요",
      Icon: InformationCircleIcon,
      link: `/events/${uid}`,
    },
    {
      key: "shop",
      text: "상점 계산기",
      description: "상점 재화 구매에 필요한 AP를 계산",
      Icon: ShoppingCartIcon,
      link: `/events/${uid}/shop`,
      disabled: shopDisabled,
      disabledReason: shopDisabledReason,
    },
    {
      key: "simulator",
      text: "모집 시뮬레이션",
      description: "픽업/모집 결과 시뮬레이션",
      Icon: SparklesIcon,
      link: `/events/${uid}/recruitment-simulator`,
      disabled: !recruitmentGroupUid,
      disabledReason: "모집 시뮬레이션은 픽업이 있는 이벤트에서만 쓸 수 있어요.",
    },
  ];
  if (minigameType === "card_flip") {
    screens.push({
      key: "card-flip",
      text: cardFlipLocale.menuTitle,
      description: MINIGAME_DESCRIPTION,
      Icon: RectangleStackIcon,
      link: `/events/${uid}/shop/card-flip`,
      disabled: shopDisabled,
      disabledReason: shopDisabledReason,
    });
  }
  if (minigameType === "janken") {
    screens.push({
      key: "janken",
      text: jankenLocale.menuTitle,
      description: MINIGAME_DESCRIPTION,
      Icon: RectangleStackIcon,
      link: `/events/${uid}/shop/janken`,
      disabled: shopDisabled,
      disabledReason: shopDisabledReason,
    });
  }
  if (minigameType === "treasure_hunt") {
    screens.push({
      key: "treasure-hunt",
      text: treasureHuntLocale.simulatorTitle,
      description: MINIGAME_DESCRIPTION,
      Icon: Squares2X2Icon,
      link: `/events/${uid}/treasure-hunt`,
    });
  }
  if (minigameType === "road_puzzle") {
    screens.push({
      key: "road-puzzle",
      text: roadPuzzleLocale.menuTitle,
      description: MINIGAME_DESCRIPTION,
      Icon: MapIcon,
      link: `/events/${uid}/road-puzzle`,
    });
  }
  return screens.map((screen) => ({ ...screen, active: activeTab === screen.key, linkState }));
}

export type EventPeriod = {
  runType: "복각" | "상설" | null;
  period: string;
  status: { kind: "ended" | "upcoming" | "ongoing"; text: string };
};

// The run type, the period, and the status the header and the overview artwork show for an event.
export function describeEventPeriod(
  event: { runType: string; since: UtcIsoString; until: UtcIsoString | null },
  timeZone: string,
): EventPeriod {
  const now = nowUtcIso();
  const since = formatInstant(event.since, { timeZone, format: "MM/DD" });
  const period = event.until
    ? `${since} ~ ${formatInstant(event.until, { timeZone, format: "MM/DD" })}`
    : `${since}부터`;
  const runType = event.runType === "rerun" ? "복각" : event.runType === "permanent" ? "상설" : null;
  if (event.until && !isInstantAfter(event.until, now)) {
    return { runType, period, status: { kind: "ended", text: "종료" } };
  }
  if (isInstantAfter(event.since, now)) {
    const days = Math.max(1, calendarDayDifference(now, event.since, timeZone));
    return { runType, period, status: { kind: "upcoming", text: `${days}일 후 시작` } };
  }
  const text = event.until ? `${Math.max(1, calendarDayDifference(now, event.until, timeZone))}일 남음` : "진행 중";
  return { runType, period, status: { kind: "ongoing", text } };
}

// What the event layout hands its overview: the other screens for the aside menu, the events for the selector, and the
// period the artwork shows in place of the hidden header.
export type EventLayoutContext = {
  screens: EventScreen[];
  events: ShopAvailableEvent[];
  period: EventPeriod;
};
