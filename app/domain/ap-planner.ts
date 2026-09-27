import {
  apChargeExceptionRangesOverlap,
  getPyroxeneApChargeCountForDate,
  type PyroxeneApChargeException,
  type PyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import { calculateDailyApChargePyroxene } from "~/domain/pyroxene-sources";
import dayjs from "~/lib/dayjs";

export const AP_PER_REFILL = 120;
export const AP_PER_NATURAL_REGEN_MINUTES = 1;
export const AP_NATURAL_REGEN_MINUTES = 6;
export const AP_DAILY_TASK_REWARD = 150;
export const AP_PLANNER_MAX_EVENT_PLANS = 500;
export const AP_PLANNER_MAX_JSON_LENGTH = 65_536;

export type ApPlannerEventPlan = {
  accessAt: string | null;
  [key: string]: unknown;
};

export type ApPlannerState = {
  accountLevel: number | null;
  cafeRank: number | null;
  comfort: number | null;
  eventPlans: Record<string, ApPlannerEventPlan>;
  [key: string]: unknown;
};

export type ApPlannerConditions = Pick<ApPlannerState, "accountLevel" | "cafeRank" | "comfort">;

export type ApShopBreakdown = {
  firstClearAp: number;
  questSweepAp: number;
  extraSweepAp: number;
};

export type ApPlannerEvent = {
  timelineUid: string;
  name: string;
  startAt: string;
  endAt: string | null;
  exchangeUntil: string | null;
  requiredAp: number;
  requiredBreakdown: ApShopBreakdown;
};

type ValidApPlannerEvent = Omit<ApPlannerEvent, "endAt"> & { endAt: string };
export type ApPlannerPreviousEvent = Pick<ApPlannerEvent, "name" | "startAt"> & { endAt: string };

export type ApStockpileStep = {
  at: string;
  label: string;
  ap: number;
  kind: "drain" | "charge" | "natural" | "access";
  receivedAp?: number;
};

export type ApSupplyBreakdown = {
  stockpile: number;
  natural: number;
  cafe: number;
  dailyTasks: number;
  apCharges: number;
  dailyTaskDays: number;
  apChargeDays: number;
};

export type ApRefillSuggestion = {
  kind: "event-period" | "stockpile-day";
  startDate: string;
  endDate: string;
  fromCount: number;
  toCount: number;
  additionalAp: number;
  pyroxeneCost: number;
  resultAp: number;
  deficitAfter: number;
};

export type ApPlannerCalculation = {
  status: "input-needed" | "not-planned" | "access-time-needed" | "ready" | "ongoing";
  requiredAp: number;
  requiredBreakdown: ApShopBreakdown;
  availableAp: number | null;
  resultAp: number | null;
  supplyBreakdown: ApSupplyBreakdown | null;
  stockpileSteps: ApStockpileStep[];
  stockpileStartsAt: string | null;
  overlapEventName: string | null;
  refillSuggestions: ApRefillSuggestion[];
  refillOverlapConflict: boolean;
  assumptionLabels: string[];
};

export function hasApShopTarget(requiredAp: number): boolean {
  return Number.isSafeInteger(requiredAp) && requiredAp > 0;
}

export type CafeProduction = {
  comfortMax: number;
  storageMax: number;
  apPerHour: number;
};

const CAFE_RANK_DATA = [
  { coefficient: 29, correction: 9_375, storageMax: 90 },
  { coefficient: 32, correction: 15_625, storageMax: 150 },
  { coefficient: 35, correction: 22_917, storageMax: 220 },
  { coefficient: 38, correction: 31_250, storageMax: 300 },
  { coefficient: 41, correction: 40_625, storageMax: 390 },
  { coefficient: 42, correction: 47_917, storageMax: 460 },
  { coefficient: 42, correction: 55_209, storageMax: 530 },
  { coefficient: 42, correction: 62_500, storageMax: 600 },
  { coefficient: 42, correction: 69_792, storageMax: 670 },
  { coefficient: 42, correction: 77_084, storageMax: 740 },
] as const;

const KST = "Asia/Seoul";
const GAME_RESET_HOUR = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isBoundedJson(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  budget.nodes += 1;
  if (budget.nodes > 4_000 || depth > 12) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 20_000;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return value.length <= 1_000 && value.every((item) => isBoundedJson(item, depth + 1, budget));
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 1_000 &&
    entries.every(([key, item]) => key.length <= 256 && isBoundedJson(item, depth + 1, budget))
  );
}

