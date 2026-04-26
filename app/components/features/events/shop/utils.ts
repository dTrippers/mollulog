import type {
  DiceMinigameConfig,
  DivisorRoundCondition,
  GteRoundCondition,
  MinigameConfig,
  MinigamePayment,
  MinigamePaymentQuantityMode,
  RewardGroup,
  RewardItem,
} from "./constants";

/**
 * Formats resource count labels with K/M suffixes for large numbers.
 * Shared utility used across multiple shop components.
 */
export function resourceCountLabel(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  }
  if (count >= 10000) {
    return `${(count / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
  }
  return count.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * Calculates minigame rewards based on play count and reward groups.
 * Each reward group specifies which rounds it applies to (specific rounds or "subsequent").
 * For dice type, playCount is treated as roll count and converted to lap count first.
 */
const isDivisorCondition = (rounds: unknown): rounds is DivisorRoundCondition =>
  typeof rounds === "object" && rounds !== null && "divisor" in rounds;

const isGteCondition = (rounds: unknown): rounds is GteRoundCondition =>
  typeof rounds === "object" && rounds !== null && "gte" in rounds;

function getEffectiveMinigameCount(config: MinigameConfig, playCount: number): number {
  if (config.minigameType === "dice" && config.dice) {
    return convertRollsToLaps(config.dice, playCount);
  }
  return playCount;
}

function getSpecifiedRounds(rewardGroups: RewardGroup[]): Set<number> {
  const allSpecifiedRounds = new Set<number>();
  for (const group of rewardGroups) {
    if (Array.isArray(group.rounds)) {
      for (const round of group.rounds) {
        allSpecifiedRounds.add(round);
      }
    }
  }
  return allSpecifiedRounds;
}

function getAppliedRoundCount(group: RewardGroup, effectiveCount: number, allSpecifiedRounds: Set<number>): number {
  if (group.rounds === "subsequent") {
    return effectiveCount - Array.from(allSpecifiedRounds).filter((round) => round <= effectiveCount).length;
  }
  if (isDivisorCondition(group.rounds)) {
    const { divisor, remainders } = group.rounds;
    const fullCycles = Math.floor(effectiveCount / divisor);
    const remainder = effectiveCount % divisor;
    return fullCycles * remainders.length + remainders.filter((r) => r !== 0 && r <= remainder).length;
  }
  if (isGteCondition(group.rounds)) {
    return Math.max(0, effectiveCount - group.rounds.gte + 1);
  }
  return group.rounds.filter((round) => round <= effectiveCount).length;
}

function matchesMinigameRound(group: RewardGroup, round: number, allSpecifiedRounds: Set<number>): boolean {
  if (group.rounds === "subsequent") {
    return !allSpecifiedRounds.has(round);
  }
  if (isDivisorCondition(group.rounds)) {
    return group.rounds.remainders.includes(round % group.rounds.divisor);
  }
  if (isGteCondition(group.rounds)) {
    return round >= group.rounds.gte;
  }
  return group.rounds.includes(round);
}

export function hasVariableMinigamePayment(config: MinigameConfig): boolean {
  return config.rewardGroups.some((group) => group.payments.some((payment) => payment.quantityVariable));
}

export function calculateMinigamePaymentCosts(
  config: MinigameConfig,
  playCount: number,
  quantityMode: MinigamePaymentQuantityMode = "expected",
): MinigamePayment[] {
  if (playCount <= 0) {
    return [];
  }

  const costMap = new Map<string, MinigamePayment>();
  const addCost = (payment: MinigamePayment, multiplier: number) => {
    const { resourceType, resourceUid, resourceName, quantity } = payment;
    const key = `${payment.resourceType}:${payment.resourceUid}`;
    const existing = costMap.get(key);
    if (existing) {
      existing.quantity += quantity * multiplier;
    } else {
      costMap.set(key, {
        resourceType,
        resourceUid,
        resourceName,
        quantity: quantity * multiplier,
      });
    }
  };

  const effectiveCount = getEffectiveMinigameCount(config, playCount);
  const specifiedRounds = getSpecifiedRounds(config.rewardGroups);
  let hasRoundPayments = false;

  if (config.minigameType === "box_gacha") {
    for (let round = 1; round <= playCount; round++) {
      const matchingGroup = config.rewardGroups.find(
        (group) => group.payments.length > 0 && matchesMinigameRound(group, round, specifiedRounds),
      );
      if (!matchingGroup) {
        continue;
      }

      hasRoundPayments = true;
      for (const payment of matchingGroup.payments) {
        const quantity =
          quantityMode === "min"
            ? payment.quantityMin
            : quantityMode === "max"
              ? payment.quantityMax
              : payment.quantityExpected;
        addCost({ ...payment, quantity }, 1);
      }
    }
  } else {
    for (const group of config.rewardGroups) {
      if (group.payments.length === 0) {
        continue;
      }

      const appliedCount = getAppliedRoundCount(group, effectiveCount, specifiedRounds);
      if (appliedCount <= 0) {
        continue;
      }

      hasRoundPayments = true;
      for (const payment of group.payments) {
        const quantity =
          quantityMode === "min"
            ? payment.quantityMin
            : quantityMode === "max"
              ? payment.quantityMax
              : payment.quantityExpected;
        addCost({ ...payment, quantity }, appliedCount);
      }
    }
  }

  if (!hasRoundPayments) {
    for (const payment of config.payments.length > 0 ? config.payments : [config.payment]) {
      addCost(payment, playCount);
    }
  }

  return Array.from(costMap.values());
}

export function calculateMinigameRewards(config: MinigameConfig, playCount: number): RewardItem[] {
  if (playCount <= 0) {
    return [];
  }

  // box_gacha: playCount = 총 플레이 횟수. 1~playCount 회차의 보상을 누적 합산.
  // exact 그룹은 해당 회차 1번, gte 그룹은 조건을 만족하는 각 회차마다 1번씩 적용.
  if (config.minigameType === "box_gacha") {
    const rewardMap = new Map<string, RewardItem>();
    for (let round = 1; round <= playCount; round++) {
      const matchingGroup = config.rewardGroups.find((group) => {
        if (Array.isArray(group.rounds)) return group.rounds.includes(round);
        if (isGteCondition(group.rounds)) return round >= group.rounds.gte;
        return false;
      });
      if (!matchingGroup) continue;
      for (const reward of matchingGroup.rewards) {
        const key = `${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`;
        const existing = rewardMap.get(key);
        if (existing) {
          existing.quantity += reward.quantity;
        } else {
          rewardMap.set(key, { ...reward });
        }
      }
    }
    return Array.from(rewardMap.values());
  }

  const effectiveCount = getEffectiveMinigameCount(config, playCount);

  // Collect all explicitly specified rounds from all groups (excluding "subsequent" and divisor conditions)
  const allSpecifiedRounds = getSpecifiedRounds(config.rewardGroups);

  // Merge rewards from all groups, combining same items
  const rewardMap = new Map<string, RewardItem>();

  const addRewards = (rewards: RewardItem[], multiplier: number) => {
    for (const reward of rewards) {
      const key = `${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`;
      const existingReward = rewardMap.get(key);
      if (existingReward) {
        existingReward.quantity += reward.quantity * multiplier;
      } else {
        rewardMap.set(key, {
          ...reward,
          quantity: reward.quantity * multiplier,
        });
      }
    }
  };

  // Process each reward group
  for (const group of config.rewardGroups) {
    let appliedCount = 0;

    appliedCount = getAppliedRoundCount(group, effectiveCount, allSpecifiedRounds);

    if (appliedCount > 0) {
      addRewards(group.rewards, appliedCount);
    }
  }

  // For dice type, add race node rewards (발판 보상)
  if (config.minigameType === "dice" && config.dice?.nodeRewards && playCount > 0) {
    // 각 발판의 보상 * 지나가는 횟수 = (보상 수량 * 주사위 굴림 횟수) / 발판 수
    const passesPerNode = playCount / config.dice.tiles;
    for (const reward of config.dice.nodeRewards) {
      const key = `${reward.resourceType}:${reward.resourceUid}:`;
      const quantity = Math.floor(reward.quantity * passesPerNode);
      const existingReward = rewardMap.get(key);
      if (existingReward) {
        existingReward.quantity += quantity;
      } else {
        rewardMap.set(key, {
          resourceType: reward.resourceType,
          resourceUid: reward.resourceUid,
          quantity,
        });
      }
    }
  }

  return Array.from(rewardMap.values());
}

/**
 * Calculates dice minigame statistics based on roll count.
 * Uses average dice value to estimate laps completed.
 */
export function calculateDiceMinigameStats(
  config: DiceMinigameConfig,
  rollCount: number,
): {
  totalCost: number;
  estimatedLaps: number;
  rollsPerLap: number;
  rollsPerLapWithBonus: number;
} {
  const avgDice = (config.diceMin + config.diceMax) / 2;
  const rollsPerLap = config.tiles / avgDice;
  const rollsPerLapWithBonus = rollsPerLap - 1;

  // 확정권이 지급되는 바퀴까지 필요한 주사위 던지기 횟수
  const rollsForBonusLaps = config.bonusRollUntilLap * rollsPerLapWithBonus;
  let estimatedLaps: number;
  if (rollCount <= rollsForBonusLaps) {
    // 확정권이 지급되는 바퀴 범위: 확정권 있음
    estimatedLaps = rollCount / rollsPerLapWithBonus;
  } else {
    // 확정권이 지급되지 않는 바퀴 이후: 확정권 없음
    estimatedLaps = config.bonusRollUntilLap + (rollCount - rollsForBonusLaps) / rollsPerLap;
  }

  return {
    totalCost: rollCount, // 실제 비용은 payment.quantity와 곱해야 함
    estimatedLaps,
    rollsPerLap,
    rollsPerLapWithBonus,
  };
}

/**
 * Converts roll count to lap count for dice minigame.
 */
export function convertRollsToLaps(config: DiceMinigameConfig, rollCount: number): number {
  const stats = calculateDiceMinigameStats(config, rollCount);
  return stats.estimatedLaps;
}
