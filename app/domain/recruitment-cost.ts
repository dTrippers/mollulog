import { type RandomSource, sampleDistribution, sampleMissesBeforeHit } from "~/domain/recruitment-sampling";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";

export type RecruitmentRuleSet = "legacy_points" | "call_charge_v1";

export const CALL_CHARGE_ANCHOR_TIMELINE_UID = "pandemonium-cruise";

export type RecruitmentCostTarget = {
  key: string;
  // Copies of one student share a studentKey; each copy is a separate target acquired in list order.
  studentKey?: string;
  initialTier: number;
  recruitmentType: RecruitmentTypeEnum;
};

export type RecruitmentCostSimulationOptions = {
  // Charge (stack) carried into this period from earlier periods of the same scope.
  initialCharge?: number;
};

export type RecruitmentCostPeriod = {
  uid: string;
  recruitmentType: RecruitmentTypeEnum;
  targets: RecruitmentCostTarget[];
  tier2PoolCount: number;
  tier3PoolCount: number;
};

export type PullCostDistribution = number[];

export type RecruitmentChargeScope = "regular" | "limited";

export type RecruitmentFundingOptions = {
  freePulls?: number;
  recruitmentPerks?: boolean;
};

export const RECRUITMENT_PERK_TEN_PULL_THRESHOLDS = [70, 130, 150, 170, 270, 330, 350, 370] as const;

const PULLS_PER_BATCH = 10;
const LEGACY_EXCHANGE_INTERVAL = 200;
const CALL_CHARGE_MIDPOINT = 100;
const CALL_CHARGE_CEILING = 200;
const MIN_PROBABILITY = 1e-14;

export function getRecruitmentChargeScope(recruitmentType: RecruitmentTypeEnum): RecruitmentChargeScope | null {
  if (recruitmentType === "usual") return "regular";
  if (["limited", "fes", "recollect", "encore"].includes(recruitmentType)) return "limited";
  return null;
}

export function splitRecruitmentCostPeriodByChargeScope(period: RecruitmentCostPeriod): RecruitmentCostPeriod[] {
  const targetsByScope = new Map<RecruitmentChargeScope, RecruitmentCostTarget[]>();
  for (const target of period.targets) {
    const scope = getRecruitmentChargeScope(target.recruitmentType);
    if (!scope) continue;
    const targets = targetsByScope.get(scope) ?? [];
    targets.push(target);
    targetsByScope.set(scope, targets);
  }

  return [...targetsByScope.entries()].map(([scope, targets]) => ({
    ...period,
    uid: `${period.uid}:${scope}`,
    recruitmentType: targets[0]?.recruitmentType ?? period.recruitmentType,
    targets,
  }));
}

export function getUsableRecruitmentPerkTenPullTicketCount(totalPulls: number): number {
  return RECRUITMENT_PERK_TEN_PULL_THRESHOLDS.filter((threshold) => totalPulls >= threshold + PULLS_PER_BATCH).length;
}

export function getFundedRecruitmentPulls(
  totalPulls: number,
  { freePulls = 0, recruitmentPerks = false }: RecruitmentFundingOptions = {},
): number {
  const normalizedTotalPulls = Math.max(0, totalPulls);
  const normalizedFreePulls = Math.max(0, freePulls);
  const perkPulls = recruitmentPerks
    ? getUsableRecruitmentPerkTenPullTicketCount(normalizedTotalPulls) * PULLS_PER_BATCH
    : 0;
  return Math.max(0, normalizedTotalPulls - normalizedFreePulls - perkPulls);
}

export function applyRecruitmentFunding(
  distribution: PullCostDistribution,
  options: RecruitmentFundingOptions,
): PullCostDistribution {
  const fundedDistribution: PullCostDistribution = [];
  for (let pulls = 0; pulls < distribution.length; pulls += 1) {
    const probability = distribution[pulls] ?? 0;
    if (probability <= MIN_PROBABILITY) continue;
    addDistributionProbability(fundedDistribution, getFundedRecruitmentPulls(pulls, options), probability);
  }
  return fundedDistribution;
}

function targetTier(target: RecruitmentCostTarget): 2 | 3 {
  return target.initialTier === 2 ? 2 : 3;
}

function directPickupRate(student: SampledStudent): number {
  return student.tier === 2 ? 0.03 : 0.007;
}

function tier3SlotRate(active: SampledStudent): number {
  return active.recruitmentType === "fes" ? 0.06 : 0.03;
}

function tierSlotRate(active: SampledStudent, tier: 2 | 3, lastSlot: boolean): number {
  if (tier === 3) return tier3SlotRate(active);
  return lastSlot ? 1 - tier3SlotRate(active) : 0.185;
}

function poolCount(period: RecruitmentCostPeriod, tier: 2 | 3): number {
  return tier === 2 ? period.tier2PoolCount : period.tier3PoolCount;
}

function addDistributionProbability(distribution: PullCostDistribution, pulls: number, probability: number) {
  while (distribution.length <= pulls) distribution.push(0);
  distribution[pulls] = (distribution[pulls] ?? 0) + probability;
}

