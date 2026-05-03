export const PYROXENE_PACKAGE_CONFIG = {
  half: { name: "하프 패키지", oneTime: 176, daily: 20 },
  full: { name: "월간 패키지", oneTime: 392, daily: 40 },
} as const;

export type PyroxenePackageType = keyof typeof PYROXENE_PACKAGE_CONFIG;

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
