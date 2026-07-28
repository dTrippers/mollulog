import type { RecruitmentTypeEnum } from "~/graphql/graphql";

export type RecruitmentRuleSet = "legacy_points" | "call_charge_v1";

export const CALL_CHARGE_ANCHOR_TIMELINE_UID = "pandemonium-cruise";

export type RecruitmentCostTarget = {
  key: string;
  initialTier: number;
  recruitmentType: RecruitmentTypeEnum;
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
const MAX_TARGETS_PER_PERIOD = 20;

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

type BatchState = {
  acquiredMask: number;
  charge: number;
};

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

function normalSlotOutcomes(
  period: RecruitmentCostPeriod,
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

  for (let index = 0; index < period.targets.length; index += 1) {
    if (index === activeTargetIndex) continue;
    const otherTarget = period.targets[index];
    if (!otherTarget) continue;
    const otherTier = targetTier(otherTarget);
    const availablePoolCount = Math.max(1, poolCount(period, otherTier) - (otherTier === activeTier ? 1 : 0));
    const offRate = Math.max(
      0,
      tierSlotRate(activeTarget, otherTier, slotIndex) - (otherTier === activeTier ? activeProbability : 0),
    );
    mergeSlotOutcome(outcomes, {
      acquiredBit: 1 << index,
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

function midpointSlotOutcomes(period: RecruitmentCostPeriod, activeTargetIndex: number): SlotOutcome[] {
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
  for (let index = 0; index < period.targets.length; index += 1) {
    if (index === activeTargetIndex) continue;
    const target = period.targets[index];
    if (!target || targetTier(target) !== 3) continue;
    mergeSlotOutcome(outcomes, {
      acquiredBit: 1 << index,
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

function stateKey(state: BatchState): string {
  return `${state.acquiredMask}:${state.charge}`;
}

function mergeState(
  states: Map<string, { state: BatchState; probability: number }>,
  state: BatchState,
  probability: number,
) {
  if (probability <= MIN_PROBABILITY) return;
  const key = stateKey(state);
  const existing = states.get(key);
  if (existing) existing.probability += probability;
  else states.set(key, { state, probability });
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
      for (const outcome of normalSlotOutcomes(period, activeTargetIndex, slotIndex)) {
        const nextMask = mask | outcome.acquiredBit;
        nextStates.set(nextMask, (nextStates.get(nextMask) ?? 0) + probability * outcome.probability);
      }
    }
    states = nextStates;
  }
  return states;
}

function runCallChargeBatch(
  period: RecruitmentCostPeriod,
  initialState: BatchState,
  activeTargetIndex: number,
): Map<string, { state: BatchState; probability: number }> {
  let states = new Map<string, { state: BatchState; probability: number }>();
  mergeState(states, initialState, 1);

  for (let slotIndex = 0; slotIndex < PULLS_PER_BATCH; slotIndex += 1) {
    const nextStates = new Map<string, { state: BatchState; probability: number }>();
    for (const { state, probability } of states.values()) {
      const nextCharge = state.charge + 1;
      const outcomes =
        nextCharge === CALL_CHARGE_CEILING
          ? ceilingSlotOutcomes(activeTargetIndex)
          : nextCharge === CALL_CHARGE_MIDPOINT
            ? midpointSlotOutcomes(period, activeTargetIndex)
            : normalSlotOutcomes(period, activeTargetIndex, slotIndex);
      for (const outcome of outcomes) {
        mergeState(
          nextStates,
          {
            acquiredMask: state.acquiredMask | outcome.acquiredBit,
            charge: outcome.activePickup ? 0 : nextCharge,
          },
          probability * outcome.probability,
        );
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

function simulateCallChargePeriod(period: RecruitmentCostPeriod): PullCostDistribution {
  const targetCount = period.targets.length;
  if (targetCount === 0) return [1];
  const finalMask = allTargetsMask(targetCount);
  const distribution: PullCostDistribution = [];
  let activeStates = new Map<string, { state: BatchState; probability: number }>();
  mergeState(activeStates, { acquiredMask: 0, charge: 0 }, 1);

  for (let pulls = PULLS_PER_BATCH; activeStates.size > 0; pulls += PULLS_PER_BATCH) {
    const nextStates = new Map<string, { state: BatchState; probability: number }>();
    for (const { state, probability: stateProbability } of activeStates.values()) {
      const activeTargetIndex = firstUnacquiredTargetIndex(state.acquiredMask, targetCount);
      for (const { state: batchState, probability: batchProbability } of runCallChargeBatch(
        period,
        state,
        activeTargetIndex,
      ).values()) {
        const probability = stateProbability * batchProbability;
        if (batchState.acquiredMask === finalMask) addDistributionProbability(distribution, pulls, probability);
        else mergeState(nextStates, batchState, probability);
      }
    }
    activeStates = nextStates;
  }

  return distribution;
}

export function simulateRecruitmentCost(
  period: RecruitmentCostPeriod,
  ruleSet: RecruitmentRuleSet,
): PullCostDistribution {
  validatePeriod(period);
  return ruleSet === "call_charge_v1" ? simulateCallChargePeriod(period) : simulateLegacyPeriod(period);
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
