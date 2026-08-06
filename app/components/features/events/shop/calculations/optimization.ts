import Decimal from "decimal.js";
import solver from "javascript-lp-solver";
import type { Stage } from "~/domain/event-shop";
import type { OptimizationResult, StageInfo } from "./types";

export const OPTIMIZATION_TOLERANCE = 0.001;
export const OPTIMIZATION_TIMEOUT_MS = 700;

const INTEGER_EPSILON = 1e-7;

type StageRunPlan = Pick<OptimizationResult, "stageRuns" | "totalAp">;

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

function calculateProducedQuantity(stageInfos: StageInfo[], stageRuns: Record<string, number>, itemUid: string) {
  return stageInfos.reduce(
    (total, stage) => total.plus((stage.rewardPerItem[itemUid] ?? new Decimal(0)).mul(stageRuns[stage.uid] ?? 0)),
    new Decimal(0),
  );
}

function calculatePlanTotalAp(stageInfos: StageInfo[], stageRuns: Record<string, number>) {
  return stageInfos.reduce((total, stage) => total.plus(stage.entryAp.mul(stageRuns[stage.uid] ?? 0)), new Decimal(0));
}

function satisfiesTargets(stageInfos: StageInfo[], stageRuns: Record<string, number>, targets: [string, number][]) {
  return targets.every(([uid, quantity]) => calculateProducedQuantity(stageInfos, stageRuns, uid).gte(quantity));
}

/**
 * Builds a deterministic feasible plan before invoking the bounded solver.
 * Rewards are non-negative, so satisfying targets one at a time cannot undo
 * a target that was already satisfied.
 */
function buildFeasibleFallback(stageInfos: StageInfo[], targets: [string, number][]): StageRunPlan {
  const stageRuns: Record<string, number> = {};

  for (const [uid, quantity] of targets) {
    const deficit = new Decimal(quantity).minus(calculateProducedQuantity(stageInfos, stageRuns, uid));
    if (deficit.lte(0)) {
      continue;
    }

    const bestStage = stageInfos
      .filter((stage) => stage.rewardPerItem[uid]?.gt(0))
      .sort((a, b) => {
        const aEfficiency = a.entryAp.div(a.rewardPerItem[uid]);
        const bEfficiency = b.entryAp.div(b.rewardPerItem[uid]);
        const efficiencyComparison = aEfficiency.comparedTo(bEfficiency);
        return efficiencyComparison !== 0 ? efficiencyComparison : a.uid.localeCompare(b.uid);
      })[0];

    if (!bestStage) {
      continue;
    }

    const additionalRuns = deficit.div(bestStage.rewardPerItem[uid]).ceil().toNumber();
    stageRuns[bestStage.uid] = (stageRuns[bestStage.uid] ?? 0) + additionalRuns;
  }

  return { stageRuns, totalAp: calculatePlanTotalAp(stageInfos, stageRuns) };
}

function parseValidatedSolverPlan(
  solved: Record<string, number | boolean | undefined>,
  stageInfos: StageInfo[],
  targets: [string, number][],
): StageRunPlan | null {
  const stageRuns: Record<string, number> = {};

  for (const stage of stageInfos) {
    const value = solved[`stage_${stage.uid}`];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < -INTEGER_EPSILON) {
      return null;
    }

    const integerRuns = Math.round(value);
    if (Math.abs(value - integerRuns) > INTEGER_EPSILON) {
      return null;
    }
    if (integerRuns > 0) {
      stageRuns[stage.uid] = integerRuns;
    }
  }

  if (!satisfiesTargets(stageInfos, stageRuns, targets)) {
    return null;
  }

  return { stageRuns, totalAp: calculatePlanTotalAp(stageInfos, stageRuns) };
}

/**
 * Finds a low-AP integer plan within the configured optimality gap and time limit.
 */
export function optimizeStageRuns(stageInfos: StageInfo[], targets: [string, number][]): OptimizationResult {
  const obtainableItems = new Set(
    stageInfos.flatMap((stage) =>
      Object.entries(stage.rewardPerItem).flatMap(([uid, quantity]) => (quantity.gt(0) ? [uid] : [])),
    ),
  );
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
    tolerance: number;
    timeout: number;
  } = {
    optimize: "totalAP",
    opType: "min",
    constraints: {},
    variables: {},
    ints: {},
    tolerance: OPTIMIZATION_TOLERANCE,
    timeout: OPTIMIZATION_TIMEOUT_MS,
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

  const fallbackPlan = buildFeasibleFallback(contributingStages, obtainableTargets);

  try {
    const solved = solver.Solve(model);
    const solverPlan = solved.feasible ? parseValidatedSolverPlan(solved, contributingStages, obtainableTargets) : null;
    const plan = solverPlan?.totalAp.lte(fallbackPlan.totalAp) ? solverPlan : fallbackPlan;
    return { ...plan, unobtainableTargets };
  } catch {
    return { ...fallbackPlan, unobtainableTargets };
  }
}