export function createEmptyApPlannerState(): ApPlannerState {
  return { accountLevel: null, cafeRank: null, comfort: null, eventPlans: {} };
}

export function apPlannerStateHasData(state: ApPlannerState | null): boolean {
  if (!state) return false;
  if (
    state.accountLevel !== null ||
    state.cafeRank !== null ||
    state.comfort !== null ||
    Object.keys(state.eventPlans).length > 0
  ) {
    return true;
  }
  return Object.keys(state).some((key) => !["accountLevel", "cafeRank", "comfort", "eventPlans"].includes(key));
}

/** Parse the AP section while retaining bounded unknown fields for forward compatibility. */
export function normalizeApPlannerState(value: unknown): ApPlannerState | null {
  if (!isRecord(value) || !isBoundedJson(value)) return null;
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return null;
  }
  if (encoded.length > AP_PLANNER_MAX_JSON_LENGTH) return null;
  const accountLevel = value.accountLevel === undefined ? null : value.accountLevel;
  const cafeRank = value.cafeRank === undefined ? null : value.cafeRank;
  const comfort = value.comfort === undefined ? null : value.comfort;
  if (
    !(
      accountLevel === null ||
      (typeof accountLevel === "number" &&
        Number.isSafeInteger(accountLevel) &&
        accountLevel >= 1 &&
        accountLevel <= 90)
    ) ||
    !(
      cafeRank === null ||
      (typeof cafeRank === "number" && Number.isSafeInteger(cafeRank) && cafeRank >= 1 && cafeRank <= 10)
    )
  ) {
    return null;
  }
  const normalizedComfort = cafeRank === null ? null : comfort === null ? comfortMaximum(cafeRank) : comfort;
  const eventPlans = value.eventPlans === undefined ? {} : value.eventPlans;
  if (
    !(
      normalizedComfort === null ||
      (typeof normalizedComfort === "number" &&
        Number.isSafeInteger(normalizedComfort) &&
        normalizedComfort >= 0 &&
        normalizedComfort <= 5_500)
    ) ||
    !isRecord(eventPlans) ||
    Object.keys(eventPlans).length > AP_PLANNER_MAX_EVENT_PLANS
  ) {
    return null;
  }
  if (
    (cafeRank === null && comfort !== null) ||
    (cafeRank !== null && normalizedComfort !== null && normalizedComfort > comfortMaximum(cafeRank))
  )
    return null;

  const normalizedPlans = Object.create(null) as Record<string, ApPlannerEventPlan>;
  for (const [timelineUid, plan] of Object.entries(eventPlans)) {
    if (
      timelineUid.length === 0 ||
      timelineUid.length > 200 ||
      !isRecord(plan) ||
      !(plan.accessAt === null || isInstant(plan.accessAt))
    ) {
      return null;
    }
    normalizedPlans[timelineUid] = { ...plan, accessAt: plan.accessAt as string | null };
  }
  const normalized: ApPlannerState = {
    ...value,
    accountLevel: accountLevel as number | null,
    cafeRank: cafeRank as number | null,
    comfort: normalizedComfort as number | null,
    eventPlans: normalizedPlans,
  };
  try {
    const normalizedJson = JSON.stringify(normalized);
    if (typeof normalizedJson !== "string" || normalizedJson.length > AP_PLANNER_MAX_JSON_LENGTH) return null;
  } catch {
    return null;
  }
  return normalized;
}

