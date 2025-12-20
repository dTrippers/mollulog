import Decimal from "decimal.js";
import solver from "javascript-lp-solver";
import type { Stage } from "../types";
import type { StageInfo, OptimizationResult } from "./types";

/**
 * Calculates reward information for stages based on required target items.
 */
export function calculateStageInfos(
  stages: Stage[],
  enabledStages: Record<string, boolean>,
  appliedBonusRatio: Record<string, Decimal>,
  targets: [string, number][], // [uid, quantity]
): StageInfo[] {
  return stages.filter((stage) => enabledStages[stage.uid]).map((stage) => {
    const rewardPerItem: Record<string, Decimal> = {};
    for (const { item, rewardRequirement, amount } of stage.rewards) {
      if (!item || item.category !== "coin" || rewardRequirement !== null) {
        continue;
      }
      const bonusRatio = appliedBonusRatio[item.uid] ?? new Decimal(0);
      const perClear = new Decimal(amount).plus(bonusRatio.mul(amount).ceil());
      if (perClear.gt(0)) {
        rewardPerItem[item.uid] = perClear;
      }
    }
    const contributes = targets.length > 0 && targets.some(([uid]) => rewardPerItem[uid]?.gt(0));
    return {
      uid: stage.uid,
      name: stage.name,
      index: stage.index,
      entryAp: new Decimal(stage.entryAp),
      rewardPerItem,
      contributes,
    };
  });
}

/**
 * Optimizes stage runs to minimize AP while fulfilling target item requirements.
 * Uses Integer Linear Programming to find the optimal solution.
 */
export function optimizeStageRuns(
  stageInfos: StageInfo[],
  targets: [string, number][],
): OptimizationResult {
  const stageRuns: Record<string, number> = {};
  let totalAp = new Decimal(0);

  if (targets.length === 0) {
    return { stageRuns, totalAp };
  }

  // Find which items can actually be obtained from ANY enabled stage
  const obtainableItems = new Set<string>();
  for (const stage of stageInfos) {
    for (const uid of Object.keys(stage.rewardPerItem)) {
      obtainableItems.add(uid);
    }
  }

  // Filter targets to only include items that can be obtained from stages
  const obtainableTargets = targets.filter(([uid]) => obtainableItems.has(uid));
  if (obtainableTargets.length === 0) {
    // No targets can be obtained from stages, return empty result
    return { stageRuns, totalAp };
  }

  const contributingStages = stageInfos.filter((s) => s.contributes);
  if (contributingStages.length === 0) {
    return { stageRuns, totalAp };
  }

  // Build ILP model for javascript-lp-solver
  const model: {
    optimize: string;
    opType: "min" | "max";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints: Record<string, number>;
  } = {
    optimize: "totalAP",
    opType: "min",
    constraints: {},
    variables: {},
    ints: {},
  };

  // Add constraints for each item (minimum required quantity)
  for (const [uid, qty] of obtainableTargets) {
    model.constraints[`item_${uid}`] = { min: qty };
  }

  // Add variables for each contributing stage
  for (const stage of contributingStages) {
    const varName = `stage_${stage.uid}`;

    // Objective coefficient: AP cost per run
    model.variables[varName] = {
      totalAP: stage.entryAp.toNumber(),
    };

    // Constraint coefficients: reward per run for each item
    for (const [uid] of obtainableTargets) {
      const reward = stage.rewardPerItem[uid];
      if (reward && reward.gt(0)) {
        model.variables[varName][`item_${uid}`] = reward.toNumber();
      } else {
        // Stage doesn't provide this item, coefficient is 0
        model.variables[varName][`item_${uid}`] = 0;
      }
    }

    // Ensure runs are integers
    model.ints[varName] = 1;
  }

  // Solve the ILP problem
  try {
    const result = solver.Solve(model);
    if (!result.feasible) {
      return { stageRuns, totalAp };
    }

    // Extract stage runs from solution
    for (const stage of contributingStages) {
      const varName = `stage_${stage.uid}`;
      const runs = result[varName];
      if (typeof runs === "number" && runs > 0) {
        stageRuns[stage.uid] = Math.round(runs); // Ensure integer
        totalAp = totalAp.plus(stage.entryAp.mul(stageRuns[stage.uid]));
      }
    }
  } catch (error) {
    console.error("[optimizeStageRuns] Error solving ILP:", error);
    return { stageRuns, totalAp };
  }

  return { stageRuns, totalAp };
}
