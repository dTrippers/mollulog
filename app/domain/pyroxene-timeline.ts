import dayjs from "dayjs";
import type { PyroxeneCalculationOptions, TimelineSourceType } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import {
  calculateDailyApChargePyroxene,
  collectedSourceKeyForEventReward,
  collectedSourceKeyForRaid,
} from "~/domain/pyroxene-sources";
import { DEFAULT_PICKUP_STUDENT_RATE_BY_TIER } from "~/domain/recruitment-simulator";

export type PickupResources = {
  pyroxene: number;
  oneTimeTicket: number;
  tenTimeTicket: number;
};

export type TimelineSource = {
  type: TimelineSourceType;
  event?: PyroxeneScheduleItem["event"];
  description?: string;
  uid?: string;
  collectedSourceKey?: string;
};

export type TimelineDelta = {
  date: dayjs.Dayjs;
  source: TimelineSource;

  pickupTrial?: number;
  // 이벤트별 직접 입력이 없는 픽업의 실제 유료 모집 횟수 확률분포입니다. 인덱스가 모집 횟수를 뜻합니다.
  pickupTrialCostDistribution?: TrialDistribution;
  resourceDelta?: PickupResources;
  tenTimeTicketLotId?: string;
  tenTimeTicketExpiresAt?: dayjs.Dayjs;
  priority?: number;
};

export type TimelineEntry = {
  date: dayjs.Dayjs;
  source: TimelineSource;
  accumulatedResources: PickupResources;
  accumulatedResourcesBand?: {
    optimistic: PickupResources;
    pessimistic: PickupResources;
  };
  resourceDelta: PickupResources;
};

export type Timeline = TimelineEntry[];

export const MAX_REPEATED_ENTRIES = 365;

export const PYROXENE = {
  RAID_TOTAL_ASSAULT_BASE: 650,
  RAID_TOTAL_ASSAULT_TIER: { platinum: 1200, gold: 1000, silver: 800, bronze: 600 },
  RAID_ELIMINATION_BASE: 650,
  DAILY_MISSION: 20,
  WEEKLY_MISSION: 120,
  TACTICAL: { in10: 35, in100: 30, in200: 25, over200: 20 },
  PICKUP_TRIAL: { average: 140, ceil: 200 },
  FREE_RECRUITMENT_TRIAL: 100,
} as const;

const PICKUP_TRIAL_BAND_QUANTILE = {
  optimistic: 0.9,
  pessimistic: 0.1,
} as const;

// P10/P90 밴드에 영향을 주기 어려운 극미세 꼬리 상태를 잘라, 티켓 포함 DP의 상태 폭증을 막습니다.
const MIN_PROBABILITY = 1e-6;
// 이미 계산된 모집 분포를 자원 상태에 합성할 때는 개별 product 확률이 작아도
// 같은 청휘석/티켓 상태로 합쳐진 뒤 분위수에 영향을 줄 수 있으므로 더 보수적으로 자릅니다.
const RESOURCE_STATE_MIN_PROBABILITY = 1e-12;
const MAX_PICKUP_TRIAL_COST_DISTRIBUTION_CACHE_SIZE = 200;

type TrialDistribution = number[];

export { calculateDailyApChargePyroxene } from "~/domain/pyroxene-sources";

type TenTimeTicketLot = {
  id: string;
  count: number;
  expiresAt?: dayjs.Dayjs;
};

type TimelineAccumulationState = {
  currentResources: PickupResources;
  tenTimeTicketLots: TenTimeTicketLot[];
};

type ResourceStateDistribution = Map<
  string,
  {
    state: TimelineAccumulationState;
    probability: number;
  }
>;

type ResourcePyroxeneQuantiles = {
  optimistic: number;
  pessimistic: number;
};

export type PyroxeneTimelineBandMode = "central_ticket_discount" | "resource_state";

const TIMELINE_DELTA_PRIORITY = {
  NORMAL: 0,
  PICKUP: 10,
  TICKET_EXPIRY: 20,
} as const;

type PickupEvent = NonNullable<PyroxeneScheduleItem["event"]>;
type PickupRecruitment = PickupEvent["recruitments"][number];

type PickupTargetDistributionEntry = {
  acquiredMask: number;
  probability: number;
};

type PickupDpState = {
  targetIndex: number;
  acquiredMask: number;
  sparkPoints: number;
};

type PickupTrialCostDistributionMode = "with_pity" | "without_pity";

const pickupTrialCostDistributionCache = new Map<string, TrialDistribution>();

