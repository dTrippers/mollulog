import dayjs from "dayjs";
import { nanoid } from "nanoid/non-secure";
import {
  PYROXENE_ATTENDANCE_CONFIG,
  PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
  PYROXENE_PACKAGE_CONFIG,
  PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
  PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
  type PyroxenePackageType,
  calculateDailyApChargePyroxene,
  normalizePyroxeneTimelineEventAt,
} from "~/models/pyroxene-planner-source-config";
import type { PyroxeneTimelineItem, TimelineSourceType } from "./pyroxene-planner";
import type { PickupResources } from "./pyroxene-timeline";
export {
  DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  PYROXENE_SOURCE_DEFINITIONS,
  type PyroxeneSourceDefinition,
  type PyroxeneSourceType,
} from "./pyroxene-source-definitions";

export { calculateDailyApChargePyroxene };

export function isPyroxeneTimelineSourceVisible(
  display: TimelineSourceType[],
  sourceType: TimelineSourceType,
): boolean {
  return display.includes(sourceType);
}

export function togglePyroxeneTimelineSourceVisibility(
  display: TimelineSourceType[],
  sourceType: TimelineSourceType,
  visible?: boolean,
): TimelineSourceType[] {
  const currentlyVisible = isPyroxeneTimelineSourceVisible(display, sourceType);
  const nextVisible = visible ?? !currentlyVisible;

  if (nextVisible === currentlyVisible) {
    return display;
  }

  if (nextVisible) {
    return [...display, sourceType];
  }

  return display.filter((type) => type !== sourceType);
}

type OptimisticTimelineItemInput = {
  uid?: string;
  eventAt: Date | string;
  source: PyroxeneTimelineItem["source"];
  description: string;
  pyroxeneDelta?: number;
  oneTimeTicketDelta?: number;
  tenTimeTicketDelta?: number;
  repeatIntervalDays?: number | null;
  repeatCount?: number | null;
};

function createOptimisticTimelineItem(input: OptimisticTimelineItemInput): PyroxeneTimelineItem {
  return {
    uid: input.uid ?? nanoid(8),
    userId: 0,
    eventAt: normalizePyroxeneTimelineEventAt(input.eventAt),
    source: input.source,
    description: input.description,
    pyroxeneDelta: input.pyroxeneDelta ?? 0,
    oneTimeTicketDelta: input.oneTimeTicketDelta ?? 0,
    tenTimeTicketDelta: input.tenTimeTicketDelta ?? 0,
    repeatIntervalDays: input.repeatIntervalDays ?? null,
    repeatCount: input.repeatCount ?? null,
  };
}

export function createOptimisticBuyTimelineItems(quantity: number, date: Date): PyroxeneTimelineItem[] {
  return [
    createOptimisticTimelineItem({
      eventAt: date,
      source: "buy",
      description: "청휘석 구매",
      pyroxeneDelta: quantity,
    }),
  ];
}

export function createOptimisticPackageTimelineItems(
  startDate: Date,
  packageType: PyroxenePackageType,
): PyroxeneTimelineItem[] {
  const uid = nanoid(8);
  const eventAt = normalizePyroxeneTimelineEventAt(startDate);
  const { name, oneTime, daily } = PYROXENE_PACKAGE_CONFIG[packageType];

  return [
    createOptimisticTimelineItem({
      uid: `${uid}::onetime`,
      eventAt,
      source: "package_onetime",
      description: `${name} (초회)`,
      pyroxeneDelta: oneTime,
    }),
    createOptimisticTimelineItem({
      uid: `${uid}::daily`,
      eventAt,
      source: "package_daily",
      description: `${name} (일간)`,
      pyroxeneDelta: daily,
      repeatIntervalDays: PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
      repeatCount: PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
    }),
  ];
}

export function createOptimisticAttendanceTimelineItems(startDate: Date): PyroxeneTimelineItem[] {
  const uid = nanoid(8);
  const start = dayjs(startDate);

  return PYROXENE_ATTENDANCE_CONFIG.map(({ day, pyroxene }) =>
    createOptimisticTimelineItem({
      uid: `${uid}::${day}`,
      eventAt: start.add(day - 1, "day").toDate(),
      source: "attendance",
      description: `출석 ${day}일차`,
      pyroxeneDelta: pyroxene,
      repeatIntervalDays: PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
    }),
  );
}

export function createOptimisticOtherTimelineItems(
  resources: PickupResources,
  description: string,
  date: Date,
): PyroxeneTimelineItem[] {
  return [
    createOptimisticTimelineItem({
      eventAt: date,
      source: "other",
      description,
      pyroxeneDelta: resources.pyroxene,
      oneTimeTicketDelta: resources.oneTimeTicket,
      tenTimeTicketDelta: resources.tenTimeTicket,
    }),
  ];
}