export function maxApForAccountLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 90) throw new RangeError("계정 레벨은 1에서 90 사이여야 해요.");
  return level <= 20 ? 20 + 4 * level : 60 + 2 * level;
}

export function comfortMaximum(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) throw new RangeError("카페 랭크는 1에서 10 사이여야 해요.");
  return 500 + 500 * rank;
}

export function cafeProduction(rank: number, comfort: number | null = null): CafeProduction {
  if (!Number.isInteger(rank) || rank < 1 || rank > CAFE_RANK_DATA.length) {
    throw new RangeError("카페 랭크는 1에서 10 사이여야 해요.");
  }
  const data = CAFE_RANK_DATA[rank - 1];
  const effectiveComfort = comfort ?? comfortMaximum(rank);
  if (!data || !Number.isInteger(effectiveComfort) || effectiveComfort < 0 || effectiveComfort > comfortMaximum(rank)) {
    throw new RangeError("편의성은 0에서 카페 랭크 최대 사이여야 해요.");
  }
  return {
    comfortMax: comfortMaximum(rank),
    storageMax: data.storageMax,
    apPerHour: (data.correction + data.coefficient * effectiveComfort) / 10_000,
  };
}

export function formatCafeApPerHour(rank: number, comfort: number | null = null): string {
  cafeProduction(rank, comfort);
  const data = CAFE_RANK_DATA[rank - 1];
  if (!data) throw new RangeError("카페 랭크는 1에서 10 사이여야 해요.");
  const effectiveComfort = comfort ?? comfortMaximum(rank);
  const numerator = data.correction + data.coefficient * effectiveComfort;
  const roundedTenths = Math.floor((numerator + 500) / 1_000);
  return `${Math.floor(roundedTenths / 10)}.${roundedTenths % 10}`;
}

export function getNextDailyReset(after: string | Date): string {
  const value = dayjs(after).tz(KST);
  let reset = value.startOf("day").hour(GAME_RESET_HOUR).minute(0).second(0).millisecond(0);
  if (!reset.isAfter(value)) reset = reset.add(1, "day");
  return reset.toISOString();
}

export function countDailyResets(from: string | Date, through: string | Date): number {
  const end = dayjs(through);
  let resetAt = dayjs(getNextDailyReset(from));
  let count = 0;
  while (!resetAt.isAfter(end) && count < 400) {
    count += 1;
    resetAt = resetAt.add(1, "day");
  }
  return count;
}

function gameDate(value: string | Date): string {
  return dayjs(value).tz(KST).format("YYYY-MM-DD");
}

function durationHours(from: string, until: string): number {
  return Math.max(0, (Date.parse(until) - Date.parse(from)) / 3_600_000);
}

function cafeSupplyDuring(from: string, until: string, production: CafeProduction): number {
  let cursor = dayjs(from);
  const end = dayjs(until);
  let total = 0;
  let intervals = 0;
  while (cursor.isBefore(end) && intervals < 400) {
    const nextReset = dayjs(getNextDailyReset(cursor.toISOString()));
    const segmentEnd = nextReset.isBefore(end) ? nextReset : end;
    total += Math.min(
      production.storageMax,
      Math.floor(production.apPerHour * durationHours(cursor.toISOString(), segmentEnd.toISOString())),
    );
    cursor = segmentEnd;
    intervals += 1;
  }
  return total;
}

function cafeStoredSupplyDuring(from: string, until: string, production: CafeProduction): number {
  return Math.min(production.storageMax, Math.floor(production.apPerHour * durationHours(from, until)));
}

function dailyChargeDays(from: string, until: string): string[] {
  const dates: string[] = [];
  let date = gameDate(from);
  const lastDate = gameDate(until);
  while (date <= lastDate && dates.length < 400) {
    dates.push(date);
    date = dayjs.tz(`${date}T12:00:00`, KST).add(1, "day").format("YYYY-MM-DD");
  }
  return dates;
}

