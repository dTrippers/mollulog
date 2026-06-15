import dayjs from "dayjs";
import { nanoid } from "nanoid/non-secure";
import {
  PYROXENE_ATTENDANCE_CONFIG,
  PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
  PYROXENE_AP_PACKAGE_CONFIG,
  PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
  PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
  PYROXENE_MONTHLY_PACKAGE_CONFIG,
  type PyroxeneMonthlyPackageType,
  calculateDailyApChargePyroxene,
  normalizePyroxeneTimelineEventAt,
} from "~/models/pyroxene-planner-source-config";
import type { PyroxeneTimelineItem, PyroxeneTimelineRepeatType, TimelineSourceType } from "./pyroxene-planner";
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
  repeatType?: PyroxeneTimelineRepeatType;
  repeatIntervalDays?: number | null;
  repeatCount?: number | null;
  autoRepurchase?: boolean;
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
    repeatType: input.repeatType ?? "fixed_days",
    repeatIntervalDays: input.repeatIntervalDays ?? null,
    repeatCount: input.repeatCount ?? null,
    autoRepurchase: input.autoRepurchase ?? false,
  };
}

type OptimisticBuyTimelineOptions = {
  repeatType?: PyroxeneTimelineRepeatType;
  monthlyCount?: number;
};

function normalizeMonthlyCount(monthlyCount: number | undefined): number {
  if (monthlyCount === undefined || !Number.isFinite(monthlyCount)) {
    return 1;
  }
  return Math.max(1, Math.floor(monthlyCount));
}

export function createOptimisticBuyTimelineItems(
  quantity: number,
  date: Date,
  options: OptimisticBuyTimelineOptions = {},
): PyroxeneTimelineItem[] {
  const normalizedMonthlyCount = normalizeMonthlyCount(options.monthlyCount);

  return [
    createOptimisticTimelineItem({
      eventAt: date,
      source: "buy",
      description: "청휘석 구매",
      pyroxeneDelta: quantity * normalizedMonthlyCount,
      repeatType: options.repeatType,
    }),
  ];
}

export function createOptimisticMonthlyPackageTimelineItems(
  startDate: Date,
  packageType: PyroxeneMonthlyPackageType,
  autoRepurchase = false,
): PyroxeneTimelineItem[] {
  const uid = nanoid(8);
  const eventAt = normalizePyroxeneTimelineEventAt(startDate);
  const { name, oneTime, daily, repurchaseIntervalDays } = PYROXENE_MONTHLY_PACKAGE_CONFIG[packageType];

  return [
    createOptimisticTimelineItem({
      uid: `${uid}::onetime`,
      eventAt,
      source: "package_onetime",
      repeatIntervalDays: autoRepurchase ? repurchaseIntervalDays : null,
      repeatCount: null,
      autoRepurchase,
      description: `${name} (초회)`,
      pyroxeneDelta: oneTime,
    }),
    createOptimisticTimelineItem({
      uid: `${uid}::daily`,
      eventAt,
      source: "package_daily",
      autoRepurchase,
      description: `${name} (일간)`,
      pyroxeneDelta: daily,
      repeatIntervalDays: PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
      repeatCount: autoRepurchase ? null : PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
    }),
  ];
}

export function createOptimisticApPackageTimelineItems(
  startDate: Date,
  autoRepurchase = false,
): PyroxeneTimelineItem[] {
  const uid = nanoid(8);
  const eventAt = normalizePyroxeneTimelineEventAt(startDate);

  return [
    createOptimisticTimelineItem({
      uid: `${uid}::ap`,
      eventAt,
      source: "package_ap",
      repeatIntervalDays: autoRepurchase ? PYROXENE_AP_PACKAGE_CONFIG.repurchaseIntervalDays : null,
      repeatCount: null,
      autoRepurchase,
      description: `${PYROXENE_AP_PACKAGE_CONFIG.name} (초회)`,
      pyroxeneDelta: PYROXENE_AP_PACKAGE_CONFIG.oneTime,
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
