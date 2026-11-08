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
const MAX_TARGETS_PER_PERIOD = 30;

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

type SlotOutcome = {
  acquiredBit: number;
  activePickup: boolean;
  probability: number;
};

function allTargetsMask(targetCount: number): number {
  return targetCount === 0 ? 0 : 2 ** targetCount - 1;
}

function firstUnacquiredTargetIndex(acquiredMask: number, targetCount: number): number {
  for (let index = 0; index < targetCount; index += 1) {
    if ((acquiredMask & (1 << index)) === 0) return index;
  }
  return targetCount;
}

function targetTier(target: RecruitmentCostTarget): 2 | 3 {
  return target.initialTier === 2 ? 2 : 3;
}

function directPickupRate(target: RecruitmentCostTarget): number {
  return targetTier(target) === 2 ? 0.03 : 0.007;
}

function tier3SlotRate(activeTarget: RecruitmentCostTarget): number {
  return activeTarget.recruitmentType === "fes" ? 0.06 : 0.03;
}

function tierSlotRate(activeTarget: RecruitmentCostTarget, tier: 2 | 3, slotIndex: number): number {
  if (tier === 3) return tier3SlotRate(activeTarget);
  return slotIndex === PULLS_PER_BATCH - 1 ? 1 - tier3SlotRate(activeTarget) : 0.185;
}

function poolCount(period: RecruitmentCostPeriod, tier: 2 | 3): number {
  return tier === 2 ? period.tier2PoolCount : period.tier3PoolCount;
}

function mergeSlotOutcome(outcomes: Map<string, SlotOutcome>, outcome: SlotOutcome) {
  if (outcome.probability <= MIN_PROBABILITY) return;
  const key = `${outcome.acquiredBit}:${outcome.activePickup ? 1 : 0}`;
  const existing = outcomes.get(key);
  if (existing) existing.probability += outcome.probability;
  else outcomes.set(key, outcome);
}

function targetStudentKey(target: RecruitmentCostTarget): string {
  return target.studentKey ?? target.key;
}

type OtherStudentSlot = {
  target: RecruitmentCostTarget;
  // Bit of the student's next copy, or 0 when every copy is already acquired.
  acquiredBit: number;
};

// One entry per other student; copies of a student are acquired in list order.
function otherStudentSlots(
  period: RecruitmentCostPeriod,
  acquiredMask: number,
  activeTargetIndex: number,
): OtherStudentSlot[] {
  const seen = new Set<string>([targetStudentKey(period.targets[activeTargetIndex]!)]);
  const slots: OtherStudentSlot[] = [];
  for (let index = 0; index < period.targets.length; index += 1) {
    const target = period.targets[index]!;
    const studentKey = targetStudentKey(target);
    if (seen.has(studentKey)) continue;
    seen.add(studentKey);
    let acquiredBit = 0;
    for (let copyIndex = index; copyIndex < period.targets.length; copyIndex += 1) {
      if (targetStudentKey(period.targets[copyIndex]!) === studentKey && (acquiredMask & (1 << copyIndex)) === 0) {
        acquiredBit = 1 << copyIndex;
        break;
      }
    }
    slots.push({ target, acquiredBit });
  }
  return slots;
}

function normalSlotOutcomes(
  period: RecruitmentCostPeriod,
  acquiredMask: number,
  activeTargetIndex: number,
  slotIndex: number,
): SlotOutcome[] {
  const activeTarget = period.targets[activeTargetIndex];
  if (!activeTarget) return [{ acquiredBit: 0, activePickup: false, probability: 1 }];

  const outcomes = new Map<string, SlotOutcome>();
  const activeTier = targetTier(activeTarget);
  const activeProbability = directPickupRate(activeTarget);
  mergeSlotOutcome(outcomes, {
    acquiredBit: 1 << activeTargetIndex,
    activePickup: true,
    probability: activeProbability,
  });

  for (const { target: otherTarget, acquiredBit } of otherStudentSlots(period, acquiredMask, activeTargetIndex)) {
    const otherTier = targetTier(otherTarget);
    const availablePoolCount = Math.max(1, poolCount(period, otherTier) - (otherTier === activeTier ? 1 : 0));
    const offRate = Math.max(
      0,
      tierSlotRate(activeTarget, otherTier, slotIndex) - (otherTier === activeTier ? activeProbability : 0),
    );
    mergeSlotOutcome(outcomes, {
      acquiredBit,
      activePickup: false,
      probability: offRate / availablePoolCount,
    });
  }

  const hitProbability = [...outcomes.values()].reduce((sum, outcome) => sum + outcome.probability, 0);
  mergeSlotOutcome(outcomes, {
    acquiredBit: 0,
    activePickup: false,
    probability: Math.max(0, 1 - hitProbability),
  });
  return [...outcomes.values()];
}