function dailyResetInstantsBetween(from: string, until: string): string[] {
  const end = dayjs(until);
  let resetAt = dayjs(getNextDailyReset(from));
  const instants: string[] = [];
  while (!resetAt.isAfter(end) && instants.length < 400) {
    instants.push(resetAt.toISOString());
    resetAt = resetAt.add(1, "day");
  }
  return instants;
}

function naturalSupply(from: string, until: string): number {
  return (
    Math.floor(Math.max(0, Date.parse(until) - Date.parse(from)) / (AP_NATURAL_REGEN_MINUTES * 60_000)) *
    AP_PER_NATURAL_REGEN_MINUTES
  );
}

function conditionValues(conditions: ApPlannerConditions): { maxAp: number; cafe: CafeProduction } | null {
  if (conditions.accountLevel === null || conditions.cafeRank === null) return null;
  return {
    maxAp: maxApForAccountLevel(conditions.accountLevel),
    cafe: cafeProduction(conditions.cafeRank, conditions.comfort),
  };
}

function shortage(available: number, required: number): number {
  return required - available;
}

function refillSuggestions(
  event: ValidApPlannerEvent,
  availableAp: number,
  accessAt: string,
  stockpileStartsAt: string,
  stockpileAp: number,
  storedCafeAp: number,
  maxAp: number,
  overlapEventName: string | null,
  options: PyroxenePlannerOptions,
): { suggestions: ApRefillSuggestion[]; overlapConflict: boolean } {
  const deficit = Math.max(0, shortage(availableAp, event.requiredAp));
  const chargeDates = dailyResetInstantsBetween(accessAt, event.endAt).map(gameDate);
  const preparationEnd = dayjs(event.startAt).isBefore(dayjs(accessAt)) ? event.startAt : accessAt;
  const stockpileDates = dailyResetInstantsBetween(stockpileStartsAt, preparationEnd).map(gameDate);
  const baseCount = options.consumption.apChargeCount;
  const suggestions: ApRefillSuggestion[] = [];
  let overlapConflict = false;
  const exceptionRange = (dates: string[], count: number): PyroxeneApChargeException | null => {
    const startDate = dates[0];
    const endDate = dates.at(-1);
    return startDate && endDate ? { uid: "ap-planner-suggestion", startDate, endDate, count } : null;
  };
  const hasOverlappingException = (range: PyroxeneApChargeException | null) =>
    Boolean(
      range && options.consumption.apChargeExceptions.some((item) => apChargeExceptionRangesOverlap(item, range)),
    );
  const addedChargeCost = (count: number, days: number) =>
    days * Math.max(0, calculateDailyApChargePyroxene(count) - calculateDailyApChargePyroxene(baseCount));

  const appliedPeriod = options.consumption.apChargeExceptions.find(
    (item) =>
      chargeDates.length > 0 &&
      item.startDate === chargeDates[0] &&
      item.endDate === chargeDates.at(-1) &&
      item.count > baseCount,
  );
  if (appliedPeriod) {
    const additionalAp = chargeDates.length * (appliedPeriod.count - baseCount) * AP_PER_REFILL;
    suggestions.push({
      kind: "event-period",
      startDate: appliedPeriod.startDate,
      endDate: appliedPeriod.endDate,
      fromCount: baseCount,
      toCount: appliedPeriod.count,
      additionalAp,
      pyroxeneCost: addedChargeCost(appliedPeriod.count, chargeDates.length),
      resultAp: availableAp,
      deficitAfter: event.requiredAp - availableAp,
    });
  }

  const appliedStockpile = options.consumption.apChargeExceptions.find(
    (item) =>
      stockpileDates.length > 0 &&
      item.startDate === stockpileDates[0] &&
      item.endDate === stockpileDates.at(-1) &&
      item.count > baseCount,
  );
  if (appliedStockpile) {
    const optionsWithoutApplied = {
      ...options,
      consumption: {
        ...options.consumption,
        apChargeExceptions: options.consumption.apChargeExceptions.filter((item) => item.uid !== appliedStockpile.uid),
      },
    };
    const baselineStockpile = buildStockpileSteps(
      accessAt,
      stockpileStartsAt,
      overlapEventName,
      maxAp,
      storedCafeAp,
      optionsWithoutApplied.consumption,
    ).stockpileAp;
    suggestions.push({
      kind: "stockpile-day",
      startDate: appliedStockpile.startDate,
      endDate: appliedStockpile.endDate,
      fromCount: baseCount,
      toCount: appliedStockpile.count,
      additionalAp: Math.max(0, stockpileAp - baselineStockpile),
      pyroxeneCost: addedChargeCost(appliedStockpile.count, stockpileDates.length),
      resultAp: availableAp,
      deficitAfter: event.requiredAp - availableAp,
    });
  }

  if (deficit > 0 && chargeDates.length > 0 && !appliedPeriod) {
    const range = exceptionRange(chargeDates, baseCount + 1);
    if (hasOverlappingException(range)) {
      overlapConflict = true;
    } else {
      let targetCount = baseCount;
      let additionalAp = 0;
      while (targetCount < 20 && additionalAp < deficit) {
        targetCount += 1;
        additionalAp = chargeDates.reduce((sum, date) => {
          const currentCount = getPyroxeneApChargeCountForDate(`${date}T12:00:00+09:00`, options.consumption);
          return sum + Math.max(0, targetCount - currentCount) * AP_PER_REFILL;
        }, 0);
      }
      const currentCounts = chargeDates.map((date) =>
        getPyroxeneApChargeCountForDate(`${date}T12:00:00+09:00`, options.consumption),
      );
      const periodCost = chargeDates.reduce((sum, _date, index) => {
        const currentCount = currentCounts[index] ?? baseCount;
        return (
          sum + Math.max(0, calculateDailyApChargePyroxene(targetCount) - calculateDailyApChargePyroxene(currentCount))
        );
      }, 0);
      additionalAp = chargeDates.reduce((sum, _date, index) => {
        const currentCount = currentCounts[index] ?? baseCount;
        return sum + Math.max(0, targetCount - currentCount) * AP_PER_REFILL;
      }, 0);
      if (additionalAp > 0 && targetCount > baseCount) {
        suggestions.push({
          kind: "event-period",
          startDate: chargeDates[0] as string,
          endDate: chargeDates.at(-1) as string,
          fromCount: baseCount,
          toCount: targetCount,
          additionalAp,
          pyroxeneCost: periodCost,
          resultAp: availableAp + additionalAp,
          deficitAfter: event.requiredAp - availableAp - additionalAp,
        });
      }
    }
  }

  if (deficit > 0 && stockpileDates.length > 0 && !appliedStockpile) {
    const range = exceptionRange(stockpileDates, baseCount + 1);
    if (hasOverlappingException(range)) {
      overlapConflict = true;
    } else {
      let targetCount = baseCount;
      let additionalAp = 0;
      let projectedStockpile = stockpileAp;
      while (targetCount < 20 && additionalAp < deficit) {
        targetCount += 1;
        const projectionRange = exceptionRange(stockpileDates, targetCount);
        if (!projectionRange) break;
        const projectedOptions: PyroxenePlannerOptions = {
          ...options,
          consumption: {
            ...options.consumption,
            apChargeExceptions: [...options.consumption.apChargeExceptions, projectionRange],
          },
        };
        projectedStockpile = buildStockpileSteps(
          accessAt,
          stockpileStartsAt,
          overlapEventName,
          maxAp,
          storedCafeAp,
          projectedOptions.consumption,
        ).stockpileAp;
        additionalAp = Math.max(0, projectedStockpile - stockpileAp);
      }
      if (additionalAp > 0 && targetCount > baseCount) {
        suggestions.push({
          kind: "stockpile-day",
          startDate: stockpileDates[0] as string,
          endDate: stockpileDates.at(-1) as string,
          fromCount: baseCount,
          toCount: targetCount,
          additionalAp,
          pyroxeneCost: addedChargeCost(targetCount, stockpileDates.length),
          resultAp: availableAp + additionalAp,
          deficitAfter: event.requiredAp - availableAp - additionalAp,
        });
      }
    }
  }

  return { suggestions, overlapConflict };
}

