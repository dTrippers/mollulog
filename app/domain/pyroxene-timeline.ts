import type { Dayjs } from "dayjs";
import {
  getPyroxeneApChargeCountForDate,
  type PyroxeneCalculationOptions,
  type PyroxenePickupChance,
  type TimelineSourceType,
} from "~/domain/pyroxene-planner";
import {
  DEFAULT_RECRUITMENT_TARGET_TIER,
  EMPTY_RECRUITMENT_STACKS,
  getRecruitmentTargetCopies,
  type RecruitmentStacks,
  type RecruitmentTargetTiers,
} from "~/domain/pyroxene-recruitment-goal";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { calculateDailyApChargePyroxene, collectedSourceKeyForEventReward } from "~/domain/pyroxene-sources";
import {
  applyRecruitmentFunding,
  convolvePullCostDistributions,
  getFundedRecruitmentPulls,
  getRecruitmentChargeScope,
  normalizeRecruitmentCharge,
  type PullCostDistribution,
  type RecruitmentChargeScope,
  type RecruitmentCostPeriod,
  simulateRecruitmentCost,
} from "~/domain/recruitment-cost";
import { getTaggedFreeRecruitmentPulls, withoutFreeRecruitmentTags } from "~/domain/recruitment-notice";
import { sampleDistribution, sampleMissesBeforeHit } from "~/domain/recruitment-sampling";
import { DEFAULT_PICKUP_STUDENT_RATE_BY_TIER } from "~/domain/recruitment-simulator";
import dayjs from "~/lib/dayjs";

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
  date: Dayjs;
  source: TimelineSource;

  pickupTrial?: number;
  // 이벤트별 직접 입력이 없는 픽업의 실제 유료 모집 횟수 확률분포입니다. 인덱스가 모집 횟수를 뜻합니다.
  pickupTrialCostDistribution?: TrialDistribution;
  pickupPlan?: TimelinePickupPlan;
  resourceDelta?: PickupResources;
  tenTimeTicketLotId?: string;
  tenTimeTicketExpiresAt?: Dayjs;
  priority?: number;
};

// Per-event planner data. pickupChance overrides the global basis; targetTiers maps student uid to target tier.
export type PyroxeneTimelineEventData = {
  completed: boolean;
  expectedTrials: number | null;
  pickupChance?: PyroxenePickupChance | null;
  targetTiers?: RecruitmentTargetTiers;
};