function validatePeriod(period: RecruitmentCostPeriod) {
  const keys = new Set(period.targets.map((target) => target.key));
  if (keys.size !== period.targets.length) {
    throw new Error(`duplicate recruitment target in period: ${period.uid}`);
  }
}

// A student's copies share a studentKey and are acquired in list order.
type SampledStudent = {
  tier: 2 | 3;
  recruitmentType: RecruitmentTypeEnum;
  // Target-list positions of this student's copies; the active pickup is the earliest unacquired copy.
  copyIndices: number[];
};

function groupSampledStudents(period: RecruitmentCostPeriod): SampledStudent[] {
  const students = new Map<string, SampledStudent>();
  period.targets.forEach((target, index) => {
    const key = target.studentKey ?? target.key;
    const student = students.get(key);
    if (student) student.copyIndices.push(index);
    else
      students.set(key, {
        tier: targetTier(target),
        recruitmentType: target.recruitmentType,
        copyIndices: [index],
      });
  });
  return [...students.values()];
}

// Per-pull hit probabilities of an ordinary slot while one student is the active pickup. Other students
// are hit off-rate from their tier's pool; a hit on a finished student changes nothing, so only
// unfinished students are listed.
type SlotRates = {
  active: number;
  otherStudents: number[];
  otherProbabilities: number[];
  total: number;
};

function slotRates(
  period: RecruitmentCostPeriod,
  students: SampledStudent[],
  finished: (index: number) => boolean,
  activeIndex: number,
  lastSlot: boolean,
): SlotRates {
  const active = students[activeIndex]!;
  const activeRate = directPickupRate(active);
  const rates: SlotRates = { active: activeRate, otherStudents: [], otherProbabilities: [], total: activeRate };
  students.forEach((student, index) => {
    if (index === activeIndex || finished(index)) return;
    const sameTier = student.tier === active.tier;
    const availablePoolCount = Math.max(1, poolCount(period, student.tier) - (sameTier ? 1 : 0));
    const offRate = Math.max(0, tierSlotRate(active, student.tier, lastSlot) - (sameTier ? activeRate : 0));
    const probability = offRate / availablePoolCount;
    if (probability <= 0) return;
    rates.otherStudents.push(index);
    rates.otherProbabilities.push(probability);
    rates.total += probability;
  });
  return rates;
}

