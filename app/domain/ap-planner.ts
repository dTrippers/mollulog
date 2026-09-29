import {
  apChargeExceptionRangesOverlap,
  getPyroxeneApChargeCountForDate,
  type PyroxeneApChargeException,
  type PyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import {
  calculateDailyApChargePyroxene,
  PYROXENE_AP_PACKAGE_CONFIG,
} from "~/domain/pyroxene-sources";
import dayjs from "~/lib/dayjs";

export const AP_PER_REFILL = 120;
export const AP_PER_NATURAL_REGEN_MINUTES = 1;
export const AP_NATURAL_REGEN_MINUTES = 6;
export const AP_DAILY_TASK_REWARD = 150;
export const AP_PACKAGE_DAILY_REWARD = 150;
export const AP_PACKAGE_DURATION_DAYS = 14;
/** User-confirmed cap for AP purchases applied while stockpiling (refills and tactical shop items). */
export const AP_REFILL_HOLD_LIMIT = 999;
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
  tacticalApShopCount?: number;
  eventPlans: Record<string, ApPlannerEventPlan>;
  [key: string]: unknown;
};

export type ApPlannerConditions = Pick<
  ApPlannerState,
  "accountLevel" | "cafeRank" | "comfort" | "tacticalApShopCount"
>;

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
export type ApPlannerPreviousEvent = Pick<ApPlannerEvent, "timelineUid" | "name" | "startAt"> & { endAt: string };

export type ApStockpileStep = {
  at: string;
  label: string;
  ap: number;
  kind: "drain" | "charge" | "tactical-purchase" | "ap-package" | "natural" | "access" | "mailbox";
  receivedAp?: number;
  /** AP waiting in the mailbox after this step. */
  mailboxAp?: number;
  /** Cafe AP left uncollected at access because the hold limit was reached. */
  unclaimedCafeAp?: number;
};

export type ApPackagePurchaseRecord = {
  eventAt: string;
  autoRepurchase: boolean;
};

export type ApSupplyBreakdown = {
  stockpile: number;
  natural: number;
  cafe: number;
  dailyTasks: number;
  apPackage: number;
  apCharges: number;
  tacticalApShop: number;
  tacticalApShopCount: number;
  dailyTaskDays: number;
  apChargeDays: number;
  tacticalApShopDays: number;
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
  stockpileStartPassed: boolean;
  accessTimePassed: boolean;
  overlapEventName: string | null;
  refillSuggestions: ApRefillSuggestion[];
  refillOverlapConflict: boolean;
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
  return { accountLevel: null, cafeRank: null, comfort: null, tacticalApShopCount: 0, eventPlans: {} };
}