export type TimelineEntry = {
  date: Dayjs;
  source: TimelineSource;
  accumulatedResources: PickupResources;
  accumulatedResourcesBand?: {
    optimistic: PickupResources;
    pessimistic: PickupResources;
  };
  resourceDelta: PickupResources;
  pickupPlan?: TimelinePickupPlan;
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

type TrialDistribution = PullCostDistribution;

export { calculateDailyApChargePyroxene } from "~/domain/pyroxene-sources";

type TenTimeTicketLot = {
  id: string;
  count: number;
  expiresAt?: Dayjs;
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

type PickupTrialCostDistributionMode = "with_pity" | "without_pity";

const pickupTrialCostDistributionCache = new Map<string, PickupTrialDistributions>();

function zeroResources(): PickupResources {
  return { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
}

function getNextMonthlyFirstDate(date: Dayjs): Dayjs {
  return date.add(1, "month").startOf("month");
}

function getNextRepeatedGainDate(repeatedGain: NonNullable<PyroxeneScheduleItem["repeatedGain"]>, date: Dayjs) {
  if (repeatedGain.repeatType === "monthly_first") {
    return getNextMonthlyFirstDate(date);
  }
  return date.add(repeatedGain.repeatIntervalDays ?? 0, "day");
}

function getRaidRewardDate(raidUntil: Date | string): Dayjs {
  return dayjs(raidUntil).tz("Asia/Seoul").add(1, "day").startOf("day");
}

function getEliminationTicketExpiresAt(rewardAt: Date | string | Dayjs): Dayjs {
  return dayjs(rewardAt).tz("Asia/Seoul").add(1, "month").endOf("month");
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
    if (remainingTrial > 0) {
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

function subtractFreeRecruitmentTrial(pickupTrial: number, freePulls: number): number {
  return Math.max(0, pickupTrial - freePulls);
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

function getPickupTrialCostDistributionCacheKey(
  event: PickupEvent,
  pickupRecruitments: PickupRecruitment[],
  mode: PickupTrialCostDistributionMode,
  stacks: RecruitmentStacks,
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
    event.recruitmentRuleSet ?? "legacy_points",
    `free${getFreeRecruitmentPulls(event)}`,
    event.recruitmentPool?.tier2Count ?? "",
    event.recruitmentPool?.tier3Count ?? "",
    `stack${stacks.regular}:${stacks.limited}`,
    recruitmentKey,
  ].join("::");
}

function groupTargetsByChargeScope(
  pickupRecruitments: PickupRecruitment[],
): Map<RecruitmentChargeScope | null, PickupRecruitment[]> {
  const groups = new Map<RecruitmentChargeScope | null, PickupRecruitment[]>();
  for (const recruitment of pickupRecruitments) {
    const scope = getRecruitmentChargeScope(recruitment.recruitmentType);
    const group = groups.get(scope) ?? [];
    group.push(recruitment);
    groups.set(scope, group);
  }
  return groups;
}

// Copies of one student share a student key; distinct students without a listed student get their own key.
function getTargetStudentKeys(pickupRecruitments: PickupRecruitment[]): string[] {
  const keys = new Map<PickupRecruitment, string>();
  return pickupRecruitments.map((recruitment, index) => {
    const existing = keys.get(recruitment);
    if (existing) {
      return existing;
    }
    const key = recruitment.student?.uid ?? `unlisted-${index}`;
    keys.set(recruitment, key);
    return key;
  });
}

function countDistinctStudentsByTier(pickupRecruitments: PickupRecruitment[], tier: 2 | 3): number {
  return new Set(pickupRecruitments.filter((recruitment) => getRecruitmentStudentTier(recruitment) === tier)).size;
}

function simulateCallChargeScope(
  event: PickupEvent,
  scopeRecruitments: PickupRecruitment[],
  initialCharge: number,
): TrialDistribution {
  const studentKeys = getTargetStudentKeys(scopeRecruitments);
  const recruitmentPeriod: RecruitmentCostPeriod = {
    uid: event.uid,
    recruitmentType: scopeRecruitments[0]?.recruitmentType ?? "usual",
    targets: scopeRecruitments.map((recruitment, index) => ({
      key: `${studentKeys[index]}#${index}`,
      studentKey: studentKeys[index],
      initialTier: getRecruitmentStudentTier(recruitment),
      recruitmentType: recruitment.recruitmentType,
    })),
    tier2PoolCount: Math.max(event.recruitmentPool?.tier2Count ?? 1, countDistinctStudentsByTier(scopeRecruitments, 2)),
    tier3PoolCount: Math.max(event.recruitmentPool?.tier3Count ?? 1, countDistinctStudentsByTier(scopeRecruitments, 3)),
  };
  return simulateRecruitmentCost(recruitmentPeriod, "call_charge_v1", { initialCharge });
}

// Pull count distribution until every target copy is acquired, before free pulls and mileage tickets.
// Pull by pull, the active pickup is the earliest unacquired copy; other targets of the active
// student's tier are hit off-rate from the pool. With pity, every 200 pulls exchange one missing copy,
// so a run ends once the exchanges cover every copy still missing.
//
// Ordinary pulls between hits have fixed probabilities, so runs of misses are sampled at once.
function simulatePickupTrialDistribution(
  event: PickupEvent,
  pickupRecruitments: PickupRecruitment[],
  mode: PickupTrialCostDistributionMode,
): TrialDistribution {
  // Copies of one student are the same recruitment object repeated in the target list.
  const students: { recruitment: PickupRecruitment; firstIndex: number; copies: number }[] = [];
  const studentIndexByRecruitment = new Map<PickupRecruitment, number>();
  pickupRecruitments.forEach((recruitment, index) => {
    const existing = studentIndexByRecruitment.get(recruitment);
    if (existing === undefined) {
      studentIndexByRecruitment.set(recruitment, students.length);
      students.push({ recruitment, firstIndex: index, copies: 1 });
    } else {
      students[existing]!.copies += 1;
    }
  });
  const studentCount = students.length;
  const targetCount = pickupRecruitments.length;
  const acquired = new Int32Array(studentCount);
  const finished = (index: number) => acquired[index]! >= students[index]?.copies;
  const ceil = PYROXENE.PICKUP_TRIAL.ceil;

  // Hit probabilities per pull while a student is active; they change only when the active student
  // changes or another student finishes.
  const rates = { active: 0, otherStudents: [] as number[], otherProbabilities: [] as number[], total: 0 };
  const updateRates = (activeIndex: number) => {
    const active = students[activeIndex]?.recruitment;
    const activeTier = getRecruitmentStudentTier(active);
    rates.active = getPickupRecruitmentRate(active);
    rates.otherStudents.length = 0;
    rates.otherProbabilities.length = 0;
    rates.total = rates.active;
    if (activeTier !== 2 && activeTier !== 3) return;
    const poolCount = Math.max(1, getRecruitmentPoolCountByTier(event, activeTier) - 1);
    const spookProbability = Math.max(0, getRecruitmentTierSlotRate(active) - rates.active) / poolCount;
    if (spookProbability <= 0) return;
    for (let index = 0; index < studentCount; index += 1) {
      if (index === activeIndex || finished(index)) continue;
      if (getRecruitmentStudentTier(students[index]?.recruitment) !== activeTier) continue;
      rates.otherStudents.push(index);
      rates.otherProbabilities.push(spookProbability);
      rates.total += spookProbability;
    }
  };

  return sampleDistribution((random) => {
    acquired.fill(0);
    let remaining = targetCount;
    let pulls = 0;
    let activeIndex = -1;
    let ratesStale = true;

    for (;;) {
      if (remaining === 0) return pulls;
      if (mode === "with_pity" && Math.floor(pulls / ceil) >= remaining) return pulls;

      // Students are acquired in list order, so the earliest unfinished student holds the earliest copy.
      if (activeIndex === -1 || finished(activeIndex)) {
        activeIndex = -1;
        for (let index = 0; index < studentCount; index += 1) {
          if (finished(index)) continue;
          if (activeIndex === -1 || students[index]?.firstIndex < students[activeIndex]?.firstIndex) {
            activeIndex = index;
          }
        }
        ratesStale = true;
      }
      if (ratesStale) {
        updateRates(activeIndex);
        ratesStale = false;
      }

      const horizon = mode === "with_pity" ? ceil - (pulls % ceil) : Number.POSITIVE_INFINITY;
      const misses = sampleMissesBeforeHit(random, rates.total);
      if (misses >= horizon) {
        pulls += horizon;
        continue;
      }
      pulls += misses + 1;
      let roll = random() * rates.total - rates.active;
      let hitIndex = activeIndex;
      if (roll >= 0) {
        hitIndex = rates.otherStudents[rates.otherStudents.length - 1]!;
        for (let other = 0; other < rates.otherStudents.length; other += 1) {
          roll -= rates.otherProbabilities[other]!;
          if (roll < 0) {
            hitIndex = rates.otherStudents[other]!;
            break;
          }
        }
      }
      acquired[hitIndex]! += 1;
      remaining -= 1;
      if (finished(hitIndex)) ratesStale = true;
    }
  });
}

type PickupTrialDistributions = {
  // Pulls until every target copy is acquired, before free pulls and mileage tickets.
  gross: TrialDistribution;
  // Pulls paid with tickets or pyroxene.
  paid: TrialDistribution;
};

// Pull distributions for one event. Under the call charge rules each scope starts from its carried
// stack and earns its own mileage tickets; free pulls are subtracted from the combined total.
function getPickupTrialDistributions(
  event: PickupEvent,
  pickupRecruitments: PickupRecruitment[],
  mode: PickupTrialCostDistributionMode,
  stacks: RecruitmentStacks = EMPTY_RECRUITMENT_STACKS,
): PickupTrialDistributions {
  if (pickupRecruitments.length === 0) {
    return { gross: [1], paid: [1] };
  }

  const cacheKey = getPickupTrialCostDistributionCacheKey(event, pickupRecruitments, mode, stacks);
  const cached = pickupTrialCostDistributionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (event.recruitmentRuleSet === "call_charge_v1") {
    let gross: TrialDistribution = [1];
    let paid: TrialDistribution = [1];
    let hasScopedTargets = false;
    for (const [scope, scopeRecruitments] of groupTargetsByChargeScope(pickupRecruitments)) {
      if (scope === null) {
        continue;
      }
      hasScopedTargets = true;
      const pulls =
        mode === "with_pity"
          ? simulateCallChargeScope(event, scopeRecruitments, stacks[scope])
          : simulatePickupTrialDistribution(event, scopeRecruitments, "without_pity");
      gross = convolvePullCostDistributions(gross, pulls);
      paid = convolvePullCostDistributions(paid, applyRecruitmentFunding(pulls, { recruitmentPerks: true }));
    }
    if (hasScopedTargets) {
      paid = applyRecruitmentFunding(paid, { freePulls: getFreeRecruitmentPulls(event) });
    }

    const excludedRecruitments = pickupRecruitments.filter(
      (recruitment) => getRecruitmentChargeScope(recruitment.recruitmentType) === null,
    );
    if (excludedRecruitments.length > 0) {
      const excluded = getPickupTrialDistributions(
        { ...event, recruitmentRuleSet: "legacy_points", tags: withoutFreeRecruitmentTags(event.tags) },
        excludedRecruitments,
        mode,
      );
      gross = convolvePullCostDistributions(gross, excluded.gross);
      paid = convolvePullCostDistributions(paid, excluded.paid);
    }
    const distributions = { gross, paid };
    cachePickupTrialCostDistribution(cacheKey, distributions);
    return distributions;
  }

  const gross = simulatePickupTrialDistribution(event, pickupRecruitments, mode);
  const freePulls = getFreeRecruitmentPulls(event);
  let paid = gross;
  if (freePulls > 0) {
    paid = [];
    for (let trials = 0; trials < gross.length; trials++) {
      addTrialProbability(paid, subtractFreeRecruitmentTrial(trials, freePulls), gross[trials] ?? 0);
    }
  }
  const distributions = { gross, paid };
  cachePickupTrialCostDistribution(cacheKey, distributions);
  return distributions;
}

function cachePickupTrialCostDistribution(cacheKey: string, distributions: PickupTrialDistributions) {
  if (pickupTrialCostDistributionCache.size >= MAX_PICKUP_TRIAL_COST_DISTRIBUTION_CACHE_SIZE) {
    pickupTrialCostDistributionCache.clear();
  }
  pickupTrialCostDistributionCache.set(cacheKey, distributions);
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

function getScheduleItemEventStartTime(item: PyroxeneScheduleItem): number {
  return item.event ? dayjs(item.event.since).valueOf() : Number.NEGATIVE_INFINITY;
}

/** Repeats each pickup recruitment once per copy its target tier needs; ★2 students always need one copy. */
export function expandPickupTargetCopies(
  pickupRecruitments: PickupRecruitment[],
  targetTiers: RecruitmentTargetTiers | undefined,
): PickupRecruitment[] {
  return pickupRecruitments.flatMap((recruitment) => {
    const studentUid = recruitment.student?.uid;
    const targetTier = (studentUid && targetTiers?.[studentUid]) || DEFAULT_RECRUITMENT_TARGET_TIER;
    const copies = getRecruitmentStudentTier(recruitment) === 3 ? getRecruitmentTargetCopies(targetTier) : 1;
    return Array.from({ length: copies }, () => recruitment);
  });
}

export type TimelinePickupBasis = PyroxenePickupChance | "manual";

export type TimelinePickupStack = { scope: RecruitmentChargeScope; before: number; after: number };

/** How a pickup event's pulls were planned, for display next to its resource change. */
export type TimelinePickupPlan = {
  basis: TimelinePickupBasis;
  // True when the event uses its own basis instead of the planner default.
  basisOverridden: boolean;
  // Planned pulls before free pulls and mileage tickets.
  pulls: number;
  // 10th to 90th percentile of the pulls, for automatic bases with a distribution.
  pullRange?: { low: number; high: number };
  // Free pulls the plan uses.
  freePulls: number;
  // Call charge stacks of the scopes this event's targets belong to, before and after the event.
  stacks: TimelinePickupStack[];
};

type EventPickupTrial = {
  pickupTrial: number;
  pickupTrialCostDistribution?: TrialDistribution;
  plan: TimelinePickupPlan;
};

// Splits a manual pull count across scopes in proportion to the target copies each scope needs.
function allocateManualPulls(
  manualPulls: number,
  groups: Map<RecruitmentChargeScope | null, PickupRecruitment[]>,
): Map<RecruitmentChargeScope | null, number> {
  const totalCopies = [...groups.values()].reduce((sum, group) => sum + group.length, 0);
  const allocation = new Map<RecruitmentChargeScope | null, number>();
  let allocated = 0;
  const entries = [...groups.entries()];
  entries.forEach(([scope, group], index) => {
    const pulls =
      index === entries.length - 1 ? manualPulls - allocated : Math.floor((manualPulls * group.length) / totalCopies);
    allocation.set(scope, pulls);
    allocated += pulls;
  });
  return allocation;
}

/**
 * Paid pulls planned for one event and, for automatic bases, their distribution. Updates the carried
 * stacks: an automatic basis assumes every target is acquired (stack 0), while a manual count assumes
 * the targets are not acquired and carries the whole count over.
 */
function resolveEventPickupTrial(
  event: PickupEvent,
  targets: PickupRecruitment[],
  eventData: PyroxeneTimelineEventData | undefined,
  defaultPickupChance: PyroxenePickupChance,
  stacks: RecruitmentStacks,
): EventPickupTrial {
  const isCallCharge = event.recruitmentRuleSet === "call_charge_v1";
  const groups = groupTargetsByChargeScope(targets);
  const scopedGroups = isCallCharge
    ? [...groups.entries()].filter((entry): entry is [RecruitmentChargeScope, PickupRecruitment[]] => entry[0] !== null)
    : [];
  const excludedCopyCount = isCallCharge ? (groups.get(null)?.length ?? 0) : targets.length;
  const freePulls = getFreeRecruitmentPulls(event);
  const startStacks: RecruitmentStacks = { ...stacks };
  const plan = (
    basis: TimelinePickupBasis,
    pulls: number,
    pullRange?: TimelinePickupPlan["pullRange"],
  ): TimelinePickupPlan => ({
    basis,
    basisOverridden: basis === "manual" || basis !== defaultPickupChance,
    pulls,
    pullRange,
    freePulls: Math.min(freePulls, pulls),
    stacks: scopedGroups.map(([scope]) => ({ scope, before: startStacks[scope], after: stacks[scope] })),
  });

  const manualPulls = eventData?.expectedTrials ?? null;
  if (manualPulls !== null) {
    if (!isCallCharge) {
      return {
        pickupTrial: subtractFreeRecruitmentTrial(manualPulls, freePulls),
        plan: plan("manual", manualPulls),
      };
    }
    const allocation = allocateManualPulls(manualPulls, groups);
    let scopedPaidPulls = 0;
    for (const [scope] of scopedGroups) {
      const pulls = allocation.get(scope) ?? 0;
      scopedPaidPulls += getFundedRecruitmentPulls(pulls, { recruitmentPerks: true });
      stacks[scope] = normalizeRecruitmentCharge(stacks[scope] + pulls);
    }
    const scopedPulls = scopedGroups.length > 0 ? Math.max(0, scopedPaidPulls - freePulls) : 0;
    return { pickupTrial: scopedPulls + (allocation.get(null) ?? 0), plan: plan("manual", manualPulls) };
  }

  for (const [scope] of scopedGroups) {
    stacks[scope] = 0;
  }

  const pickupChance = eventData?.pickupChance ?? defaultPickupChance;
  const ceil = PYROXENE.PICKUP_TRIAL.ceil;
  if (pickupChance === "ceil") {
    if (!isCallCharge) {
      const pulls = targets.length * ceil;
      return { pickupTrial: subtractFreeRecruitmentTrial(pulls, freePulls), plan: plan("ceil", pulls) };
    }
    let scopedPulls = 0;
    let scopedPaidPulls = 0;
    for (const [scope, group] of scopedGroups) {
      const pulls = Math.max(0, group.length * ceil - startStacks[scope]);
      scopedPulls += pulls;
      scopedPaidPulls += getFundedRecruitmentPulls(pulls, { recruitmentPerks: true });
    }
    const paidScopedPulls = scopedGroups.length > 0 ? Math.max(0, scopedPaidPulls - freePulls) : 0;
    return {
      pickupTrial: paidScopedPulls + excludedCopyCount * ceil,
      plan: plan("ceil", scopedPulls + excludedCopyCount * ceil),
    };
  }

  const distributions = getPickupTrialDistributions(
    event,
    targets,
    pickupChance === "average" ? "without_pity" : "with_pity",
    startStacks,
  );
  const pullRange = {
    low: getTrialQuantile(distributions.gross, PICKUP_TRIAL_BAND_QUANTILE.pessimistic),
    high: getTrialQuantile(distributions.gross, PICKUP_TRIAL_BAND_QUANTILE.optimistic),
  };
  if (pickupChance === "average_pity" || scopedGroups.length > 0) {
    return {
      pickupTrial: Math.round(calculateExpectedTrial(distributions.paid)),
      pickupTrialCostDistribution: distributions.paid,
      plan: plan(pickupChance, Math.round(calculateExpectedTrial(distributions.gross)), pullRange),
    };
  }
  const averagePulls = targets.length * PYROXENE.PICKUP_TRIAL.average;
  return {
    pickupTrial: isCallCharge ? averagePulls : subtractFreeRecruitmentTrial(averagePulls, freePulls),
    pickupTrialCostDistribution: distributions.paid,
    plan: plan(pickupChance, averagePulls, pullRange),
  };
}

// The free recruit count usable for the event, or 0 when it has none or any recruitment has no future end.
export function getFreeRecruitmentPulls(event: NonNullable<PyroxeneScheduleItem["event"]>, now = dayjs()): number {
  const freePulls = getTaggedFreeRecruitmentPulls(event.tags);
  const open = event.recruitments.every(({ until }) => until !== null && dayjs(until).isAfter(now));
  return open ? freePulls : 0;
}

export function buildTimeline(
  initialResources: PickupResources,
  initialDate: Date,
  eventDataMap: Map<string, PyroxeneTimelineEventData>,
  scheduleItems: PyroxeneScheduleItem[],
  options: PyroxeneCalculationOptions,
  bandMode: PyroxeneTimelineBandMode = "central_ticket_discount",
  collectedSourceKeys: string[] = [],
  endDate?: Date,
  initialRecruitmentStacks: RecruitmentStacks = EMPTY_RECRUITMENT_STACKS,
): Timeline {
  const collectedSources = new Set(collectedSourceKeys);
  // Call charge stacks carried between events of the same scope, in event start order.
  const stacks: RecruitmentStacks = {
    regular: normalizeRecruitmentCharge(initialRecruitmentStacks.regular),
    limited: normalizeRecruitmentCharge(initialRecruitmentStacks.limited),
  };
  const scheduleMaxDate = scheduleItems.reduce((max, item) => {
    if (!item.event) {
      return max;
    }
    const eventUntil = dayjs(item.event.until);
    return max.isAfter(eventUntil) ? max : eventUntil;
  }, dayjs(initialDate));
  const maxDate = endDate ? dayjs(endDate) : scheduleMaxDate;

  const timelineDeltas: TimelineDelta[] = [];
  // Stacks carry over in event start order, so events are visited chronologically.
  const orderedScheduleItems = [...scheduleItems].sort(
    (left, right) => getScheduleItemEventStartTime(left) - getScheduleItemEventStartTime(right),
  );
  for (const scheduleItem of orderedScheduleItems) {
    if (scheduleItem.event) {
      const { event } = scheduleItem;

      // 보상 청휘석은 픽업 완료 여부와 무관하게 콘텐츠별 보상 시점에 수급됩니다.
      if (event.earnablePyroxene) {
        const collectedSourceKey = collectedSourceKeyForEventReward(event.uid);
        timelineDeltas.push({
          date: dayjs(event.rewardAt ?? event.until),
          source: { type: "event_reward", uid: event.uid, description: event.name, collectedSourceKey },
          resourceDelta: collectedSources.has(collectedSourceKey)
            ? zeroResources()
            : { pyroxene: event.earnablePyroxene, oneTimeTicket: 0, tenTimeTicket: 0 },
        });
      }

      const pickupRecruitments = event.recruitments.filter(
        ({ pickup, favorited, recruitmentType }) => pickup && favorited && recruitmentType !== "given",
      );
      if (pickupRecruitments.length === 0) {
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

      const pickup = resolveEventPickupTrial(
        event,
        expandPickupTargetCopies(pickupRecruitments, eventData?.targetTiers),
        eventData,
        options.event.pickupChance,
        // Events that already ended before the start date neither consume nor move the stacks.
        dayjs(event.until).isAfter(initialDate) ? stacks : { ...stacks },
      );
      timelineDeltas.push({
        date: dayjs(event.since),
        source: { type: "event", event },
        pickupTrial: pickup.pickupTrial,
        pickupTrialCostDistribution: pickup.pickupTrialCostDistribution,
        pickupPlan: pickup.plan,
      });
    } else if (scheduleItem.raid) {
      const { raid } = scheduleItem;
      const rewardAt = getRaidRewardDate(raid.until);
      const raidSource = {
        type: "raid" as const,
        uid: raid.uid,
      };
      if (raid.type === "total_assault") {
        const tierReward = PYROXENE.RAID_TOTAL_ASSAULT_TIER[options.raid.tier];
        timelineDeltas.push({
          date: rewardAt,
          source: { ...raidSource, description: `총력전 ${raid.name}` },
          resourceDelta: {
            pyroxene: PYROXENE.RAID_TOTAL_ASSAULT_BASE + tierReward,
            oneTimeTicket: 0,
            tenTimeTicket: 0,
          },
        });
      } else if (raid.type === "elimination") {
        const ticketLotId = `${raid.uid}::ten-time-ticket`;
        const ticketExpiresAt = getEliminationTicketExpiresAt(rewardAt);
        timelineDeltas.push({
          date: rewardAt,
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
  let dailyEntryCount = 0;
  for (
    let date = dateFrom;
    date.isBefore(maxDate) && dailyEntryCount < MAX_REPEATED_ENTRIES;
    date = date.add(1, "day")
  ) {
    dailyEntryCount++;
    const dailyApChargePyroxene = calculateDailyApChargePyroxene(
      getPyroxeneApChargeCountForDate(date.toDate(), options.consumption),
    );
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
  const endDateDayjs = endDate ? dayjs(endDate) : null;
  const filteredDeltas = timelineDeltas.filter((delta) => {
    if (endDateDayjs && delta.date.isAfter(endDateDayjs)) {
      return false;
    }
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
  const shouldBuildProbabilityBand = filteredDeltas.some((delta) => delta.pickupTrialCostDistribution !== undefined);
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
      ...(delta.pickupPlan ? { pickupPlan: delta.pickupPlan } : {}),
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