function zeroResources(): PickupResources {
  return { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
}

function getNextMonthlyFirstDate(date: dayjs.Dayjs): dayjs.Dayjs {
  return date.add(1, "month").startOf("month");
}

function getNextRepeatedGainDate(repeatedGain: NonNullable<PyroxeneScheduleItem["repeatedGain"]>, date: dayjs.Dayjs) {
  if (repeatedGain.repeatType === "monthly_first") {
    return getNextMonthlyFirstDate(date);
  }
  return date.add(repeatedGain.repeatIntervalDays ?? 0, "day");
}

function getEliminationTicketExpiresAt(raidUntil: Date | string): dayjs.Dayjs {
  return dayjs(raidUntil).add(1, "month").endOf("month");
}

function spendTenTimeTickets(lots: TenTimeTicketLot[], count: number): number {
  let remainingCount = count;
  let spentCount = 0;
  const sortedLots = [...lots].sort((a, b) => {
    if (a.expiresAt && b.expiresAt) {
      return a.expiresAt.diff(b.expiresAt);
    }
    if (a.expiresAt) {
      return -1;
    }
    if (b.expiresAt) {
      return 1;
    }
    return 0;
  });

  for (const lot of sortedLots) {
    if (remainingCount <= 0) {
      break;
    }
    const spendCount = Math.min(lot.count, remainingCount);
    lot.count -= spendCount;
    remainingCount -= spendCount;
    spentCount += spendCount;
  }

  return spentCount;
}

function applyTenTimeTicketDelta(lots: TenTimeTicketLot[], delta: TimelineDelta, resourceDelta: PickupResources) {
  if (resourceDelta.tenTimeTicket > 0) {
    lots.push({
      id: delta.tenTimeTicketLotId ?? `non-expiring-${delta.date.valueOf()}-${lots.length}`,
      count: resourceDelta.tenTimeTicket,
      expiresAt: delta.tenTimeTicketExpiresAt,
    });
  } else if (resourceDelta.tenTimeTicket < 0) {
    spendTenTimeTickets(lots, Math.abs(resourceDelta.tenTimeTicket));
  }
}

function expireTenTimeTicketLot(lots: TenTimeTicketLot[], lotId: string): number {
  const lot = lots.find((candidate) => candidate.id === lotId);
  if (!lot) {
    return 0;
  }
  const expiredCount = lot.count;
  lot.count = 0;
  return expiredCount;
}

function createTimelineAccumulationState(initialResources: PickupResources): TimelineAccumulationState {
  return {
    currentResources: initialResources,
    tenTimeTicketLots:
      initialResources.tenTimeTicket > 0 ? [{ id: "initial", count: initialResources.tenTimeTicket }] : [],
  };
}

function resolvePickupResourceDelta(
  state: TimelineAccumulationState,
  pickupTrial: number,
): PickupResources | undefined {
  if (pickupTrial > 0) {
    const resourceDelta = zeroResources();
    let remainingTrial = pickupTrial;
    if (remainingTrial >= 10) {
      const spentTenTimeTickets = spendTenTimeTickets(state.tenTimeTicketLots, Math.floor(remainingTrial / 10));
      resourceDelta.tenTimeTicket = spentTenTimeTickets > 0 ? -1 * spentTenTimeTickets : 0;
      remainingTrial -= spentTenTimeTickets * 10;
    }
    if (remainingTrial > 1) {
      const spentOneTimeTickets = Math.min(remainingTrial, state.currentResources.oneTimeTicket);
      resourceDelta.oneTimeTicket = spentOneTimeTickets > 0 ? -1 * spentOneTimeTickets : 0;
      remainingTrial -= spentOneTimeTickets;
    }
    resourceDelta.pyroxene = remainingTrial > 0 ? -1 * remainingTrial * 120 : 0;
    return resourceDelta;
  }
  if (pickupTrial === 0) {
    // expectedTrials가 0이면 소비 없이도 이벤트 row를 유지합니다.
    return zeroResources();
  }
  return undefined;
}

function resolveTimelineResourceDelta(
  state: TimelineAccumulationState,
  delta: TimelineDelta,
  pickupTrial: number | undefined,
): PickupResources | undefined {
  if (delta.resourceDelta) {
    return delta.resourceDelta;
  }
  if (pickupTrial !== undefined) {
    return resolvePickupResourceDelta(state, pickupTrial);
  }
  if (delta.tenTimeTicketLotId) {
    const expiredTicketCount = expireTenTimeTicketLot(state.tenTimeTicketLots, delta.tenTimeTicketLotId);
    if (expiredTicketCount > 0) {
      return { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: -expiredTicketCount };
    }
  }
  return undefined;
}

function applyTimelineResourceDelta(
  state: TimelineAccumulationState,
  delta: TimelineDelta,
  resourceDelta: PickupResources,
) {
  if (delta.resourceDelta) {
    applyTenTimeTicketDelta(state.tenTimeTicketLots, delta, resourceDelta);
  }

  state.currentResources = {
    pyroxene: state.currentResources.pyroxene + resourceDelta.pyroxene,
    oneTimeTicket: state.currentResources.oneTimeTicket + resourceDelta.oneTimeTicket,
    tenTimeTicket: state.currentResources.tenTimeTicket + resourceDelta.tenTimeTicket,
  };
}

// 천장(pity)으로 상한이 걸린 기하분포를 계산합니다.
// 한 명의 픽업 학생을 얻기까지 필요한 모집 횟수 N = min(첫 성공까지 시행, 천장).
const pickupTrialDistributionCache = new Map<number, TrialDistribution>();

function calculatePickupTrialDistribution(pickupRate: number): TrialDistribution {
  const cap = PYROXENE.PICKUP_TRIAL.ceil;
  if (pickupRate <= 0) {
    const distribution = Array(cap + 1).fill(0);
    distribution[cap] = 1;
    return distribution;
  }
  if (pickupRate >= 1) {
    const distribution = Array(cap + 1).fill(0);
    distribution[1] = 1;
    return distribution;
  }

  const cached = pickupTrialDistributionCache.get(pickupRate);
  if (cached) {
    return cached;
  }

  const q = 1 - pickupRate;
  const distribution = Array(cap + 1).fill(0);
  for (let k = 1; k < cap; k++) {
    distribution[k] = q ** (k - 1) * pickupRate;
  }
  // 천장 도달(N = cap) 확률: 직전까지 모두 실패.
  distribution[cap] = q ** (cap - 1);

  pickupTrialDistributionCache.set(pickupRate, distribution);
  return distribution;
}

export function calculatePickupTrialMoments(pickupRate: number): { mean: number; variance: number } {
  const distribution = calculatePickupTrialDistribution(pickupRate);
  const mean = distribution.reduce((sum, probability, trials) => sum + probability * trials, 0);
  const secondMoment = distribution.reduce((sum, probability, trials) => sum + probability * trials * trials, 0);
  return { mean, variance: Math.max(0, secondMoment - mean * mean) };
}

function getPickupRecruitmentRate(recruitment: NonNullable<PyroxeneScheduleItem["event"]>["recruitments"][number]) {
  return recruitment.student?.initialTier === 2
    ? DEFAULT_PICKUP_STUDENT_RATE_BY_TIER.tier2
    : DEFAULT_PICKUP_STUDENT_RATE_BY_TIER.tier3;
}

function subtractFreeRecruitmentTrial(pickupTrial: number): number {
  return Math.max(0, pickupTrial - PYROXENE.FREE_RECRUITMENT_TRIAL);
}

function bitCount(value: number): number {
  let count = 0;
  let remaining = value;
  while (remaining > 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function getRecruitmentStudentTier(recruitment: PickupRecruitment): number {
  return recruitment.student?.initialTier ?? 3;
}

function getRecruitmentTierSlotRate(recruitment: PickupRecruitment): number {
  const tier = getRecruitmentStudentTier(recruitment);
  if (tier === 2) {
    return 0.185;
  }
  if (recruitment.recruitmentType === "fes") {
    return 0.06;
  }
  return 0.03;
}

function getRecruitmentPoolCountByTier(event: PickupEvent, tier: number): number {
  if (tier === 2) {
    return event.recruitmentPool?.tier2Count ?? 1;
  }
  if (tier === 3) {
    return event.recruitmentPool?.tier3Count ?? 1;
  }
  return 1;
}

function addTrialProbability(distribution: TrialDistribution, trial: number, probability: number) {
  if (probability <= MIN_PROBABILITY) {
    return;
  }
  distribution[trial] = (distribution[trial] ?? 0) + probability;
}

function calculateExpectedTrial(distribution: TrialDistribution): number {
  const totalProbability = distribution.reduce((sum, probability) => sum + probability, 0);
  if (totalProbability <= 0) {
    return 0;
  }

  return distribution.reduce((sum, probability, trials) => sum + (probability / totalProbability) * trials, 0);
}

function convolveTrialDistributions(left: TrialDistribution, right: TrialDistribution): TrialDistribution {
  const distribution = Array(left.length + right.length - 1).fill(0);
  for (let leftTrials = 0; leftTrials < left.length; leftTrials++) {
    const leftProbability = left[leftTrials] ?? 0;
    if (leftProbability <= MIN_PROBABILITY) {
      continue;
    }
    for (let rightTrials = 0; rightTrials < right.length; rightTrials++) {
      const rightProbability = right[rightTrials] ?? 0;
      if (rightProbability <= MIN_PROBABILITY) {
        continue;
      }
      distribution[leftTrials + rightTrials] += leftProbability * rightProbability;
    }
  }
  return distribution;
}

function getTrialQuantile(distribution: TrialDistribution, quantile: number): number {
  const totalProbability = distribution.reduce((sum, probability) => sum + probability, 0);
  if (totalProbability <= 0) {
    return 0;
  }

  const target = Math.min(Math.max(quantile, 0), 1);
  let cumulativeProbability = 0;
  for (let trials = 0; trials < distribution.length; trials++) {
    cumulativeProbability += (distribution[trials] ?? 0) / totalProbability;
    if (cumulativeProbability + Number.EPSILON >= target) {
      return trials;
    }
  }
  return distribution.length - 1;
}

function getTrialDistributionPyroxeneQuantiles(
  distribution: TrialDistribution,
  pyroxeneOffset: number,
): ResourcePyroxeneQuantiles {
  return {
    optimistic: pyroxeneOffset - getTrialQuantile(distribution, 1 - PICKUP_TRIAL_BAND_QUANTILE.optimistic) * 120,
    pessimistic: pyroxeneOffset - getTrialQuantile(distribution, 1 - PICKUP_TRIAL_BAND_QUANTILE.pessimistic) * 120,
  };
}

function getTicketPyroxeneDiscount(resourceDelta: PickupResources | undefined): number {
  if (!resourceDelta) {
    return 0;
  }
  return Math.max(0, -resourceDelta.oneTimeTicket) * 120 + Math.max(0, -resourceDelta.tenTimeTicket) * 10 * 120;
}

function getPickupDpStateKey(state: PickupDpState): string {
  return `${state.targetIndex}:${state.acquiredMask}:${state.sparkPoints}`;
}

function getNextTargetIndex(
  targetRecruitments: PickupRecruitment[],
  targetIndex: number,
  acquiredMask: number,
): number {
  let nextTargetIndex = targetIndex;
  while (nextTargetIndex < targetRecruitments.length && (acquiredMask & (1 << nextTargetIndex)) !== 0) {
    nextTargetIndex++;
  }
  return nextTargetIndex;
}

function shouldStopTarget(
  targetRecruitments: PickupRecruitment[],
  targetIndex: number,
  acquiredMask: number,
  sparkPoints: number,
  mode: PickupTrialCostDistributionMode,
) {
  const targetCount = targetRecruitments.length;
  if (targetIndex >= targetCount) {
    return true;
  }

  const missingTargetCount = targetCount - bitCount(acquiredMask);
  if (missingTargetCount <= 0) {
    return true;
  }

  if (mode === "without_pity") {
    return false;
  }

  return Math.floor(sparkPoints / PYROXENE.PICKUP_TRIAL.ceil) >= missingTargetCount;
}

function applySparkExchange(acquiredMask: number, targetCount: number, sparkPoints: number): number {
  let result = acquiredMask;
  let exchangeableCount = Math.floor(sparkPoints / PYROXENE.PICKUP_TRIAL.ceil);
  for (let targetIndex = 0; targetIndex < targetCount && exchangeableCount > 0; targetIndex++) {
    const targetMask = 1 << targetIndex;
    if ((result & targetMask) !== 0) {
      continue;
    }
    result |= targetMask;
    exchangeableCount--;
  }
  return result;
}

function getTargetSlotDistribution(
  targetRecruitments: PickupRecruitment[],
  currentTargetIndex: number,
  event: PickupEvent,
): PickupTargetDistributionEntry[] {
  const currentTarget = targetRecruitments[currentTargetIndex];
  if (!currentTarget) {
    return [{ acquiredMask: 0, probability: 1 }];
  }

  const entries: PickupTargetDistributionEntry[] = [];
  const currentTier = getRecruitmentStudentTier(currentTarget);
  const directProbability = getPickupRecruitmentRate(currentTarget);
  entries.push({ acquiredMask: 1 << currentTargetIndex, probability: directProbability });

  if (currentTier === 2 || currentTier === 3) {
    const poolCount = Math.max(1, getRecruitmentPoolCountByTier(event, currentTier) - 1);
    const offRateProbability = Math.max(0, getRecruitmentTierSlotRate(currentTarget) - directProbability);
    const spookProbability = offRateProbability / poolCount;

    for (let targetIndex = 0; targetIndex < targetRecruitments.length; targetIndex++) {
      if (targetIndex === currentTargetIndex) {
        continue;
      }
      if (getRecruitmentStudentTier(targetRecruitments[targetIndex]) !== currentTier) {
        continue;
      }
      entries.push({ acquiredMask: 1 << targetIndex, probability: spookProbability });
    }
  }

  const hitProbability = entries.reduce((sum, entry) => sum + entry.probability, 0);
  return [...entries, { acquiredMask: 0, probability: Math.max(0, 1 - hitProbability) }].filter(
    (entry) => entry.probability > MIN_PROBABILITY,
  );
}

function getPickupTrialCostDistributionCacheKey(
  event: PickupEvent,
  pickupRecruitments: PickupRecruitment[],
  mode: PickupTrialCostDistributionMode,
): string {
  const recruitmentKey = pickupRecruitments
    .map((recruitment) =>
      [
        recruitment.student?.uid ?? "",
        recruitment.student?.initialTier ?? "",
        recruitment.recruitmentType,
        recruitment.pickup ? "p" : "",
      ].join(":"),
    )
    .join("|");

  return [
    mode,
    event.uid,
    isFreeRecruitment100Event(event) ? "free100" : "paid",
    event.recruitmentPool?.tier2Count ?? "",
    event.recruitmentPool?.tier3Count ?? "",
    recruitmentKey,
  ].join("::");
}

function getPickupTrialCostDistribution(
  event: PickupEvent,
  pickupRecruitments: PickupRecruitment[],
  mode: PickupTrialCostDistributionMode,
): TrialDistribution {
  const targetCount = pickupRecruitments.length;
  if (targetCount === 0) {
    return [1];
  }

  const cacheKey = getPickupTrialCostDistributionCacheKey(event, pickupRecruitments, mode);
  const cached = pickupTrialCostDistributionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const distribution: TrialDistribution = [];
  let activeStates = new Map<string, { state: PickupDpState; probability: number }>();
  const initialState = { targetIndex: 0, acquiredMask: 0, sparkPoints: 0 };
  activeStates.set(getPickupDpStateKey(initialState), { state: initialState, probability: 1 });

  while (activeStates.size > 0) {
    const nextStates = new Map<string, { state: PickupDpState; probability: number }>();

    for (const { state, probability } of activeStates.values()) {
      const targetIndex = getNextTargetIndex(pickupRecruitments, state.targetIndex, state.acquiredMask);
      if (shouldStopTarget(pickupRecruitments, targetIndex, state.acquiredMask, state.sparkPoints, mode)) {
        const acquiredMask =
          mode === "with_pity"
            ? applySparkExchange(state.acquiredMask, targetCount, state.sparkPoints)
            : state.acquiredMask;
        if (bitCount(acquiredMask) >= targetCount) {
          addTrialProbability(distribution, state.sparkPoints, probability);
        }
        continue;
      }

      for (const result of getTargetSlotDistribution(pickupRecruitments, targetIndex, event)) {
        const sparkPoints = state.sparkPoints + 1;
        const acquiredMask = state.acquiredMask | result.acquiredMask;
        const nextTargetIndex = getNextTargetIndex(pickupRecruitments, targetIndex, acquiredMask);
        const nextState = { targetIndex: nextTargetIndex, acquiredMask, sparkPoints };
        const nextProbability = probability * result.probability;
        const key = getPickupDpStateKey(nextState);
        const existing = nextStates.get(key);
        if (existing) {
          existing.probability += nextProbability;
        } else if (nextProbability > MIN_PROBABILITY) {
          nextStates.set(key, { state: nextState, probability: nextProbability });
        }
      }
    }

    activeStates = nextStates;
  }

  if (isFreeRecruitment100Event(event)) {
    const paidDistribution: TrialDistribution = [];
    for (let trials = 0; trials < distribution.length; trials++) {
      addTrialProbability(paidDistribution, subtractFreeRecruitmentTrial(trials), distribution[trials] ?? 0);
    }
    cachePickupTrialCostDistribution(cacheKey, paidDistribution);
    return paidDistribution;
  }

  cachePickupTrialCostDistribution(cacheKey, distribution);
  return distribution;
}

function cachePickupTrialCostDistribution(cacheKey: string, distribution: TrialDistribution) {
  if (pickupTrialCostDistributionCache.size >= MAX_PICKUP_TRIAL_COST_DISTRIBUTION_CACHE_SIZE) {
    pickupTrialCostDistributionCache.clear();
  }
  pickupTrialCostDistributionCache.set(cacheKey, distribution);
}

function cloneTimelineAccumulationState(state: TimelineAccumulationState): TimelineAccumulationState {
  return {
    currentResources: { ...state.currentResources },
    tenTimeTicketLots: state.tenTimeTicketLots.map((lot) => ({ ...lot })),
  };
}

function normalizeTimelineAccumulationState(state: TimelineAccumulationState): TimelineAccumulationState {
  return {
    currentResources: { ...state.currentResources },
    tenTimeTicketLots: state.tenTimeTicketLots
      .filter((lot) => lot.count > 0)
      .map((lot) => ({ ...lot }))
      .sort((a, b) => {
        const expiresAtDiff =
          (a.expiresAt?.valueOf() ?? Number.POSITIVE_INFINITY) - (b.expiresAt?.valueOf() ?? Number.POSITIVE_INFINITY);
        if (expiresAtDiff !== 0) {
          return expiresAtDiff;
        }
        return a.id.localeCompare(b.id);
      }),
  };
}

// state는 이미 normalizeTimelineAccumulationState로 정규화된 상태여야 합니다.
// (호출부에서 정규화하므로 여기서 중복 정규화하지 않습니다.)
function getTimelineStateKey(state: TimelineAccumulationState): string {
  const lotKey = state.tenTimeTicketLots
    .map((lot) => `${lot.id}:${lot.count}:${lot.expiresAt?.valueOf() ?? ""}`)
    .join("|");
  return `${state.currentResources.pyroxene}:${state.currentResources.oneTimeTicket}:${state.currentResources.tenTimeTicket}:${lotKey}`;
}

function singletonResourceStateDistribution(state: TimelineAccumulationState): ResourceStateDistribution {
  const distribution: ResourceStateDistribution = new Map();
  const cloned = normalizeTimelineAccumulationState(cloneTimelineAccumulationState(state));
  distribution.set(getTimelineStateKey(cloned), { state: cloned, probability: 1 });
  return distribution;
}

function hasRecruitmentTickets(state: TimelineAccumulationState): boolean {
  return (
    state.currentResources.oneTimeTicket > 0 ||
    state.currentResources.tenTimeTicket > 0 ||
    state.tenTimeTicketLots.some((lot) => lot.count > 0)
  );
}

function mergeResourceState(
  distribution: ResourceStateDistribution,
  state: TimelineAccumulationState,
  probability: number,
) {
  if (probability <= RESOURCE_STATE_MIN_PROBABILITY) {
    return;
  }

  const normalized = normalizeTimelineAccumulationState(state);
  const key = getTimelineStateKey(normalized);
  const existing = distribution.get(key);
  if (existing) {
    existing.probability += probability;
  } else {
    distribution.set(key, { state: normalized, probability });
  }
}

function applyFixedDeltaToResourceState(
  state: TimelineAccumulationState,
  delta: TimelineDelta,
  pickupTrial: number | undefined,
): TimelineAccumulationState {
  const nextState = cloneTimelineAccumulationState(state);
  const resourceDelta = resolveTimelineResourceDelta(nextState, delta, pickupTrial);
  if (resourceDelta) {
    applyTimelineResourceDelta(nextState, delta, resourceDelta);
  }
  return nextState;
}

function applyFixedDeltaToResourceStates(
  distribution: ResourceStateDistribution,
  delta: TimelineDelta,
  pickupTrial: number | undefined,
): ResourceStateDistribution {
  const nextDistribution: ResourceStateDistribution = new Map();
  for (const { state, probability } of distribution.values()) {
    mergeResourceState(nextDistribution, applyFixedDeltaToResourceState(state, delta, pickupTrial), probability);
  }
  return nextDistribution;
}

function applyPickupTrialCostDistributionToResourceStates(
  distribution: ResourceStateDistribution,
  delta: TimelineDelta,
  trialDistribution: TrialDistribution,
): ResourceStateDistribution {
  const nextDistribution: ResourceStateDistribution = new Map();
  for (const { state, probability } of distribution.values()) {
    for (let pickupTrial = 0; pickupTrial < trialDistribution.length; pickupTrial++) {
      const trialProbability = trialDistribution[pickupTrial] ?? 0;
      if (trialProbability <= MIN_PROBABILITY) {
        continue;
      }
      const nextState = applyFixedDeltaToResourceState(state, delta, pickupTrial);
      mergeResourceState(nextDistribution, nextState, probability * trialProbability);
    }
  }
  return nextDistribution;
}

function convertTrialDistributionToResourceStates(
  trialDistribution: TrialDistribution | null,
  state: TimelineAccumulationState,
  pyroxeneOffset: number,
): ResourceStateDistribution {
  if (!trialDistribution) {
    return singletonResourceStateDistribution(state);
  }

  const distribution: ResourceStateDistribution = new Map();
  for (let pickupTrial = 0; pickupTrial < trialDistribution.length; pickupTrial++) {
    const probability = trialDistribution[pickupTrial] ?? 0;
    if (probability <= 0) {
      continue;
    }

    const nextState = cloneTimelineAccumulationState(state);
    nextState.currentResources = {
      ...nextState.currentResources,
      pyroxene: pyroxeneOffset - pickupTrial * 120,
    };
    mergeResourceState(distribution, nextState, probability);
  }
  return distribution;
}

function getDeltaWithPyroxeneExcluded(delta: TimelineDelta): TimelineDelta {
  if (!delta.resourceDelta || delta.resourceDelta.pyroxene === 0) {
    return delta;
  }

  return {
    ...delta,
    resourceDelta: {
      ...delta.resourceDelta,
      pyroxene: 0,
    },
  };
}

function shouldApplyFixedDeltaToResourceStates(delta: TimelineDelta, pickupTrial: number | undefined): boolean {
  if (pickupTrial !== undefined) {
    return true;
  }
  if (delta.tenTimeTicketLotId) {
    return true;
  }
  if (!delta.resourceDelta) {
    return false;
  }
  return delta.resourceDelta.oneTimeTicket !== 0 || delta.resourceDelta.tenTimeTicket !== 0;
}

type SortedResourceStateEntry = {
  pyroxene: number;
  probability: number;
};

function getSortedResourcePyroxeneQuantile(
  sortedEntries: SortedResourceStateEntry[],
  totalProbability: number,
  quantile: number,
): number {
  const target = Math.min(Math.max(quantile, 0), 1);
  let cumulativeProbability = 0;

  for (const entry of sortedEntries) {
    cumulativeProbability += entry.probability / totalProbability;
    if (cumulativeProbability + Number.EPSILON >= target) {
      return entry.pyroxene;
    }
  }

  return sortedEntries.at(-1)?.pyroxene ?? 0;
}

// optimistic/pessimistic 분위수를 위해 분포를 한 번만 정렬·합산해 재사용합니다.
function getResourcePyroxeneQuantiles(distribution: ResourceStateDistribution): ResourcePyroxeneQuantiles {
  const sortedEntries: SortedResourceStateEntry[] = [...distribution.values()]
    .map((entry) => ({ pyroxene: entry.state.currentResources.pyroxene, probability: entry.probability }))
    .sort((a, b) => a.pyroxene - b.pyroxene);
  const totalProbability = sortedEntries.reduce((sum, entry) => sum + entry.probability, 0);

  return {
    optimistic: getSortedResourcePyroxeneQuantile(
      sortedEntries,
      totalProbability,
      PICKUP_TRIAL_BAND_QUANTILE.optimistic,
    ),
    pessimistic: getSortedResourcePyroxeneQuantile(
      sortedEntries,
      totalProbability,
      PICKUP_TRIAL_BAND_QUANTILE.pessimistic,
    ),
  };
}

export function isFreeRecruitment100Event(event: NonNullable<PyroxeneScheduleItem["event"]>, now = dayjs()): boolean {
  return (
    event.tags.includes("recruit_free_100") &&
    event.recruitments.every(({ until }) => until !== null && dayjs(until).isAfter(now))
  );
}

export function buildTimeline(
  initialResources: PickupResources,
  initialDate: Date,
  eventDataMap: Map<string, { completed: boolean; expectedTrials: number | null }>,
  scheduleItems: PyroxeneScheduleItem[],
  options: PyroxeneCalculationOptions,
  bandMode: PyroxeneTimelineBandMode = "central_ticket_discount",
  collectedSourceKeys: string[] = [],
): Timeline {
  const collectedSources = new Set(collectedSourceKeys);
  const maxDate = scheduleItems.reduce((max, item) => {
    if (!item.event) {
      return max;
    }
    const eventUntil = dayjs(item.event.until);
    return max.isAfter(eventUntil) ? max : eventUntil;
  }, dayjs(initialDate));

  const timelineDeltas: TimelineDelta[] = [];
  for (const scheduleItem of scheduleItems) {
    if (scheduleItem.event) {
      const { event } = scheduleItem;

      // 이벤트 보상 청휘석은 픽업 완료 여부와 무관하게 이벤트 종료일에 수급됩니다.
      if (event.earnablePyroxene) {
        const collectedSourceKey = collectedSourceKeyForEventReward(event.uid);
        timelineDeltas.push({
          date: dayjs(event.until),
          source: { type: "event_reward", uid: event.uid, description: event.name, collectedSourceKey },
          resourceDelta: collectedSources.has(collectedSourceKey)
            ? zeroResources()
            : { pyroxene: event.earnablePyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
        });
      }

      const pickupRecruitments = event.recruitments.filter(
        ({ pickup, favorited, recruitmentType }) => pickup && favorited && recruitmentType !== "given",
      );
      const pickupCount = pickupRecruitments.length;
      if (pickupCount === 0) {
        continue;
      }

      const eventData = eventDataMap.get(event.uid);
      if (eventData?.completed) {
        // 이미 픽업을 완료한 일정은 소비 계산에서 제외하되, 완료 상태 표시를 위해 row는 남깁니다.
        timelineDeltas.push({
          date: dayjs(event.since),
          source: { type: "event", event },
          resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
        });
        continue;
      }

      const manualExpectedTrials = eventData?.expectedTrials ?? null;
      let pickupTrial: number;
      let pickupTrialCostDistribution: TrialDistribution | undefined;
      if (manualExpectedTrials !== null) {
        pickupTrial = manualExpectedTrials;
      } else {
        // 이벤트별 직접 입력이 없으면 관심 등록된 픽업 학생 수와 전역 모집 목표로 계산합니다.
        if (options.event.pickupChance !== "ceil") {
          pickupTrialCostDistribution = getPickupTrialCostDistribution(
            event,
            pickupRecruitments,
            options.event.pickupChance === "average" ? "without_pity" : "with_pity",
          );
        }
        if (options.event.pickupChance === "average_pity") {
          pickupTrial = Math.round(calculateExpectedTrial(pickupTrialCostDistribution ?? [1]));
        } else {
          pickupTrial =
            pickupCount *
            (options.event.pickupChance === "ceil" ? PYROXENE.PICKUP_TRIAL.ceil : PYROXENE.PICKUP_TRIAL.average);
        }
      }

      if (
        isFreeRecruitment100Event(event) &&
        (manualExpectedTrials !== null ||
          options.event.pickupChance === "average" ||
          options.event.pickupChance === "ceil")
      ) {
        pickupTrial = subtractFreeRecruitmentTrial(pickupTrial);
      }

      timelineDeltas.push({
        date: dayjs(event.since),
        source: { type: "event", event },
        pickupTrial,
        pickupTrialCostDistribution,
      });
    } else if (scheduleItem.raid) {
      const { raid } = scheduleItem;
      const collectedSourceKey = collectedSourceKeyForRaid(raid.uid);
      const raidSource = {
        type: "raid" as const,
        uid: raid.uid,
        collectedSourceKey,
      };
      const isCollected = collectedSources.has(collectedSourceKey);
      if (raid.type === "total_assault") {
        const tierReward = PYROXENE.RAID_TOTAL_ASSAULT_TIER[options.raid.tier];
        timelineDeltas.push({
          date: dayjs(raid.until),
          source: { ...raidSource, description: `총력전 ${raid.name}` },
          resourceDelta: isCollected
            ? zeroResources()
            : {
                pyroxene: PYROXENE.RAID_TOTAL_ASSAULT_BASE + tierReward,
                oneTimeTicket: 0,
                tenTimeTicket: 0,
              },
        });
      } else if (raid.type === "elimination") {
        if (isCollected) {
          timelineDeltas.push({
            date: dayjs(raid.until),
            source: { ...raidSource, description: `대결전 ${raid.name}` },
            resourceDelta: zeroResources(),
          });
          continue;
        }
        const ticketLotId = `${raid.uid}::ten-time-ticket`;
        const ticketExpiresAt = getEliminationTicketExpiresAt(raid.until);
        timelineDeltas.push({
          date: dayjs(raid.until).add(1, "day"),
          source: { ...raidSource, description: `대결전 ${raid.name}` },
          resourceDelta: { pyroxene: PYROXENE.RAID_ELIMINATION_BASE, oneTimeTicket: 0, tenTimeTicket: 1 },
          tenTimeTicketLotId: ticketLotId,
          tenTimeTicketExpiresAt: ticketExpiresAt,
        });
        timelineDeltas.push({
          date: ticketExpiresAt,
          source: {
            type: "raid",
            uid: `${raid.uid}::ten-time-ticket-expiry`,
            collectedSourceKey,
            description: "대결전 10회 모집 티켓 만료",
          },
          tenTimeTicketLotId: ticketLotId,
          priority: TIMELINE_DELTA_PRIORITY.TICKET_EXPIRY,
        });
      }
    } else if (scheduleItem.onetimeGain) {
      const { onetimeGain } = scheduleItem;
      timelineDeltas.push({
        date: dayjs(onetimeGain.date),
        source: { type: onetimeGain.source, uid: onetimeGain.uid, description: onetimeGain.description },
        resourceDelta: {
          pyroxene: onetimeGain.pyroxeneDelta ?? 0,
          oneTimeTicket: onetimeGain.oneTimeTicketDelta ?? 0,
          tenTimeTicket: onetimeGain.tenTimeTicketDelta ?? 0,
        },
      });
    } else if (scheduleItem.repeatedGain) {
      const { repeatedGain } = scheduleItem;
      if (
        repeatedGain.repeatType !== "monthly_first" &&
        (!repeatedGain.repeatIntervalDays || repeatedGain.repeatIntervalDays <= 0)
      ) {
        continue;
      }

      let repeatedGainCount = 0;
      for (
        let date = dayjs(repeatedGain.date);
        date.isBefore(maxDate) && repeatedGainCount < (repeatedGain.repeatCount ?? MAX_REPEATED_ENTRIES);
        date = getNextRepeatedGainDate(repeatedGain, date)
      ) {
        timelineDeltas.push({
          date,
          source: { type: repeatedGain.source, uid: repeatedGain.uid, description: repeatedGain.description },
          resourceDelta: {
            pyroxene: repeatedGain.pyroxeneDelta ?? 0,
            oneTimeTicket: repeatedGain.oneTimeTicketDelta ?? 0,
            tenTimeTicket: repeatedGain.tenTimeTicketDelta ?? 0,
          },
        });
        repeatedGainCount++;
      }
    }
  }

  const dateFrom = dayjs(initialDate);
  const tacticalPyroxene = PYROXENE.TACTICAL[options.tactical.level];
  const dailyApChargePyroxene = calculateDailyApChargePyroxene(options.consumption.apChargeCount);

  let dailyEntryCount = 0;
  for (
    let date = dateFrom;
    date.isBefore(maxDate) && dailyEntryCount < MAX_REPEATED_ENTRIES;
    date = date.add(1, "day")
  ) {
    dailyEntryCount++;
    timelineDeltas.push({
      date,
      source: { type: "daily_mission", description: "일일 임무" },
      resourceDelta: { pyroxene: PYROXENE.DAILY_MISSION, oneTimeTicket: 0, tenTimeTicket: 0 },
    });

    if (date.day() === 0) {
      timelineDeltas.push({
        date,
        source: { type: "weekly_mission", description: "주간 임무" },
        resourceDelta: { pyroxene: PYROXENE.WEEKLY_MISSION, oneTimeTicket: 0, tenTimeTicket: 0 },
      });
    }

    timelineDeltas.push({
      date,
      source: { type: "tactical", description: "전술대회" },
      resourceDelta: { pyroxene: tacticalPyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
    });

    if (dailyApChargePyroxene > 0) {
      timelineDeltas.push({
        date,
        source: { type: "ap_charge", description: "AP 충전" },
        resourceDelta: { pyroxene: -dailyApChargePyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
      });
    }
  }

  const initialDateDayjs = dayjs(initialDate);
  const filteredDeltas = timelineDeltas.filter((delta) => {
    if (delta.date.isAfter(initialDateDayjs)) {
      return true;
    }
    if (delta.source.event) {
      return dayjs(delta.source.event.until).isAfter(initialDateDayjs);
    }
    return false;
  });

  const timeline: Timeline = [];
  const centralState = createTimelineAccumulationState(initialResources);
  const shouldBuildProbabilityBand = options.event.pickupChance !== "ceil";
  // 직접 입력이 아닌 픽업 이벤트만 실제 확률분포에 누적합니다.
  // 밴드는 중앙선 ± 폭이 아니라 누적 자원 상태 분포의 10/90 분위수로 계산합니다.
  let bandTrialDistribution: TrialDistribution | null = null;
  let bandStateDistribution: ResourceStateDistribution | null = null;
  let bandPyroxeneOffset = 0;
  let bandBasePyroxeneQuantiles: ResourcePyroxeneQuantiles | null = null;
  for (const delta of filteredDeltas.sort((a, b) => {
    const dateDiff = a.date.diff(b.date);
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return (a.priority ?? TIMELINE_DELTA_PRIORITY.NORMAL) - (b.priority ?? TIMELINE_DELTA_PRIORITY.NORMAL);
  })) {
    const bandStartState = cloneTimelineAccumulationState(centralState);
    const resourceDelta = resolveTimelineResourceDelta(centralState, delta, delta.pickupTrial);

    if (shouldBuildProbabilityBand && bandMode === "resource_state") {
      if (bandStateDistribution === null && delta.pickupTrial !== undefined && hasRecruitmentTickets(bandStartState)) {
        bandStateDistribution = convertTrialDistributionToResourceStates(
          bandTrialDistribution,
          bandStartState,
          bandPyroxeneOffset,
        );
        bandTrialDistribution = null;
        bandPyroxeneOffset = 0;
      }

      if (bandStateDistribution && delta.pickupTrialCostDistribution) {
        bandStateDistribution = applyPickupTrialCostDistributionToResourceStates(
          bandStateDistribution,
          delta,
          delta.pickupTrialCostDistribution,
        );
        bandBasePyroxeneQuantiles = getResourcePyroxeneQuantiles(bandStateDistribution);
      } else if (bandStateDistribution) {
        if (delta.resourceDelta?.pyroxene) {
          bandPyroxeneOffset += delta.resourceDelta.pyroxene;
        }

        if (shouldApplyFixedDeltaToResourceStates(delta, delta.pickupTrial)) {
          bandStateDistribution = applyFixedDeltaToResourceStates(
            bandStateDistribution,
            getDeltaWithPyroxeneExcluded(delta),
            delta.pickupTrial,
          );
          bandBasePyroxeneQuantiles = getResourcePyroxeneQuantiles(bandStateDistribution);
        }
      } else if (delta.pickupTrialCostDistribution) {
        if (!bandTrialDistribution) {
          bandTrialDistribution = [1];
          bandPyroxeneOffset = bandStartState.currentResources.pyroxene;
        }
        bandTrialDistribution = convolveTrialDistributions(bandTrialDistribution, delta.pickupTrialCostDistribution);
        bandBasePyroxeneQuantiles = getTrialDistributionPyroxeneQuantiles(bandTrialDistribution, 0);
      } else if (bandTrialDistribution && resourceDelta?.pyroxene) {
        bandPyroxeneOffset += resourceDelta.pyroxene;
        bandBasePyroxeneQuantiles = getTrialDistributionPyroxeneQuantiles(bandTrialDistribution, 0);
      }
    } else if (shouldBuildProbabilityBand && delta.pickupTrialCostDistribution) {
      if (!bandTrialDistribution) {
        bandTrialDistribution = [1];
        bandPyroxeneOffset = bandStartState.currentResources.pyroxene;
      }
      bandTrialDistribution = convolveTrialDistributions(bandTrialDistribution, delta.pickupTrialCostDistribution);
      bandPyroxeneOffset += getTicketPyroxeneDiscount(resourceDelta);
      bandBasePyroxeneQuantiles = getTrialDistributionPyroxeneQuantiles(bandTrialDistribution, 0);
    } else if (shouldBuildProbabilityBand && bandTrialDistribution && resourceDelta?.pyroxene) {
      bandPyroxeneOffset += resourceDelta.pyroxene;
      bandBasePyroxeneQuantiles = getTrialDistributionPyroxeneQuantiles(bandTrialDistribution, 0);
    }

    if (!resourceDelta) {
      continue;
    }

    applyTimelineResourceDelta(centralState, delta, resourceDelta);

    const central = centralState.currentResources;
    const optimisticPyroxene = bandBasePyroxeneQuantiles
      ? bandBasePyroxeneQuantiles.optimistic + bandPyroxeneOffset
      : null;
    const pessimisticPyroxene = bandBasePyroxeneQuantiles
      ? bandBasePyroxeneQuantiles.pessimistic + bandPyroxeneOffset
      : null;

    timeline.push({
      date: delta.date,
      source: delta.source,
      resourceDelta,
      accumulatedResources: { ...central },
      accumulatedResourcesBand:
        optimisticPyroxene !== null && pessimisticPyroxene !== null
          ? {
              optimistic: {
                ...central,
                pyroxene: Math.max(optimisticPyroxene, central.pyroxene),
              },
              pessimistic: {
                ...central,
                pyroxene: Math.min(pessimisticPyroxene, central.pyroxene),
              },
            }
          : undefined,
    });
  }
  return timeline;
}
