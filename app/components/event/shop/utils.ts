import type { MinigameConfig, RewardItem, DiceMinigameConfig, DivisorRoundCondition } from "./constants";

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
export function calculateMinigameRewards(config: MinigameConfig, playCount: number): RewardItem[] {
  if (playCount <= 0) {
    return [];
  }

  // For dice type, convert roll count to lap count
  let effectiveCount: number;
  if (config.minigameType === "dice" && config.dice) {
    effectiveCount = convertRollsToLaps(config.dice, playCount);
  } else {
    effectiveCount = playCount;
  }

  // Collect all explicitly specified rounds from all groups (excluding "subsequent" and divisor conditions)
  const allSpecifiedRounds = new Set<number>();
  for (const group of config.rewardGroups) {
    if (Array.isArray(group.rounds)) {
      for (const round of group.rounds) {
        allSpecifiedRounds.add(round);
      }
    }
  }

  // Merge rewards from all groups, combining same items
  const rewardMap = new Map<string, RewardItem>();

  const addRewards = (rewards: RewardItem[], multiplier: number) => {
    for (const reward of rewards) {
      const key = `${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`;
      if (rewardMap.has(key)) {
        rewardMap.get(key)!.quantity += reward.quantity * multiplier;
      } else {
        rewardMap.set(key, {
          ...reward,
          quantity: reward.quantity * multiplier,
        });
      }
    }
  };

  const isDivisorCondition = (rounds: unknown): rounds is DivisorRoundCondition =>
    typeof rounds === "object" && rounds !== null && "divisor" in rounds;

  // Process each reward group
  for (const group of config.rewardGroups) {
    let appliedCount = 0;

    if (group.rounds === "subsequent") {
      // Count rounds that are not explicitly specified in other groups
      // This includes all rounds from 1 to effectiveCount, minus the explicitly specified ones
      appliedCount = effectiveCount - Array.from(allSpecifiedRounds).filter((round) => round <= effectiveCount).length;
    } else if (isDivisorCondition(group.rounds)) {
      // Count rounds from 1 to effectiveCount where round % divisor is in remainders
      const { divisor, remainders } = group.rounds;
      const fullCycles = Math.floor(effectiveCount / divisor);
      const remainder = effectiveCount % divisor;
      appliedCount =
        fullCycles * remainders.length +
        remainders.filter((r) => r !== 0 && r <= remainder).length;
    } else {
      // Count how many of the specified rounds are <= effectiveCount
      appliedCount = group.rounds.filter((round) => round <= effectiveCount).length;
    }

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
      if (rewardMap.has(key)) {
        rewardMap.get(key)!.quantity += quantity;
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
export function calculateDiceMinigameStats(config: DiceMinigameConfig, rollCount: number): {
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
