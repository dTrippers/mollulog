import { nanoid } from "nanoid/non-secure";
import dayjs from "~/lib/dayjs";

export type PyroxeneSourceDefinition = {
  type: string;
  label: string;
  defaultVisible: boolean;
};

export const PYROXENE_SOURCE_DEFINITIONS = [
  { type: "event", label: "모집 소비", defaultVisible: true },
  { type: "event_reward", label: "이벤트/스토리 보상", defaultVisible: true },
  { type: "raid", label: "총력전/대결전 보상", defaultVisible: true },
  { type: "buy", label: "청휘석 구매", defaultVisible: true },
  { type: "package_onetime", label: "패키지 (초회)", defaultVisible: true },
  { type: "package_daily", label: "패키지 (일간)", defaultVisible: false },
  { type: "package_ap", label: "AP 패키지", defaultVisible: true },
  { type: "daily_mission", label: "일일 임무", defaultVisible: false },
  { type: "weekly_mission", label: "주간 임무", defaultVisible: false },
  { type: "ap_charge", label: "AP 충전", defaultVisible: true },
  { type: "tactical", label: "전술대회 보상", defaultVisible: false },
  { type: "attendance", label: "출석", defaultVisible: false },
  { type: "other", label: "기타", defaultVisible: false },
] as const satisfies readonly PyroxeneSourceDefinition[];

export type PyroxeneSourceType = (typeof PYROXENE_SOURCE_DEFINITIONS)[number]["type"];

export const DEFAULT_PYROXENE_TIMELINE_DISPLAY = PYROXENE_SOURCE_DEFINITIONS.filter(
  (source) => source.defaultVisible,
).map((source) => source.type) satisfies PyroxeneSourceType[];

export function collectedSourceKeyForEventReward(eventUid: string): string {
  return `event_reward:${eventUid}`;
}

export const PYROXENE_MONTHLY_PACKAGE_CONFIG = {
  half: { name: "하프 패키지", oneTime: 176, daily: 20, repurchaseIntervalDays: 30 },
  full: { name: "청휘석 패키지", oneTime: 392, daily: 40, repurchaseIntervalDays: 30 },
} as const;

export type PyroxeneMonthlyPackageType = keyof typeof PYROXENE_MONTHLY_PACKAGE_CONFIG;

export const PYROXENE_AP_PACKAGE_CONFIG = {
  name: "AP 패키지",
  oneTime: 176,
  repurchaseIntervalDays: 14,
} as const;

export const PYROXENE_RESOURCE_UIDS = {
  pyroxene: "2",
  oneTimeTicket: "6998",
  tenTimeTicket: "6999",
} as const;

export const DEFAULT_BUY_PYROXENE_QUANTITY = 6600;

export const PYROXENE_BUY_PRESET_GROUPS = [
  {
    id: "limited",
    label: "횟수 제한",
    presets: [
      { quantity: 8000, price: "99,000원" },
      { quantity: 6600, price: "99,000원" },
      { quantity: 3920, price: "49,000원" },
      { quantity: 2352, price: "29,000원" },
      { quantity: 1184, price: "15,000원" },
      { quantity: 784, price: "9,900원" },
      { quantity: 352, price: "4,400원" },
      { quantity: 120, price: "1,500원" },
    ],
  },
  {
    id: "regular",
    label: "일반",
    presets: [
      { quantity: 4800, price: "99,000원" },
      { quantity: 2300, price: "49,000원" },
      { quantity: 1350, price: "29,000원" },
      { quantity: 660, price: "15,000원" },
      { quantity: 420, price: "9,900원" },
      { quantity: 179, price: "4,400원" },
      { quantity: 60, price: "1,500원" },
    ],
  },
] as const;

export type PyroxeneBuyPresetGroupId = (typeof PYROXENE_BUY_PRESET_GROUPS)[number]["id"];

export const PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS = 1;
export const PYROXENE_PACKAGE_DAILY_REPEAT_COUNT = 30;

export const PYROXENE_ATTENDANCE_CONFIG = [
  { day: 5, pyroxene: 50 },
  { day: 10, pyroxene: 100 },
] as const;

export const PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS = 10;

export const PYROXENE_AP_CHARGE_MAX_COUNT = 20;

export const PYROXENE_AP_CHARGE_COST_TIERS = [
  { until: 3, pyroxene: 30 },
  { until: 6, pyroxene: 60 },
  { until: 9, pyroxene: 100 },
  { until: 12, pyroxene: 150 },
  { until: 15, pyroxene: 200 },
  { until: PYROXENE_AP_CHARGE_MAX_COUNT, pyroxene: 300 },
] as const;

export function calculateDailyApChargePyroxene(count: number): number {
  const normalizedCount = Math.max(0, Math.min(PYROXENE_AP_CHARGE_MAX_COUNT, Math.floor(count)));
  let remainingCount = normalizedCount;
  let previousUntil = 0;
  let total = 0;

  for (const tier of PYROXENE_AP_CHARGE_COST_TIERS) {
    const tierCount = Math.min(remainingCount, tier.until - previousUntil);
    if (tierCount <= 0) {
      break;
    }
    total += tierCount * tier.pyroxene;
    remainingCount -= tierCount;
    previousUntil = tier.until;
  }

  return total;
}

export function normalizePyroxeneTimelineEventAt(date: Date | string): string {
  return dayjs(date).utcOffset(9).hour(4).minute(0).second(0).millisecond(0).toISOString();
}

export function getBlueArchiveGameDate(now: Date | string = new Date()): dayjs.Dayjs {
  return dayjs(now).tz("Asia/Seoul").subtract(4, "hour").startOf("day");
}

