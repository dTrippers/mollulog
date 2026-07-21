import Decimal from "decimal.js";
import { FIRST_CLEAR_REWARD_REQUIREMENT } from "~/domain/event-shop";
import type { ItemBreakdownInput, ItemBreakdownResult } from "./types";

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
  resourceLedger,
}: ItemBreakdownInput): ItemBreakdownResult {
  const fromFirstRun = { ...resourceLedger.fromFirstRun };
  const fromRepeatedRuns: Record<string, number> = {};
  const toPlayMinigame = { ...resourceLedger.requiredForMinigame };
  const toBuyShopItems = { ...resourceLedger.requiredForShopItems };
  const fromMinigame = { ...resourceLedger.fromMinigame };
  let extraAp = 0;
  let firstClearAp = 0;

  if (includeFirstClear) {
    for (const stage of stages) {
      const hasFirstClearReward = stage.rewards.some(
        ({ rewardRequirement }) => rewardRequirement === FIRST_CLEAR_REWARD_REQUIREMENT,
      );
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

    // Calculate items from repeated runs (excluding first-clear rewards)
    if (totalRuns > 0) {
      for (const { item, rewardRequirement, amount } of stage.rewards) {
        if (item?.category !== "coin" || rewardRequirement !== null) {
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

  const remaining: Record<string, number> = {};
  const allItemUids = new Set([
    ...Object.keys(resourceLedger.requiredTotals),
    ...Object.keys(resourceLedger.acquiredBeforeSweeps),
    ...Object.keys(fromRepeatedRuns),
  ]);
  for (const itemUid of allItemUids) {
    remaining[itemUid] =
      (resourceLedger.acquiredBeforeSweeps[itemUid] || 0) +
      (fromRepeatedRuns[itemUid] || 0) -
      (resourceLedger.requiredTotals[itemUid] || 0);
  }

  return {
    totalAp: calculatedTotalAp,
    firstClearAp,
    questSweepAp: calculatedTotalAp,
    extraSweepAp: extraAp,
    totalApWithExtras: firstClearAp + calculatedTotalAp + extraAp,
    itemBreakdown: {
      fromFirstRun,
      fromRepeatedRuns,
      existing: resourceLedger.existing,
      fromShop: resourceLedger.fromShop,
      toPlayMinigame,
      toBuyShopItems,
      fromMinigame,
      remaining,
    },
  };
}
