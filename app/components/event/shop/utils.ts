import type { MinigameConfig, RewardItem } from "./constants";

/**
 * Formats resource count labels with K/M suffixes for large numbers.
 * Shared utility used across multiple shop components.
 */
export function resourceCountLabel(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toLocaleString()}M`;
  }
  if (count >= 10000) {
    return `${(count / 1000).toLocaleString()}K`;
  }
  return count.toLocaleString();
}

/**
 * Calculates minigame rewards based on play count and reward groups.
 * Each reward group specifies which rounds it applies to (specific rounds or "subsequent").
 */
export function calculateMinigameRewards(
  config: MinigameConfig,
  playCount: number,
): RewardItem[] {
  if (playCount <= 0) {
    return [];
  }

  // Collect all explicitly specified rounds from all groups (excluding "subsequent")
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

  // Process each reward group
  for (const group of config.rewardGroups) {
    let appliedCount = 0;

    if (group.rounds === "subsequent") {
      // Count rounds that are not explicitly specified in other groups
      // This includes all rounds from 1 to playCount, minus the explicitly specified ones
      appliedCount = playCount - Array.from(allSpecifiedRounds).filter((round) => round <= playCount).length;
    } else {
      // Count how many of the specified rounds are <= playCount
      appliedCount = group.rounds.filter((round) => round <= playCount).length;
    }

    if (appliedCount > 0) {
      addRewards(group.rewards, appliedCount);
    }
  }

  return Array.from(rewardMap.values());
}
