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
      index: stage.index,
      entryAp: new Decimal(stage.entryAp),
      rewardPerItem,
      contributes,
    };
  });
}

/**
 * Check if the current stage runs satisfy all target constraints.
 */
function checkConstraintsSatisfied(
  stageRuns: Record<string, number>,
  stages: StageInfo[],
  targets: [string, number][],
): boolean {
  const collected: Record<string, number> = {};

  for (const stage of stages) {
    const runs = stageRuns[stage.uid] || 0;
    if (runs > 0) {
      for (const [uid, reward] of Object.entries(stage.rewardPerItem)) {
        collected[uid] = (collected[uid] || 0) + reward.toNumber() * runs;
      }
    }
  }

  for (const [uid, required] of targets) {
    if ((collected[uid] || 0) < required) {
      return false;
    }
  }
  return true;
}

/**
 * Calculate total AP for given stage runs.
 */
function calculateTotalAp(
  stageRuns: Record<string, number>,
  stages: StageInfo[],
): Decimal {
  let total = new Decimal(0);
  for (const stage of stages) {
    const runs = stageRuns[stage.uid] || 0;
    if (runs > 0) {
      total = total.plus(stage.entryAp.mul(runs));
    }
  }
  return total;
}

/**
 * Solve LP for a specific subset of stages, then apply local search.
 * Returns null if not feasible.
 */
function solveForSubset(
  stageSubset: StageInfo[],
  targets: [string, number][],
): { stageRuns: Record<string, number>; totalAp: Decimal } | null {
  if (stageSubset.length === 0) {
    return null;
  }

  // Check if this subset can provide all required items
  const providedItems = new Set<string>();
  for (const stage of stageSubset) {
    for (const uid of Object.keys(stage.rewardPerItem)) {
      providedItems.add(uid);
    }
  }
  for (const [uid] of targets) {
    if (!providedItems.has(uid)) {
      return null; // This subset can't satisfy all targets
    }
  }

  // Build LP model
  const model: {
    optimize: string;
    opType: "min" | "max";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
  } = {
    optimize: "totalAP",
    opType: "min",
    constraints: {},
    variables: {},
  };

  for (const [uid, qty] of targets) {
    model.constraints[`item_${uid}`] = { min: qty };
  }

  for (const stage of stageSubset) {
    const varName = `stage_${stage.uid}`;
    model.variables[varName] = { totalAP: stage.entryAp.toNumber() };
    for (const [uid] of targets) {
      const reward = stage.rewardPerItem[uid];
      model.variables[varName][`item_${uid}`] = reward?.toNumber() || 0;
    }
  }

  try {
    const result = solver.Solve(model);
    if (!result.feasible) {
      return null;
    }

    let stageRuns: Record<string, number> = {};
    for (const stage of stageSubset) {
      const varName = `stage_${stage.uid}`;
      const runs = result[varName];
      if (typeof runs === "number" && runs > 0) {
        stageRuns[stage.uid] = Math.ceil(runs);
      }
    }

    // Local search: reduce runs where possible
    const sortedStages = [...stageSubset].sort((a, b) =>
      b.entryAp.minus(a.entryAp).toNumber()
    );

    let improved = true;
    while (improved) {
      improved = false;
      for (const stage of sortedStages) {
        const currentRuns = stageRuns[stage.uid] || 0;
        if (currentRuns > 0) {
          const testRuns = { ...stageRuns, [stage.uid]: currentRuns - 1 };
          if (testRuns[stage.uid] === 0) {
            delete testRuns[stage.uid];
          }
          if (checkConstraintsSatisfied(testRuns, stageSubset, targets)) {
            stageRuns = testRuns;
            improved = true;
          }
        }
      }
    }

    const totalAp = calculateTotalAp(stageRuns, stageSubset);
    return { stageRuns, totalAp };
  } catch {
    return null;
  }
}

/**
 * Generate all non-empty subsets of an array.
 */
function* generateSubsets<T>(arr: T[]): Generator<T[]> {
  const n = arr.length;
  // Iterate from 1 to 2^n - 1 (skip empty set)
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset: T[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        subset.push(arr[i]);
      }
    }
    yield subset;
  }
}

/**
 * Optimizes stage runs to minimize AP while fulfilling target item requirements.
 * Uses subset enumeration + LP relaxation + local search for optimal results.
 */
export function optimizeStageRuns(
  stageInfos: StageInfo[],
  targets: [string, number][],
): OptimizationResult {
  const emptyResult: OptimizationResult = {
    stageRuns: {},
    totalAp: new Decimal(0),
  };

  if (targets.length === 0) {
    return emptyResult;
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
    return emptyResult;
  }

  const contributingStages = stageInfos.filter((s) => s.contributes);
  if (contributingStages.length === 0) {
    return emptyResult;
  }

  // If too many stages (> 15), fall back to single LP solve to avoid exponential blowup
  if (contributingStages.length > 15) {
    const result = solveForSubset(contributingStages, obtainableTargets);
    return result || emptyResult;
  }

  // Enumerate all subsets and find the one with minimum AP
  let bestResult: OptimizationResult | null = null;

  for (const subset of generateSubsets(contributingStages)) {
    const result = solveForSubset(subset, obtainableTargets);
    if (result) {
      if (!bestResult || result.totalAp.lt(bestResult.totalAp)) {
        bestResult = result;
      }
    }
  }

  return bestResult || emptyResult;
}