function buildStockpileSteps(
  accessAt: string,
  stockpileStartsAt: string,
  overlapEventName: string | null,
  maxAp: number,
  storedCafeAp: number,
  consumption: PyroxenePlannerOptions["consumption"],
): { steps: ApStockpileStep[]; stockpileAp: number } {
  const start = dayjs(stockpileStartsAt);
  const access = dayjs(accessAt);
  const steps: ApStockpileStep[] = [];
  const hasFullPreparationDay = access.diff(start, "hour") >= 20 && overlapEventName === null;
  if (hasFullPreparationDay) {
    steps.push({
      at: start.toISOString(),
      label: "카페 AP를 받고 AP를 모두 사용하기 · 이후 AP 쓰지 않기",
      ap: 0,
      kind: "drain",
    });
  } else if (overlapEventName) {
    steps.push({
      at: start.toISOString(),
      label: "AP 모으기 시작",
      ap: 0,
      kind: "drain",
    });
  }

  let currentAp = 0;
  let cursor = start;
  for (const resetAtString of dailyResetInstantsBetween(stockpileStartsAt, accessAt)) {
    const resetAt = dayjs(resetAtString);
    const apBeforeNatural = currentAp;
    const naturalBeforeReset = Math.min(
      Math.max(0, maxAp - currentAp),
      naturalSupply(cursor.toISOString(), resetAtString),
    );
    currentAp += naturalBeforeReset;
    const chargeCount = getPyroxeneApChargeCountForDate(resetAtString, consumption);
    if (chargeCount > 0) {
      const chargeAp = chargeCount * AP_PER_REFILL;
      currentAp += chargeAp;
      const naturalLabel = naturalBeforeReset > 0 ? `자연 회복 ${naturalBeforeReset.toLocaleString()} AP · ` : "";
      steps.push({
        at: resetAtString,
        label: `${naturalLabel}AP 충전 ${chargeCount}회 · +${chargeAp.toLocaleString()} AP`,
        ap: currentAp,
        kind: "charge",
        receivedAp: chargeAp,
      });
    } else if (naturalBeforeReset > 0 && currentAp === maxAp) {
      const naturalFullAt = cursor.add((maxAp - apBeforeNatural) * AP_NATURAL_REGEN_MINUTES, "minute");
      steps.push({
        at: naturalFullAt.toISOString(),
        label: `자연 회복이 최대 AP ${maxAp}에 도달하면 멈춰요`,
        ap: currentAp,
        kind: "natural",
      });
    }
    cursor = resetAt;
  }

  const apBeforeNatural = currentAp;
  const naturalBeforeAccess = Math.min(Math.max(0, maxAp - currentAp), naturalSupply(cursor.toISOString(), accessAt));
  currentAp += naturalBeforeAccess;
  if (naturalBeforeAccess > 0 && currentAp === maxAp) {
    const naturalFullAt = cursor.add((maxAp - apBeforeNatural) * AP_NATURAL_REGEN_MINUTES, "minute");
    if (naturalFullAt.isBefore(access)) {
      steps.push({
        at: naturalFullAt.toISOString(),
        label: `자연 회복이 최대 AP ${maxAp}에 도달하면 멈춰요`,
        ap: currentAp,
        kind: "natural",
      });
    }
  } else if (naturalBeforeAccess > 0) {
    const naturalAt = cursor.add(naturalBeforeAccess * AP_NATURAL_REGEN_MINUTES, "minute");
    if (naturalAt.isBefore(access)) {
      steps.push({
        at: naturalAt.toISOString(),
        label: `자연 회복으로 약 ${naturalBeforeAccess.toLocaleString()} AP 모아요`,
        ap: currentAp,
        kind: "natural",
      });
    }
  }

  const stockpileAp = currentAp + storedCafeAp;
  steps.push({
    at: access.toISOString(),
    label: storedCafeAp > 0 ? `접속해서 카페 AP ${storedCafeAp.toLocaleString()} 받기` : "접속 시간",
    ap: stockpileAp,
    kind: "access",
    receivedAp: storedCafeAp,
  });
  return { steps, stockpileAp };
}

