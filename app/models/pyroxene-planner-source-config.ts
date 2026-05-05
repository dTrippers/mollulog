import dayjs from "~/lib/dayjs";

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