function midpointSlotOutcomes(
  period: RecruitmentCostPeriod,
  acquiredMask: number,
  activeTargetIndex: number,
): SlotOutcome[] {
  const activeTarget = period.targets[activeTargetIndex];
  if (!activeTarget) return [{ acquiredBit: 0, activePickup: false, probability: 1 }];

  const outcomes = new Map<string, SlotOutcome>();
  mergeSlotOutcome(outcomes, {
    acquiredBit: 1 << activeTargetIndex,
    activePickup: true,
    probability: 0.5,
  });

  const activeTier = targetTier(activeTarget);
  const availableTier3Count = Math.max(1, period.tier3PoolCount - (activeTier === 3 ? 1 : 0));
  for (const { target, acquiredBit } of otherStudentSlots(period, acquiredMask, activeTargetIndex)) {
    if (targetTier(target) !== 3) continue;
    mergeSlotOutcome(outcomes, {
      acquiredBit,
      activePickup: false,
      probability: 0.5 / availableTier3Count,
    });
  }

  const hitProbability = [...outcomes.values()].reduce((sum, outcome) => sum + outcome.probability, 0);
  mergeSlotOutcome(outcomes, {
    acquiredBit: 0,
    activePickup: false,
    probability: Math.max(0, 1 - hitProbability),
  });
  return [...outcomes.values()];
}

function ceilingSlotOutcomes(activeTargetIndex: number): SlotOutcome[] {
  return [{ acquiredBit: 1 << activeTargetIndex, activePickup: true, probability: 1 }];
}

// Slot outcomes depend only on the acquired copies, the active target, and the slot kind, so they are
// computed once per period; copies make the per-state recomputation otherwise dominate the DP.
const slotOutcomeCache = new WeakMap<RecruitmentCostPeriod, Map<string, SlotOutcome[]>>();