// Simulates ten-pull batches until every target copy is acquired. The active pickup is the earliest
// unacquired copy at the start of each ten-pull and stays fixed for the rest of it, so a run only
// finishes at a ten-pull boundary.
//
// call_charge_v1: the charge rises by one per pull; the 100th pull of a charge cycle is the active
// pickup with probability 1/2 (otherwise a ★3 off-rate student), the 200th always is, and an active
// pickup resets the charge. legacy_points: every 200 pulls exchange the earliest unacquired copy.
//
// Ordinary pulls between those events have fixed hit probabilities, so runs of misses are sampled
// at once instead of pull by pull.
function createRecruitmentPeriodRunner(
  period: RecruitmentCostPeriod,
  ruleSet: RecruitmentRuleSet,
  initialCharge: number,
): (random: RandomSource) => number {
  const callCharge = ruleSet === "call_charge_v1";
  const students = groupSampledStudents(period);
  const studentCount = students.length;
  const targetCount = period.targets.length;
  const acquired = new Int32Array(studentCount);
  const finished = (index: number) => acquired[index]! >= students[index]!.copyIndices.length;
  const otherTier3Probability = (active: SampledStudent) =>
    0.5 / Math.max(1, period.tier3PoolCount - (active.tier === 3 ? 1 : 0));

  // Rates depend only on the active student and which students are finished; they are recomputed
  // when either changes.
  let ratesStale = true;
  let normalRates: SlotRates | null = null;
  let lastSlotRates: SlotRates | null = null;
  let lastSlotMatters = false;

  return (random) => {
    acquired.fill(0);
    let remaining = targetCount;
    let pulls = 0;
    let charge = initialCharge;
    let activeIndex = -1;
    ratesStale = true;

    const earliestUnfinished = () => {
      let best = -1;
      let bestPosition = Number.POSITIVE_INFINITY;
      for (let index = 0; index < studentCount; index += 1) {
        if (finished(index)) continue;
        const position = students[index]!.copyIndices[acquired[index]!]!;
        if (position < bestPosition) {
          best = index;
          bestPosition = position;
        }
      }
      return best;
    };
    const acquire = (index: number) => {
      if (finished(index)) return;
      acquired[index]! += 1;
      remaining -= 1;
      if (finished(index)) ratesStale = true;
    };

    for (;;) {
      if (pulls % PULLS_PER_BATCH === 0) {
        if (!callCharge && pulls > 0 && pulls % LEGACY_EXCHANGE_INTERVAL === 0 && remaining > 0) {
          acquire(earliestUnfinished());
        }
        if (remaining === 0) return pulls;
        const nextActive = earliestUnfinished();
        if (nextActive !== activeIndex) {
          activeIndex = nextActive;
          ratesStale = true;
        }
      } else if (remaining === 0) {
        // Every copy is in; the rest of the ten-pull is still billed.
        return pulls + PULLS_PER_BATCH - (pulls % PULLS_PER_BATCH);
      }

      const nextCharge = charge + 1;
      if (callCharge && nextCharge === CALL_CHARGE_CEILING) {
        acquire(activeIndex);
        charge = 0;
        pulls += 1;
        continue;
      }
      if (callCharge && nextCharge === CALL_CHARGE_MIDPOINT) {
        pulls += 1;
        const roll = random();
        if (roll < 0.5) {
          acquire(activeIndex);
          charge = 0;
          continue;
        }
        charge = nextCharge;
        const active = students[activeIndex]!;
        const probability = otherTier3Probability(active);
        let threshold = 0.5;
        for (let index = 0; index < studentCount; index += 1) {
          if (index === activeIndex || students[index]!.tier !== 3) continue;
          threshold += probability;
          if (roll < threshold) {
            acquire(index);
            break;
          }
        }
        continue;
      }

      if (ratesStale) {
        normalRates = slotRates(period, students, finished, activeIndex, false);
        lastSlotMatters = students.some(
          (student, index) => index !== activeIndex && student.tier === 2 && !finished(index),
        );
        lastSlotRates = lastSlotMatters ? slotRates(period, students, finished, activeIndex, true) : normalRates;
        ratesStale = false;
      }

      // The stretch ends before the next charge midpoint or ceiling, at the next legacy exchange,
      // before a ten-pull's last slot when that slot changes ★2 rates, and at the end of the ten-pull
      // once the active student is finished (the next ten-pull picks a new one).
      const slot = pulls % PULLS_PER_BATCH;
      const lastSlot = lastSlotMatters && slot === PULLS_PER_BATCH - 1;
      let horizon = callCharge
        ? (nextCharge < CALL_CHARGE_MIDPOINT ? CALL_CHARGE_MIDPOINT : CALL_CHARGE_CEILING) - nextCharge
        : LEGACY_EXCHANGE_INTERVAL - (pulls % LEGACY_EXCHANGE_INTERVAL);
      if (lastSlot) horizon = 1;
      else if (lastSlotMatters) horizon = Math.min(horizon, PULLS_PER_BATCH - 1 - slot);
      if (finished(activeIndex)) horizon = Math.min(horizon, PULLS_PER_BATCH - slot);

      const rates = (lastSlot ? lastSlotRates : normalRates)!;
      const misses = sampleMissesBeforeHit(random, rates.total);
      if (misses >= horizon) {
        pulls += horizon;
        if (callCharge) charge += horizon;
        continue;
      }
      pulls += misses + 1;
      if (callCharge) charge += misses + 1;
      let roll = random() * rates.total - rates.active;
      if (roll < 0) {
        acquire(activeIndex);
        if (callCharge) charge = 0;
        continue;
      }
      let hit = rates.otherStudents.length - 1;
      for (let other = 0; other < rates.otherStudents.length; other += 1) {
        roll -= rates.otherProbabilities[other]!;
        if (roll < 0) {
          hit = other;
          break;
        }
      }
      acquire(rates.otherStudents[hit]!);
    }
  };
}

function simulateRecruitmentPeriod(
  period: RecruitmentCostPeriod,
  ruleSet: RecruitmentRuleSet,
  initialCharge: number,
): PullCostDistribution {
  if (period.targets.length === 0) return [1];
  return sampleDistribution(createRecruitmentPeriodRunner(period, ruleSet, initialCharge));
}

export function normalizeRecruitmentCharge(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value % CALL_CHARGE_CEILING : 0;
}

export function simulateRecruitmentCost(
  period: RecruitmentCostPeriod,
  ruleSet: RecruitmentRuleSet,
  { initialCharge = 0 }: RecruitmentCostSimulationOptions = {},
): PullCostDistribution {
  validatePeriod(period);
  return simulateRecruitmentPeriod(
    period,
    ruleSet,
    ruleSet === "call_charge_v1" ? normalizeRecruitmentCharge(initialCharge) : 0,
  );
}

export function convolvePullCostDistributions(
  left: PullCostDistribution,
  right: PullCostDistribution,
): PullCostDistribution {
  const distribution: PullCostDistribution = [];
  for (let leftPulls = 0; leftPulls < left.length; leftPulls += 1) {
    const leftProbability = left[leftPulls] ?? 0;
    if (leftProbability <= MIN_PROBABILITY) continue;
    for (let rightPulls = 0; rightPulls < right.length; rightPulls += 1) {
      const rightProbability = right[rightPulls] ?? 0;
      if (rightProbability <= MIN_PROBABILITY) continue;
      addDistributionProbability(distribution, leftPulls + rightPulls, leftProbability * rightProbability);
    }
  }
  return distribution;
}

export function getRecruitmentRuleSet(
  startAt: string | Date,
  callChargeAnchorStartAt: string | Date,
): RecruitmentRuleSet {
  return new Date(startAt).getTime() < new Date(callChargeAnchorStartAt).getTime() ? "legacy_points" : "call_charge_v1";
}