export function calculateApPlannerEvent(input: {
  event: ApPlannerEvent;
  conditions: ApPlannerConditions;
  plan: ApPlannerEventPlan | null;
  currentAt: string;
  options: PyroxenePlannerOptions;
  previousPlannedEvents?: readonly ApPlannerPreviousEvent[];
}): ApPlannerCalculation {
  const { event, conditions, plan, currentAt, options } = input;
  if (
    !isInstant(event.startAt) ||
    !isInstant(event.endAt) ||
    Date.parse(event.endAt) <= Date.parse(event.startAt) ||
    !Number.isSafeInteger(event.requiredAp) ||
    event.requiredAp < 0
  ) {
    throw new Error("이벤트 AP 정보를 확인할 수 없어요.");
  }
  const validEvent = event as ValidApPlannerEvent;
  const requiredAp = event.requiredAp;
  const requiredBreakdown = event.requiredBreakdown;
  const condition = conditionValues(conditions);
  if (!condition) {
    return {
      status: "input-needed",
      requiredAp,
      requiredBreakdown,
      availableAp: null,
      resultAp: null,
      supplyBreakdown: null,
      stockpileSteps: [],
      stockpileStartsAt: null,
      overlapEventName: null,
      refillSuggestions: [],
      refillOverlapConflict: false,
      assumptionLabels: [],
    };
  }

  const now = Date.parse(currentAt);
  if (!Number.isFinite(now)) throw new Error("계산 시각을 확인할 수 없어요.");
  const isOngoing = Date.parse(validEvent.startAt) <= now && now < Date.parse(validEvent.endAt);
  if (!isOngoing && !plan) {
    return {
      status: "not-planned",
      requiredAp,
      requiredBreakdown,
      availableAp: null,
      resultAp: null,
      supplyBreakdown: null,
      stockpileSteps: [],
      stockpileStartsAt: null,
      overlapEventName: null,
      refillSuggestions: [],
      refillOverlapConflict: false,
      assumptionLabels: [],
    };
  }
  if (!isOngoing && (!plan || plan.accessAt === null)) {
    return {
      status: "access-time-needed",
      requiredAp,
      requiredBreakdown,
      availableAp: null,
      resultAp: null,
      supplyBreakdown: null,
      stockpileSteps: [],
      stockpileStartsAt: null,
      overlapEventName: null,
      refillSuggestions: [],
      refillOverlapConflict: false,
      assumptionLabels: [],
    };
  }

  const production = condition.cafe;
  const from = isOngoing ? new Date(now).toISOString() : (plan?.accessAt as string);
  if (
    !isOngoing &&
    (!isInstant(from) ||
      Date.parse(from) < Date.parse(validEvent.startAt) ||
      Date.parse(from) > Date.parse(validEvent.endAt))
  ) {
    throw new Error("접속 시간은 이벤트 시작부터 종료 사이로 입력해주세요.");
  }
  const previous = [...(input.previousPlannedEvents ?? [])]
    .filter((candidate) => Date.parse(candidate.startAt) < Date.parse(validEvent.startAt))
    .sort((left, right) => Date.parse(right.endAt) - Date.parse(left.endAt))[0];
  const candidateStockpileStart = dayjs(from).subtract(24, "hour");
  const previousEnd = previous ? dayjs(previous.endAt) : null;
  const overlaps = previousEnd?.isAfter(candidateStockpileStart) && previousEnd.isBefore(dayjs(from));
  const stockpileStartsAt = isOngoing
    ? from
    : overlaps && previousEnd
      ? previousEnd.toISOString()
      : candidateStockpileStart.toISOString();
  const overlapEventName = overlaps ? (previous?.name ?? null) : null;
  const storedCafeAp = isOngoing ? 0 : cafeStoredSupplyDuring(stockpileStartsAt, from, production);
  const stockpilePlan = isOngoing
    ? { steps: [] as ApStockpileStep[], stockpileAp: 0 }
    : buildStockpileSteps(
        from,
        stockpileStartsAt,
        overlapEventName,
        condition.maxAp,
        storedCafeAp,
        options.consumption,
      );
  const stockpile = stockpilePlan.stockpileAp;
  const dailyTaskDays = countDailyResets(from, validEvent.endAt);
  const dailyTasks = dailyTaskDays * AP_DAILY_TASK_REWARD;
  const firstChargeDate = gameDate(from) > gameDate(validEvent.startAt) ? gameDate(from) : gameDate(validEvent.startAt);
  const resetDates = dailyChargeDays(`${firstChargeDate}T00:00:00+09:00`, validEvent.endAt).filter((date) => {
    const resetAt = dayjs.tz(`${date}T${String(GAME_RESET_HOUR).padStart(2, "0")}:00:00`, KST);
    return resetAt.isAfter(dayjs(from)) && !resetAt.isAfter(dayjs(validEvent.endAt));
  });
  const chargeCounts = resetDates.map((date) =>
    getPyroxeneApChargeCountForDate(`${date}T12:00:00+09:00`, options.consumption),
  );
  const apChargeDays = chargeCounts.length;
  const apCharges = chargeCounts.reduce((sum, count) => sum + count * AP_PER_REFILL, 0);
  const natural = naturalSupply(from, validEvent.endAt);
  const cafe = cafeSupplyDuring(from, validEvent.endAt, production);
  const availableAp = stockpile + natural + cafe + dailyTasks + apCharges;
  const supplyBreakdown = {
    stockpile,
    natural,
    cafe,
    dailyTasks,
    apCharges,
    dailyTaskDays,
    apChargeDays,
  };
  const refill = refillSuggestions(
    validEvent,
    availableAp,
    from,
    stockpileStartsAt,
    stockpile,
    storedCafeAp,
    condition.maxAp,
    overlapEventName,
    options,
  );
  return {
    status: isOngoing ? "ongoing" : "ready",
    requiredAp,
    requiredBreakdown,
    availableAp,
    resultAp: availableAp - requiredAp,
    supplyBreakdown,
    stockpileSteps: stockpilePlan.steps,
    stockpileStartsAt: isOngoing ? null : stockpileStartsAt,
    overlapEventName,
    refillSuggestions: refill.suggestions,
    refillOverlapConflict: refill.overlapConflict,
    assumptionLabels: [
      "자연 회복과 카페 AP는 계산 중 소비할 수 있다고 가정해요.",
      "일일 과제 AP는 하루 150 AP로 가정해요.",
      "카페 생산량은 추정치이며 보관 최대 AP를 적용해요.",
      "AP 패키지로 받는 AP는 포함하지 않았어요.",
    ],
  };
}

export function addApChargeException(
  exceptions: readonly PyroxeneApChargeException[],
  exception: PyroxeneApChargeException,
): { exceptions: PyroxeneApChargeException[]; overlap: boolean } {
  if (exceptions.some((existing) => apChargeExceptionRangesOverlap(existing, exception))) {
    return { exceptions: [...exceptions], overlap: true };
  }
  return {
    exceptions: [...exceptions, exception].sort((left, right) => left.startDate.localeCompare(right.startDate)),
    overlap: false,
  };
}

export function formatApShortDate(instant: string): string {
  return dayjs(instant).tz(KST).format("M/D(dd) HH:mm");
}

export function formatApDate(instant: string): string {
  return dayjs(instant).tz(KST).format("M/D(ddd)");
}
