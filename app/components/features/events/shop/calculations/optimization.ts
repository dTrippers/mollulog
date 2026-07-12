import Decimal from "decimal.js";
import solver from "javascript-lp-solver";
import type { Stage } from "~/domain/event-shop";
import type { OptimizationResult, StageInfo } from "./types";

/**
 * Calculates reward information for stages based on required target items.
 */
export function calculateStageInfos(
  stages: Stage[],
  enabledStages: Record<string, boolean>,
  appliedBonusRatio: Record<string, Decimal>,
): StageInfo[] {
  return stages
    .filter((stage) => enabledStages[stage.uid])
    .map((stage) => {
      const rewardPerItem: Record<string, Decimal> = {};
      for (const { item, rewardRequirement, amount } of stage.rewards) {
        if (item?.category !== "coin" || rewardRequirement !== null) {
          continue;
        }
        const bonusRatio = appliedBonusRatio[item.uid] ?? new Decimal(0);
        const perClear = new Decimal(amount).plus(bonusRatio.mul(amount).ceil());
        if (perClear.gt(0)) {
          rewardPerItem[item.uid] = perClear;
        }
      }
      return {
        uid: stage.uid,
        index: stage.index,
        entryAp: new Decimal(stage.entryAp),
        rewardPerItem,
      };
    });
}

/**
 * Finds the integer stage-run plan with the minimum total AP.
 */
export function optimizeStageRuns(stageInfos: StageInfo[], targets: [string, number][]): OptimizationResult {
  const obtainableItems = new Set(stageInfos.flatMap((stage) => Object.keys(stage.rewardPerItem)));
  const obtainableTargets = targets.filter(([uid]) => obtainableItems.has(uid));
  const unobtainableTargets = Object.fromEntries(targets.filter(([uid]) => !obtainableItems.has(uid)));
  const emptyResult: OptimizationResult = {
    stageRuns: {},
    totalAp: new Decimal(0),
    unobtainableTargets,
  };

  if (obtainableTargets.length === 0) {
    return emptyResult;
  }

  const contributingStages = stageInfos.filter((stage) =>
    obtainableTargets.some(([uid]) => stage.rewardPerItem[uid]?.gt(0)),
  );
  if (contributingStages.length === 0) {
    return emptyResult;
  }

  const model: {
    optimize: string;
    opType: "min";
    constraints: Record<string, { min: number }>;
    variables: Record<string, Record<string, number>>;
    ints: Record<string, 1>;
  } = {
    optimize: "totalAP",
    opType: "min",
    constraints: {},
    variables: {},
    ints: {},
  };

  for (const [uid, quantity] of obtainableTargets) {
    model.constraints[`item_${uid}`] = { min: quantity };
  }

  for (const stage of contributingStages) {
    const variableName = `stage_${stage.uid}`;
    model.variables[variableName] = { totalAP: stage.entryAp.toNumber() };
    model.ints[variableName] = 1;
    for (const [uid] of obtainableTargets) {
      model.variables[variableName][`item_${uid}`] = stage.rewardPerItem[uid]?.toNumber() ?? 0;
    }
  }

  try {
    const solved = solver.Solve(model);
    if (!solved.feasible) {
      return emptyResult;
    }

    const stageRuns: Record<string, number> = {};
    let totalAp = new Decimal(0);
    for (const stage of contributingStages) {
      const runs = solved[`stage_${stage.uid}`];
      if (typeof runs !== "number" || runs <= 0) {
        continue;
      }

      const integerRuns = Math.round(runs);
      if (integerRuns > 0) {
        stageRuns[stage.uid] = integerRuns;
        totalAp = totalAp.plus(stage.entryAp.mul(integerRuns));
      }
    }

    return { stageRuns, totalAp, unobtainableTargets };
  } catch {
    return emptyResult;
  }
}