export function apPlannerStateHasData(state: ApPlannerState | null): boolean {
  if (!state) return false;
  if (
    state.accountLevel !== null ||
    state.cafeRank !== null ||
    state.comfort !== null ||
    (state.tacticalApShopCount ?? 0) !== 0 ||
    Object.keys(state.eventPlans).length > 0
  ) {
    return true;
  }
  return Object.keys(state).some(
    (key) => !["accountLevel", "cafeRank", "comfort", "tacticalApShopCount", "eventPlans"].includes(key),
  );
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
  const tacticalApShopCount = value.tacticalApShopCount;
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
    ) ||
    !(
      tacticalApShopCount === undefined ||
      tacticalApShopCount === null ||
      (typeof tacticalApShopCount === "number" &&
        Number.isSafeInteger(tacticalApShopCount) &&
        tacticalApShopCount >= 0 &&
        tacticalApShopCount <= 4)
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
  if (typeof tacticalApShopCount === "number") normalized.tacticalApShopCount = tacticalApShopCount;
  else delete normalized.tacticalApShopCount;
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
    throw new RangeError("쾌적도는 0에서 카페 랭크 최대 사이여야 해요.");
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

function packageGameDate(value: string | Date): string {
  const parsed = dayjs(value).tz(KST);
  if (!parsed.isValid()) throw new Error("AP 패키지 구매 기록을 확인할 수 없어요.");
  return parsed.subtract(GAME_RESET_HOUR, "hour").format("YYYY-MM-DD");
}

function dailyRewardGameDates(from: string, until: string, firstGameDayClaimed: boolean): string[] {
  const dates = new Set<string>();
  if (!firstGameDayClaimed) dates.add(packageGameDate(from));
  for (const resetAt of dailyResetInstantsBetween(from, until)) dates.add(packageGameDate(resetAt));
  return [...dates].sort();
}

function apPackageForGameDate(gameDateKey: string, records: readonly ApPackagePurchaseRecord[]): number {
  const date = dayjs.tz(`${gameDateKey}T12:00:00`, KST);
  return records.reduce((total, record) => {
    const purchaseDate = dayjs.tz(`${packageGameDate(record.eventAt)}T12:00:00`, KST);
    const elapsedDays = date.diff(purchaseDate, "day");
    if (elapsedDays < 0) return total;
    const hasRepurchased = elapsedDays >= PYROXENE_AP_PACKAGE_CONFIG.repurchaseIntervalDays;
    if (!record.autoRepurchase && hasRepurchased) return total;
    return total + AP_PACKAGE_DAILY_REWARD;
  }, 0);
}

export function apPackagePanelSummary(records: readonly ApPackagePurchaseRecord[], now: string): string {
  if (records.length === 0) return "구매 기록 없음";
  if (records.some((record) => record.autoRepurchase)) return "자동 재구매 중";
  const currentGameDate = packageGameDate(now);
  const lastCoveredDate = records.reduce<string | null>((lastDate, record) => {
    const candidate = dayjs.tz(`${packageGameDate(record.eventAt)}T12:00:00`, KST)
      .add(AP_PACKAGE_DURATION_DAYS - 1, "day")
      .format("YYYY-MM-DD");
    return lastDate === null || candidate > lastDate ? candidate : lastDate;
  }, null);
  if (!lastCoveredDate || lastCoveredDate <= currentGameDate) return "진행 중인 패키지 없음";
  return `${dayjs.tz(`${lastCoveredDate}T12:00:00`, KST).format("M/D")}까지`;
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

function conditionValues(conditions: ApPlannerConditions): {
  maxAp: number;
  cafe: CafeProduction;
  tacticalApShopCount: number;
} | null {
  if (conditions.accountLevel === null || conditions.cafeRank === null) return null;
  return {
    maxAp: maxApForAccountLevel(conditions.accountLevel),
    cafe: cafeProduction(conditions.cafeRank, conditions.comfort),
    tacticalApShopCount: conditions.tacticalApShopCount ?? 0,
  };
}

function applyTacticalApPurchases(currentAp: number, lineups: number) {
  let ap = currentAp;
  let receivedAp = 0;
  for (let lineup = 0; lineup < lineups; lineup += 1) {
    for (const itemAp of [60, 30]) {
      if (ap + itemAp > AP_REFILL_HOLD_LIMIT) continue;
      ap += itemAp;
      receivedAp += itemAp;
    }
  }
  return { ap, receivedAp };
}

function shortage(available: number, required: number): number {
  return required - available;
}

function refillSuggestions(
  event: ValidApPlannerEvent,
  availableAp: number,
  accessAt: string,
  stockpileStartsAt: string | null,
  stockpileContributionAp: number,
  storedCafeAp: number,
  maxAp: number,
  tacticalApShopCount: number,
  packageRecords: readonly ApPackagePurchaseRecord[],
  overlapEventName: string | null,
  options: PyroxenePlannerOptions,
): { suggestions: ApRefillSuggestion[]; overlapConflict: boolean } {
  const deficit = Math.max(0, shortage(availableAp, event.requiredAp));
  const chargeDates = dailyResetInstantsBetween(accessAt, event.endAt).map(gameDate);
  const preparationEnd = dayjs(event.startAt).isBefore(dayjs(accessAt)) ? event.startAt : accessAt;
  const stockpileDates =
    stockpileStartsAt === null ? [] : dailyResetInstantsBetween(stockpileStartsAt, preparationEnd).map(gameDate);
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
  if (appliedStockpile && stockpileStartsAt !== null) {
    const optionsWithoutApplied = {
      ...options,
      consumption: {
        ...options.consumption,
        apChargeExceptions: options.consumption.apChargeExceptions.filter((item) => item.uid !== appliedStockpile.uid),
      },
    };
    const baselineStockpile = stockpileContribution(
      buildStockpileSteps(
        accessAt,
        stockpileStartsAt,
        overlapEventName,
        maxAp,
        storedCafeAp,
        tacticalApShopCount,
        packageRecords,
        optionsWithoutApplied.consumption,
      ),
    );
    suggestions.push({
      kind: "stockpile-day",
      startDate: appliedStockpile.startDate,
      endDate: appliedStockpile.endDate,
      fromCount: baseCount,
      toCount: appliedStockpile.count,
      additionalAp: Math.max(0, stockpileContributionAp - baselineStockpile),
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

  if (deficit > 0 && stockpileStartsAt !== null && stockpileDates.length > 0 && !appliedStockpile) {
    const range = exceptionRange(stockpileDates, baseCount + 1);
    if (hasOverlappingException(range)) {
      overlapConflict = true;
    } else {
      // Net gain is not monotonic: a refill can be offset by the natural regen it stops, and the hold limit caps it.
      // Scan every count and take the first that covers the deficit, otherwise the smallest count with the most AP.
      let targetCount = baseCount;
      let additionalAp = 0;
      for (let count = baseCount + 1; count <= 20; count += 1) {
        const projectionRange = exceptionRange(stockpileDates, count);
        if (!projectionRange) break;
        const projectedStockpile = stockpileContribution(
          buildStockpileSteps(
            accessAt,
            stockpileStartsAt,
            overlapEventName,
            maxAp,
            storedCafeAp,
            tacticalApShopCount,
            packageRecords,
            { ...options.consumption, apChargeExceptions: [...options.consumption.apChargeExceptions, projectionRange] },
          ),
        );
        const projectedAdditionalAp = Math.max(0, projectedStockpile - stockpileContributionAp);
        if (projectedAdditionalAp > additionalAp) {
          targetCount = count;
          additionalAp = projectedAdditionalAp;
        }
        if (additionalAp >= deficit) break;
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

type StockpilePlan = {
  steps: ApStockpileStep[];
  /** AP usable at access: held AP, mailbox AP, and cafe AP. */
  stockpileAp: number;
  /** Refills and tactical items the hold limit deferred on the access game day; they are bought after access. */
  carryOverChargeAp: number;
  carryOverTacticalAp: number;
  tacticalApShopDays: number;
  packageGameDates: string[];
};

const MAILBOX_VALID_HOURS = 24;

/** Rewards that would exceed the hold limit go to the mailbox instead. */
function receiveOverflowingAp(heldAp: number, receivedAp: number): { heldAp: number; overflowAp: number } {
  const accepted = Math.min(receivedAp, Math.max(0, AP_REFILL_HOLD_LIMIT - heldAp));
  return { heldAp: heldAp + accepted, overflowAp: receivedAp - accepted };
}

function mailboxOverflowLabel(overflowAp: number, receivedAt: dayjs.Dayjs): string {
  if (overflowAp <= 0) return "";
  const expiresAt = receivedAt.add(MAILBOX_VALID_HOURS, "hour").toISOString();
  return ` (${AP_REFILL_HOLD_LIMIT} AP를 넘는 ${overflowAp.toLocaleString()} AP는 우편함으로 · ${formatApShortDate(expiresAt)}까지 받기)`;
}

function emptyStockpilePlan(): StockpilePlan {
  return {
    steps: [],
    stockpileAp: 0,
    carryOverChargeAp: 0,
    carryOverTacticalAp: 0,
    tacticalApShopDays: 0,
    packageGameDates: [],
  };
}

function stockpileContribution(plan: StockpilePlan): number {
  return plan.stockpileAp + plan.carryOverChargeAp + plan.carryOverTacticalAp;
}

function buildStockpileSteps(
  accessAt: string,
  stockpileStartsAt: string,
  overlapEventName: string | null,
  maxAp: number,
  storedCafeAp: number,
  tacticalApShopCount: number,
  packageRecords: readonly ApPackagePurchaseRecord[],
  consumption: PyroxenePlannerOptions["consumption"],
): StockpilePlan {
  const start = dayjs(stockpileStartsAt);
  const access = dayjs(accessAt);
  const accessGameDate = packageGameDate(accessAt);
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
  let mailboxAp = 0;
  let mailboxExpiresAt: dayjs.Dayjs | null = null;
  const addToMailbox = (overflowAp: number, receivedAt: dayjs.Dayjs) => {
    if (overflowAp <= 0) return;
    mailboxAp += overflowAp;
    const expiresAt = receivedAt.add(MAILBOX_VALID_HOURS, "hour");
    if (!mailboxExpiresAt || expiresAt.isBefore(mailboxExpiresAt)) mailboxExpiresAt = expiresAt;
  };
  let cursor = start;
  let tacticalApShopDays = 0;
  let carryOverChargeAp = 0;
  let carryOverTacticalAp = 0;
  const packageGameDates: string[] = [];
  for (const resetAtString of dailyResetInstantsBetween(stockpileStartsAt, accessAt)) {
    const resetAt = dayjs(resetAtString);
    const isAccessGameDay = packageGameDate(resetAtString) === accessGameDate;
    const apBeforeNatural = currentAp;
    const naturalBeforeReset = Math.min(
      Math.max(0, maxAp - currentAp),
      naturalSupply(cursor.toISOString(), resetAtString),
    );
    currentAp += naturalBeforeReset;
    const resetGameDate = packageGameDate(resetAtString);
    const packageAp = apPackageForGameDate(resetGameDate, packageRecords);
    const plannedChargeCount = getPyroxeneApChargeCountForDate(resetAtString, consumption);
    const hasResetStep = packageAp > 0 || plannedChargeCount > 0 || tacticalApShopCount > 0;
    // Natural regen before the reset is reported on the first reset step, or on its own when it fills the max AP.
    let naturalLabel = hasResetStep && naturalBeforeReset > 0 ? `자연 회복 ${naturalBeforeReset.toLocaleString()} AP · ` : "";
    const takeNaturalLabel = () => {
      const label = naturalLabel;
      naturalLabel = "";
      return label;
    };
    if (!hasResetStep && naturalBeforeReset > 0 && currentAp === maxAp) {
      const naturalFullAt = cursor.add((maxAp - apBeforeNatural) * AP_NATURAL_REGEN_MINUTES, "minute");
      steps.push({
        at: naturalFullAt.toISOString(),
        label: `자연 회복이 최대 AP ${maxAp}에 도달하면 멈춰요`,
        ap: currentAp,
        mailboxAp,
        kind: "natural",
      });
    }

    // The package is received automatically on the first login after the reset, before any purchase.
    if (packageAp > 0) {
      const received = receiveOverflowingAp(currentAp, packageAp);
      currentAp = received.heldAp;
      addToMailbox(received.overflowAp, resetAt);
      packageGameDates.push(resetGameDate);
      steps.push({
        at: resetAtString,
        label: `${takeNaturalLabel()}접속하면 2주 AP 패키지 +${packageAp.toLocaleString()} AP${mailboxOverflowLabel(received.overflowAp, resetAt)}`,
        ap: currentAp,
        mailboxAp,
        kind: "ap-package",
        receivedAp: packageAp,
      });
    }

    const chargeCount = Math.min(
      plannedChargeCount,
      Math.max(0, Math.floor((AP_REFILL_HOLD_LIMIT - currentAp) / AP_PER_REFILL)),
    );
    if (plannedChargeCount > 0) {
      const chargeAp = chargeCount * AP_PER_REFILL;
      currentAp += chargeAp;
      const deferredCount = plannedChargeCount - chargeCount;
      if (isAccessGameDay) carryOverChargeAp += deferredCount * AP_PER_REFILL;
      const capLabel =
        deferredCount > 0
          ? ` (${AP_REFILL_HOLD_LIMIT} AP를 넘으면 충전할 수 없어 ${plannedChargeCount}회 중 ${chargeCount}회만${
              isAccessGameDay ? ` · 나머지 ${deferredCount}회는 접속 후 AP를 쓰고 충전` : ""
            })`
          : "";
      steps.push({
        at: resetAtString,
        label: `${takeNaturalLabel()}AP 충전 ${chargeCount}회 · +${chargeAp.toLocaleString()} AP${capLabel}`,
        ap: currentAp,
        mailboxAp,
        kind: "charge",
        receivedAp: chargeAp,
      });
    }

    if (tacticalApShopCount > 0) {
      tacticalApShopDays += 1;
      const requestedAp = tacticalApShopCount * 90;
      const purchased = applyTacticalApPurchases(currentAp, tacticalApShopCount);
      currentAp = purchased.ap;
      const deferredAp = requestedAp - purchased.receivedAp;
      if (isAccessGameDay) carryOverTacticalAp += deferredAp;
      const capLabel =
        deferredAp > 0
          ? ` (${AP_REFILL_HOLD_LIMIT} AP를 넘는 구매는 할 수 없어 ${requestedAp.toLocaleString()} AP 중 ${purchased.receivedAp.toLocaleString()} AP만${
              isAccessGameDay ? " · 나머지는 접속 후 AP를 쓰고 구매" : ""
            })`
          : "";
      steps.push({
        at: resetAtString,
        label: `${takeNaturalLabel()}전술 대회 AP 구매 · +${purchased.receivedAp.toLocaleString()} AP${capLabel}`,
        ap: currentAp,
        mailboxAp,
        kind: "tactical-purchase",
        receivedAp: purchased.receivedAp,
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
        mailboxAp,
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
        mailboxAp,
        kind: "natural",
      });
    }
  }

  const stockpileAp = currentAp + mailboxAp + storedCafeAp;
  // Cafe AP can be collected only below the hold limit; the part above it goes to the mailbox.
  const canCollectCafe = currentAp < AP_REFILL_HOLD_LIMIT;
  let accessLabel = "접속할 시각";
  let unclaimedCafeAp = 0;
  if (storedCafeAp > 0 && canCollectCafe) {
    const received = receiveOverflowingAp(currentAp, storedCafeAp);
    currentAp = received.heldAp;
    addToMailbox(received.overflowAp, access);
    accessLabel = `접속해서 카페 AP ${storedCafeAp.toLocaleString()} 받기${mailboxOverflowLabel(received.overflowAp, access)}`;
  } else if (storedCafeAp > 0) {
    unclaimedCafeAp = storedCafeAp;
    accessLabel = `접속 · 보유 AP가 ${AP_REFILL_HOLD_LIMIT}라 카페 AP ${storedCafeAp.toLocaleString()}는 AP를 쓴 뒤 받기`;
  }
  steps.push({
    at: access.toISOString(),
    label: accessLabel,
    ap: stockpileAp,
    mailboxAp,
    unclaimedCafeAp,
    kind: "access",
    receivedAp: storedCafeAp,
  });
  if (mailboxAp > 0 && mailboxExpiresAt) {
    steps.push({
      at: access.toISOString(),
      label: `AP를 쓴 뒤 우편함 AP ${mailboxAp.toLocaleString()} 받기 (받은 뒤 ${AP_REFILL_HOLD_LIMIT} AP를 넘지 않을 때만 · ${formatApShortDate(
        (mailboxExpiresAt as dayjs.Dayjs).toISOString(),
      )}까지)`,
      ap: currentAp,
      mailboxAp,
      kind: "mailbox",
    });
  }
  return { steps, stockpileAp, carryOverChargeAp, carryOverTacticalAp, tacticalApShopDays, packageGameDates };
}

export function calculateApPlannerEvent(input: {
  event: ApPlannerEvent;
  conditions: ApPlannerConditions;
  plan: ApPlannerEventPlan | null;
  currentAt: string;
  options: PyroxenePlannerOptions;
  packageRecords?: readonly ApPackagePurchaseRecord[];
  previousPlannedEvents?: readonly ApPlannerPreviousEvent[];
}): ApPlannerCalculation {
  const { event, conditions, plan, currentAt, options } = input;
  const packageRecords = input.packageRecords ?? [];
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
      stockpileStartPassed: false,
      accessTimePassed: false,
      overlapEventName: null,
      refillSuggestions: [],
      refillOverlapConflict: false,
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
      stockpileStartPassed: false,
      accessTimePassed: false,
      overlapEventName: null,
      refillSuggestions: [],
      refillOverlapConflict: false,
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
      stockpileStartPassed: false,
      accessTimePassed: false,
      overlapEventName: null,
      refillSuggestions: [],
      refillOverlapConflict: false,
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
    throw new Error("접속할 시각은 이벤트 시작부터 종료 사이로 입력해주세요.");
  }
  // Earlier events keep their AP: order by start, then end, then UID so equal starts still have one owner.
  const precedes = (candidate: ApPlannerPreviousEvent) =>
    Date.parse(candidate.startAt) - Date.parse(validEvent.startAt) ||
    Date.parse(candidate.endAt) - Date.parse(validEvent.endAt) ||
    candidate.timelineUid.localeCompare(validEvent.timelineUid);
  const previous = (input.previousPlannedEvents ?? [])
    .filter((candidate) => candidate.timelineUid !== validEvent.timelineUid && precedes(candidate) < 0)
    .sort((left, right) => Date.parse(right.endAt) - Date.parse(left.endAt))[0];
  const accessTimePassed = Boolean(plan?.accessAt && Date.parse(plan.accessAt) <= now);
  const candidateStockpileStart = dayjs(from).subtract(24, "hour");
  const previousEnd = previous ? dayjs(previous.endAt) : null;
  const overlaps = Boolean(previousEnd?.isAfter(isOngoing ? dayjs(from) : candidateStockpileStart));
  const previousEndsAfterAccess = overlaps && previousEnd !== null && !previousEnd.isBefore(dayjs(from));
  const supplyFrom =
    previousEndsAfterAccess && previousEnd
      ? (previousEnd.isAfter(dayjs(validEvent.endAt)) ? dayjs(validEvent.endAt) : previousEnd).toISOString()
      : from;
  // When the earlier event lasts past the access time, nothing can be stockpiled for this event.
  const hasStockpile = !isOngoing && !previousEndsAfterAccess;
  const resultStockpileStartsAt = overlaps && previousEnd ? previousEnd.toISOString() : candidateStockpileStart.toISOString();
  const overlapEventName = overlaps ? (previous?.name ?? null) : null;
  const storedCafeAp = hasStockpile ? cafeStoredSupplyDuring(resultStockpileStartsAt, from, production) : 0;
  const stockpilePlan = hasStockpile
    ? buildStockpileSteps(
        from,
        resultStockpileStartsAt,
        overlapEventName,
        condition.maxAp,
        storedCafeAp,
        condition.tacticalApShopCount,
        packageRecords,
        options.consumption,
      )
    : emptyStockpilePlan();
  const stockpile = stockpilePlan.stockpileAp;
  // A future plan also receives the tasks of its first game day unless an earlier event already claimed that day.
  // Ongoing events assume today's tasks were already received.
  const firstGameDayStart = dayjs(getNextDailyReset(supplyFrom)).subtract(1, "day");
  const firstGameDayClaimed = isOngoing || Boolean(previousEnd && overlaps && !previousEnd.isBefore(firstGameDayStart));
  const eventPeriodGameDates = dailyRewardGameDates(supplyFrom, validEvent.endAt, firstGameDayClaimed);
  const dailyTaskDays = eventPeriodGameDates.length;
  const dailyTasks = dailyTaskDays * AP_DAILY_TASK_REWARD;
  const stockpilePackageDates = new Set(stockpilePlan.packageGameDates);
  const eventPeriodApPackage = eventPeriodGameDates
    .filter((date) => !stockpilePackageDates.has(date))
    .reduce((sum, date) => sum + apPackageForGameDate(date, packageRecords), 0);
  const firstChargeDate =
    gameDate(supplyFrom) > gameDate(validEvent.startAt) ? gameDate(supplyFrom) : gameDate(validEvent.startAt);
  const resetDates = dailyChargeDays(`${firstChargeDate}T00:00:00+09:00`, validEvent.endAt).filter((date) => {
    const resetAt = dayjs.tz(`${date}T${String(GAME_RESET_HOUR).padStart(2, "0")}:00:00`, KST);
    return resetAt.isAfter(dayjs(supplyFrom)) && !resetAt.isAfter(dayjs(validEvent.endAt));
  });
  const chargeCounts = resetDates.map((date) =>
    getPyroxeneApChargeCountForDate(`${date}T12:00:00+09:00`, options.consumption),
  );
  const apChargeDays = chargeCounts.length;
  const apCharges =
    chargeCounts.reduce((sum, count) => sum + count * AP_PER_REFILL, 0) + stockpilePlan.carryOverChargeAp;
  const eventPeriodTacticalApShopDays = isOngoing
    ? dailyTaskDays
    : dailyResetInstantsBetween(supplyFrom, validEvent.endAt).length;
  const tacticalApShopDays = stockpilePlan.tacticalApShopDays + eventPeriodTacticalApShopDays;
  // Stockpiled purchases are already in the stockpile; only the event period and the deferred part are added here.
  const tacticalApShop =
    eventPeriodTacticalApShopDays * condition.tacticalApShopCount * 90 + stockpilePlan.carryOverTacticalAp;
  const natural = naturalSupply(supplyFrom, validEvent.endAt);
  const cafe = cafeSupplyDuring(supplyFrom, validEvent.endAt, production);
  const availableAp = stockpile + natural + cafe + dailyTasks + eventPeriodApPackage + apCharges + tacticalApShop;
  const supplyBreakdown = {
    stockpile,
    natural,
    cafe,
    dailyTasks,
    apPackage: eventPeriodApPackage,
    apCharges,
    tacticalApShop,
    tacticalApShopCount: condition.tacticalApShopCount,
    dailyTaskDays,
    apChargeDays,
    tacticalApShopDays,
  };
  let displayStockpileSteps = stockpilePlan.steps;
  let displayStockpileStartsAt = hasStockpile ? resultStockpileStartsAt : null;
  let displayStockpileStartPassed = hasStockpile && Date.parse(resultStockpileStartsAt) < now;
  let displayOverlapEventName = overlapEventName;
  const futureRegisteredAccessAt =
    isOngoing && plan?.accessAt && Date.parse(plan.accessAt) > now ? plan.accessAt : null;
  if (futureRegisteredAccessAt) {
    const displayAccess = dayjs(futureRegisteredAccessAt);
    const displayCandidateStart = displayAccess.subtract(24, "hour");
    const displayOverlaps = Boolean(previousEnd?.isAfter(displayCandidateStart));
    const displayPreviousEndsAfterAccess =
      displayOverlaps && previousEnd !== null && !previousEnd.isBefore(displayAccess);
    const displayHasStockpile = !displayPreviousEndsAfterAccess;
    displayOverlapEventName = displayOverlaps ? (previous?.name ?? null) : null;
    displayStockpileStartsAt =
      displayHasStockpile
        ? displayOverlaps && previousEnd
          ? previousEnd.toISOString()
          : displayCandidateStart.toISOString()
        : null;
    const displayStoredCafeAp =
      displayHasStockpile && displayStockpileStartsAt
        ? cafeStoredSupplyDuring(displayStockpileStartsAt, futureRegisteredAccessAt, production)
        : 0;
    const displayPlan =
      displayHasStockpile && displayStockpileStartsAt
        ? buildStockpileSteps(
            futureRegisteredAccessAt,
            displayStockpileStartsAt,
            displayOverlapEventName,
            condition.maxAp,
            displayStoredCafeAp,
            condition.tacticalApShopCount,
            packageRecords,
            options.consumption,
          )
        : null;
    displayStockpileSteps = displayPlan?.steps ?? [];
    displayStockpileStartPassed = Boolean(
      displayStockpileStartsAt && Date.parse(displayStockpileStartsAt) < now,
    );
  }
  const refill = refillSuggestions(
    validEvent,
    availableAp,
    supplyFrom,
    hasStockpile ? resultStockpileStartsAt : null,
    stockpileContribution(stockpilePlan),
    storedCafeAp,
    condition.maxAp,
    condition.tacticalApShopCount,
    packageRecords,
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
    stockpileSteps: displayStockpileSteps,
    stockpileStartsAt: displayStockpileStartsAt,
    stockpileStartPassed: displayStockpileStartPassed,
    accessTimePassed,
    overlapEventName: displayOverlapEventName,
    refillSuggestions: refill.suggestions,
    refillOverlapConflict: refill.overlapConflict,
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