function cachedSlotOutcomes(
  period: RecruitmentCostPeriod,
  kind: "normal" | "normal-last" | "midpoint" | "ceiling",
  acquiredMask: number,
  activeTargetIndex: number,
): SlotOutcome[] {
  let cache = slotOutcomeCache.get(period);
  if (!cache) {
    cache = new Map();
    slotOutcomeCache.set(period, cache);
  }
  const key = `${kind}:${acquiredMask}:${activeTargetIndex}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const outcomes =
    kind === "ceiling"
      ? ceilingSlotOutcomes(activeTargetIndex)
      : kind === "midpoint"
        ? midpointSlotOutcomes(period, acquiredMask, activeTargetIndex)
        : normalSlotOutcomes(period, acquiredMask, activeTargetIndex, kind === "normal-last" ? PULLS_PER_BATCH - 1 : 0);
  cache.set(key, outcomes);
  return outcomes;
}

function runLegacyBatch(
  period: RecruitmentCostPeriod,
  acquiredMask: number,
  activeTargetIndex: number,
): Map<number, number> {
  let states = new Map<number, number>([[acquiredMask, 1]]);
  for (let slotIndex = 0; slotIndex < PULLS_PER_BATCH; slotIndex += 1) {
    const nextStates = new Map<number, number>();
    for (const [mask, probability] of states) {
      const kind = slotIndex === PULLS_PER_BATCH - 1 ? "normal-last" : "normal";
      for (const outcome of cachedSlotOutcomes(period, kind, mask, activeTargetIndex)) {
        const nextMask = mask | outcome.acquiredBit;
        nextStates.set(nextMask, (nextStates.get(nextMask) ?? 0) + probability * outcome.probability);
      }
    }
    states = nextStates;
  }
  return states;
}

function addDistributionProbability(distribution: PullCostDistribution, pulls: number, probability: number) {
  while (distribution.length <= pulls) distribution.push(0);
  distribution[pulls] = (distribution[pulls] ?? 0) + probability;
}

function validatePeriod(period: RecruitmentCostPeriod) {
  if (period.targets.length > MAX_TARGETS_PER_PERIOD) {
    throw new Error(`too many recruitment targets in one period: ${period.targets.length}`);
  }
  const keys = new Set(period.targets.map((target) => target.key));
  if (keys.size !== period.targets.length) {
    throw new Error(`duplicate recruitment target in period: ${period.uid}`);
  }
}

function simulateLegacyPeriod(period: RecruitmentCostPeriod): PullCostDistribution {
  const targetCount = period.targets.length;
  if (targetCount === 0) return [1];
  const finalMask = allTargetsMask(targetCount);
  const distribution: PullCostDistribution = [];
  let activeStates = new Map<number, number>([[0, 1]]);

  for (let pulls = PULLS_PER_BATCH; activeStates.size > 0; pulls += PULLS_PER_BATCH) {
    const nextStates = new Map<number, number>();
    for (const [acquiredMask, stateProbability] of activeStates) {
      const activeTargetIndex = firstUnacquiredTargetIndex(acquiredMask, targetCount);
      for (const [batchMask, batchProbability] of runLegacyBatch(period, acquiredMask, activeTargetIndex)) {
        let nextMask = batchMask;
        if (pulls % LEGACY_EXCHANGE_INTERVAL === 0 && nextMask !== finalMask) {
          const exchangeTargetIndex = firstUnacquiredTargetIndex(nextMask, targetCount);
          nextMask |= 1 << exchangeTargetIndex;
        }
        const probability = stateProbability * batchProbability;
        if (nextMask === finalMask) addDistributionProbability(distribution, pulls, probability);
        else nextStates.set(nextMask, (nextStates.get(nextMask) ?? 0) + probability);
      }
    }
    activeStates = nextStates;
  }

  return distribution;
}

// Dense DP over (acquired copies, charge). The active target is fixed for a whole ten-pull, so each
// batch tracks states per starting active target. Charge 200 always yields the active pickup, so a
// state never holds charge 200.
function simulateCallChargePeriod(period: RecruitmentCostPeriod, initialCharge: number): PullCostDistribution {
  const targetCount = period.targets.length;
  if (targetCount === 0) return [1];
  const finalMask = allTargetsMask(targetCount);
  const distribution: PullCostDistribution = [];
  let activeStates = new Map<number, Float64Array>();
  const initial = new Float64Array(CALL_CHARGE_CEILING);
  initial[initialCharge] = 1;
  activeStates.set(0, initial);

  for (let pulls = PULLS_PER_BATCH; activeStates.size > 0; pulls += PULLS_PER_BATCH) {
    const batchStates = new Map<number, Map<number, Float64Array>>();
    for (const [mask, charges] of activeStates) {
      const activeTargetIndex = firstUnacquiredTargetIndex(mask, targetCount);
      const group = batchStates.get(activeTargetIndex) ?? new Map<number, Float64Array>();
      const existing = group.get(mask);
      if (existing)
        for (let charge = 0; charge < CALL_CHARGE_CEILING; charge += 1) existing[charge] += charges[charge]!;
      else group.set(mask, charges);
      batchStates.set(activeTargetIndex, group);
    }

    const nextStates = new Map<number, Float64Array>();
    for (const [activeTargetIndex, startStates] of batchStates) {
      let states = startStates;
      for (let slotIndex = 0; slotIndex < PULLS_PER_BATCH; slotIndex += 1) {
        const slotStates = new Map<number, Float64Array>();
        const normalKind = slotIndex === PULLS_PER_BATCH - 1 ? "normal-last" : "normal";
        for (const [mask, charges] of states) {
          for (let charge = 0; charge < CALL_CHARGE_CEILING; charge += 1) {
            const probability = charges[charge]!;
            if (probability <= MIN_PROBABILITY) continue;
            const nextCharge = charge + 1;
            const kind =
              nextCharge === CALL_CHARGE_CEILING
                ? "ceiling"
                : nextCharge === CALL_CHARGE_MIDPOINT
                  ? "midpoint"
                  : normalKind;
            for (const outcome of cachedSlotOutcomes(period, kind, mask, activeTargetIndex)) {
              const nextMask = mask | outcome.acquiredBit;
              let target = slotStates.get(nextMask);
              if (!target) {
                target = new Float64Array(CALL_CHARGE_CEILING);
                slotStates.set(nextMask, target);
              }
              target[outcome.activePickup ? 0 : nextCharge] += probability * outcome.probability;
            }
          }
        }
        states = slotStates;
      }
      for (const [mask, charges] of states) {
        if (mask === finalMask) {
          const probability = charges.reduce((sum, value) => sum + value, 0);
          if (probability > MIN_PROBABILITY) addDistributionProbability(distribution, pulls, probability);
          continue;
        }
        const existing = nextStates.get(mask);
        if (existing)
          for (let charge = 0; charge < CALL_CHARGE_CEILING; charge += 1) existing[charge] += charges[charge]!;
        else nextStates.set(mask, charges);
      }
    }
    for (const [mask, charges] of nextStates) {
      if (charges.every((value) => value <= MIN_PROBABILITY)) nextStates.delete(mask);
    }
    activeStates = nextStates;
  }

  return distribution;
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
  return ruleSet === "call_charge_v1"
    ? simulateCallChargePeriod(period, normalizeRecruitmentCharge(initialCharge))
    : simulateLegacyPeriod(period);
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
