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