// KST has no daylight saving time, so day boundaries below use fixed offsets instead of the runtime time zone.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const GAME_DAY_RESET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The KST calendar date of an instant, as a day number. */
function kstDayNumber(at: Date | string): number {
  return Math.floor((new Date(at).getTime() + KST_OFFSET_MS) / DAY_MS);
}

/** The game day of an instant, as a day number; a game day starts at 04:00 KST. */
function gameDayNumber(at: Date | string): number {
  return Math.floor((new Date(at).getTime() + KST_OFFSET_MS - GAME_DAY_RESET_MS) / DAY_MS);
}

/** 04:00 KST at the start of the game day an instant falls on. */
export function getPyroxeneGameDayStartAt(at: Date | string): string {
  return new Date(gameDayNumber(at) * DAY_MS - KST_OFFSET_MS + GAME_DAY_RESET_MS).toISOString();
}

/** Whether an instant falls between 00:00 and 04:00 KST, so its game day is the previous calendar date. */
export function isBeforePyroxeneGameDayReset(at: Date | string): boolean {
  return kstDayNumber(at) !== gameDayNumber(at);
}

export function isPyroxeneOneOffGainSource(source: string): source is "buy" | "other" {
  return source === "buy" || source === "other";
}

/**
 * The instant a one-off purchase or direct gain counts from. A gain whose KST date is the current game day is one
 * still to come, so it keeps the time it is recorded instead of 04:00 and stays after inventory entered earlier that
 * day. Before the 04:00 reset, the current game day is the previous calendar date.
 */
export function normalizePyroxeneOneOffGainAt(date: Date | string, now: Date | string = new Date()): string {
  return kstDayNumber(date) === gameDayNumber(now)
    ? new Date(now).toISOString()
    : normalizePyroxeneTimelineEventAt(date);
}

/**
 * The instant an edited one-off gain counts from. While its date stays on the game day it was recorded for, it keeps
 * the recorded instant, so changing only the amount or the name never moves it across an inventory input. An edit
 * form that leaves the date alone sends the stored instant itself, which works in every display time zone.
 */
export function normalizePyroxeneOneOffGainEditAt(
  date: Date | string,
  previousEventAt: string,
  now: Date | string = new Date(),
): string {
  const keepsDate =
    new Date(date).getTime() === new Date(previousEventAt).getTime() ||
    kstDayNumber(date) === gameDayNumber(previousEventAt);
  if (keepsDate) return new Date(previousEventAt).toISOString();
  return normalizePyroxeneOneOffGainAt(date, now);
}

/** Normalizes a timeline record's instant for its source; see {@link normalizePyroxeneOneOffGainAt}. */
export function normalizePyroxeneTimelineRecordAt(
  date: Date | string,
  source: PyroxeneTimelineItem["source"],
  now: Date | string = new Date(),
): string {
  return isPyroxeneOneOffGainSource(source)
    ? normalizePyroxeneOneOffGainAt(date, now)
    : normalizePyroxeneTimelineEventAt(date);
}

export function calculatePackageStartDateFromRemainingDays(
  remainingDays: number,
  packageDurationDays: number,
  now: Date | string = new Date(),
): Date {
  const normalizedRemainingDays = Math.max(0, Math.min(packageDurationDays - 1, Math.floor(remainingDays)));
  const elapsedDays = packageDurationDays - normalizedRemainingDays - 1;

  return getBlueArchiveGameDate(now).subtract(elapsedDays, "day").toDate();
}

export function extractPyroxeneTimelineBaseUid(uid: string): string {
  return uid.split("::")[0];
}

import type { TimelineSourceType } from "~/domain/pyroxene-planner";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import type { PyroxeneTimelineItem, PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";
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
  now?: Date | string;
};

function createOptimisticTimelineItem(input: OptimisticTimelineItemInput): PyroxeneTimelineItem {
  return {
    uid: input.uid ?? nanoid(8),
    userId: 0,
    eventAt: normalizePyroxeneTimelineRecordAt(input.eventAt, input.source, input.now),
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
  uid?: string;
  now?: Date | string;
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
      uid: options.uid,
      eventAt: date,
      source: "buy",
      description: "청휘석 구매",
      pyroxeneDelta: quantity * normalizedMonthlyCount,
      repeatType: options.repeatType,
      now: options.now,
    }),
  ];
}

export function createOptimisticMonthlyPackageTimelineItems(
  startDate: Date,
  packageType: PyroxeneMonthlyPackageType,
  autoRepurchase = false,
  baseUid = nanoid(8),
): PyroxeneTimelineItem[] {
  const uid = baseUid;
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
  baseUid = nanoid(8),
): PyroxeneTimelineItem[] {
  const uid = baseUid;
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

export function createOptimisticAttendanceTimelineItems(startDate: Date, baseUid = nanoid(8)): PyroxeneTimelineItem[] {
  const uid = baseUid;
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

/** The day-1 date that created the given attendance reward dates (the inverse of the items above). */
export function getAttendanceStartDate(rewardDates: Date[]): Date | null {
  if (rewardDates.length === 0) return null;
  const firstRewardDay = Math.min(...PYROXENE_ATTENDANCE_CONFIG.map(({ day }) => day));
  const earliest = Math.min(...rewardDates.map((date) => date.getTime()));
  return dayjs(earliest)
    .subtract(firstRewardDay - 1, "day")
    .toDate();
}

export function createOptimisticOtherTimelineItems(
  resources: PickupResources,
  description: string,
  date: Date,
  uid?: string,
  now?: Date | string,
): PyroxeneTimelineItem[] {
  return [
    createOptimisticTimelineItem({
      uid,
      eventAt: date,
      source: "other",
      description,
      pyroxeneDelta: resources.pyroxene,
      oneTimeTicketDelta: resources.oneTimeTicket,
      tenTimeTicketDelta: resources.tenTimeTicket,
      now,
    }),
  ];
}
