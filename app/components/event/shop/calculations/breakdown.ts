import Decimal from "decimal.js";
import type { ItemBreakdownInput, ItemBreakdownResult } from "./types";
import { MINIGAME_CONFIG } from "../constants";
import { calculateMinigameRewards } from "../utils";

/**
 * Calculates the final breakdown of items and AP costs.
 */
export function calculateItemBreakdowns({
  stages,
  enabledStages,
  stageRuns,
  extraStageRuns,
  appliedBonusRatio,
  includeFirstClear,
  minigamePlayCount,
  eventUid,
  minigameRewards,
  shopResources,
  itemQuantities,
  collectableResources,
  minigamePaymentResource,
}: ItemBreakdownInput): ItemBreakdownResult {
  const fromFirstRun: Record<string, number> = {};
  const fromRepeatedRuns: Record<string, number> = {};
  const toPlayMinigame: Record<string, number> = {};
  const toBuyShopItems: Record<string, number> = {};
  const fromMinigame: Record<string, number> = {};
  let extraAp = 0;
  let firstClearAp = 0;

  // Calculate first_clear rewards for all stages (first clear is one-time, regardless of enabled status)
  if (includeFirstClear) {
    for (const stage of stages) {
      let hasFirstClearReward = false;
      for (const { item, rewardRequirement, amount } of stage.rewards) {
        if (!item || item.category !== "coin") {
          continue;
        }
        if (rewardRequirement === "first_clear") {
          fromFirstRun[item.uid] = (fromFirstRun[item.uid] || 0) + amount;
          hasFirstClearReward = true;
        } else if (stage.difficulty === 0) {  // story
          fromFirstRun[item.uid] = (fromFirstRun[item.uid] || 0) + amount;
        }
      }

      // Check if stage has any first_clear rewards (not just coin rewards)
      if (!hasFirstClearReward) {
        hasFirstClearReward = stage.rewards.some(({ rewardRequirement }) => rewardRequirement === "first_clear");
      }
      if (stage.difficulty === 0 || hasFirstClearReward) {
        firstClearAp += stage.entryAp;
      }
    }
  }

  // Calculate items from repeated stage runs (calculated + extra runs)
  let calculatedTotalAp = 0;
  for (const stage of stages) {
    if (!enabledStages[stage.uid]) {
      continue;
    }

    const calculatedRuns = stageRuns[stage.uid] || 0;
    const extraRuns = extraStageRuns[stage.uid] || 0;
    const totalRuns = calculatedRuns + extraRuns;

    // Add AP for calculated runs (approximation if not provided)
    // Actually we should rely on the input stageRuns and extraStageRuns to calculate total AP here?
    // The previous implementation had 'totalAp' coming from optimization, but here we recalculate or reuse?
    // Let's calculate total AP of repeated runs here strictly based on counts.
    if (calculatedRuns > 0) {
      calculatedTotalAp += calculatedRuns * stage.entryAp;
    }

    // Calculate extra AP
    if (extraRuns > 0) {
      extraAp += extraRuns * stage.entryAp;
    }

    // Calculate items from repeated runs (excluding first_clear)
    if (totalRuns > 0) {
      for (const { item, rewardRequirement, amount } of stage.rewards) {
        if (!item || item.category !== "coin" || rewardRequirement !== null) {
          continue;
        }

        const bonusRatio = appliedBonusRatio[item.uid] ?? new Decimal(0);
        // Base amount + bonus amount (merged)
        const perRunAmount = new Decimal(amount).plus(bonusRatio.mul(amount).ceil());
        const totalAmount = perRunAmount.mul(totalRuns).toNumber();
        fromRepeatedRuns[item.uid] = (fromRepeatedRuns[item.uid] || 0) + totalAmount;
      }
    }
  }

  // Calculate original requirement (before subtracting minigame rewards)
  // This is what we need to show in toBuyShopItems
  const originalRequirements: Record<string, number> = {};
  for (const { uid, forPayment } of collectableResources) {
    if (!forPayment) {
      continue;
    }

    const required = shopResources.reduce((total, { uid: shopResourceUid, paymentResourceAmount, paymentResource }) => {
      if (paymentResource.uid !== uid) {
        return total;
      }
      return total + ((itemQuantities[shopResourceUid] || 0) * paymentResourceAmount);
    }, 0);

    if (required > 0) {
      originalRequirements[uid] = required;
    }
  }

  // Calculate total collected (first run + repeated runs, before minigame)
  const totalCollected: Record<string, number> = {};
  const allItemUids = new Set([...Object.keys(fromFirstRun), ...Object.keys(fromRepeatedRuns)]);
  for (const itemUid of allItemUids) {
    totalCollected[itemUid] = (fromFirstRun[itemUid] || 0) + (fromRepeatedRuns[itemUid] || 0);
  }

  // Calculate items needed to play minigame (total required, not adjusted)
  if (minigamePaymentResource && minigamePlayCount > 0) {
    const { resourceUid, quantity } = minigamePaymentResource;
    toPlayMinigame[resourceUid] = minigamePlayCount * quantity;
  }

  // Calculate items to buy shop items using original requirement
  const remaining: Record<string, number> = {};
  for (const [paymentUid, originalRequired] of Object.entries(originalRequirements)) {
    if ((originalRequired || 0) > 0) {
      toBuyShopItems[paymentUid] = originalRequired;
    }
  }

  // Add minigame rewards
  const minigameConfig = MINIGAME_CONFIG[eventUid];
  if (minigameConfig && minigamePlayCount > 0) {
    const rewards = calculateMinigameRewards(minigameConfig, minigamePlayCount);
    for (const { resourceUid, quantity } of rewards) {
      totalCollected[resourceUid] = (totalCollected[resourceUid] || 0) + quantity;
      fromMinigame[resourceUid] = (fromMinigame[resourceUid] || 0) + quantity;
    }
  }

  // Calculate remaining items
  // For payment items: remaining = totalCollected (including minigame) - originalRequired
  // For non-payment items: remaining = totalCollected
  for (const [itemUid, amount] of Object.entries(totalCollected)) {
    const originalRequired = originalRequirements[itemUid] || 0;
    const remainingAmount = amount - originalRequired;
    if (originalRequired > 0 || remainingAmount !== 0) {
      remaining[itemUid] = remainingAmount;
    }
  }

  return {
    totalAp: calculatedTotalAp,
    firstClearAp,
    questSweepAp: calculatedTotalAp,
    extraSweepAp: extraAp,
    totalApWithExtras: firstClearAp + calculatedTotalAp + extraAp,
    collectedTotals: remaining,
    itemBreakdown: {
      fromFirstRun,
      fromRepeatedRuns,
      toPlayMinigame,
      toBuyShopItems,
      fromMinigame,
      remaining,
    },
  };
}

