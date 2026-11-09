import { isSweepableStage } from "~/domain/event-shop";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { jankenLocale, roadPuzzleLocale, treasureHuntLocale } from "~/locales/ko";

export type StageRunRow = {
  stage: EventShopPlanContext["stages"][number];
  runs: number;
  extraRuns: number;
};

// Normal stages in their in-game order. The shop calculator plans normal stages only.
export function normalStages(plan: EventShopPlanContext) {
  return plan.stages
    .filter(isSweepableStage)
    .sort((a, b) => Number.parseInt(a.index, 10) - Number.parseInt(b.index, 10));
}

// Stages the plan sweeps, with the calculated and the extra runs.
export function stageRunRows(plan: EventShopPlanContext): StageRunRow[] {
  return normalStages(plan)
    .filter((stage) => plan.state.enabledStages[stage.uid])
    .map((stage) => ({
      stage,
      runs: plan.stageCalculations.stageRuns[stage.uid] ?? 0,
      extraRuns: plan.state.extraStageRuns[stage.uid] ?? 0,
    }))
    .filter(({ runs, extraRuns }) => runs + extraRuns > 0);
}

// How much of each currency the plan lacks. A currency that is enough is absent.
export function resourceShortfalls(plan: EventShopPlanContext): Record<string, number> {
  const shortfalls: Record<string, number> = {};
  for (const resource of plan.collectableResources) {
    const remaining = plan.stageCalculations.itemBreakdown.remaining[resource.uid] ?? 0;
    if (remaining < 0) shortfalls[resource.uid] = Math.abs(Math.floor(remaining));
  }
  return shortfalls;
}

export function hasShopSelection(plan: EventShopPlanContext) {
  return plan.shopResources.some(
    ({ uid }) => (plan.state.itemQuantities[uid] ?? 0) > 0 || (plan.state.itemPurchaseDays[uid] ?? 0) > 0,
  );
}

export type ResultSlotState =
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "waiting"; text: string }
  // The input itself rules the calculation out, so nothing will arrive until the player changes it.
  | { kind: "blocked"; text: string }
  | { kind: "failed"; text: string; retryLabel: string; retry: () => void };

// What the AP slot shows. Waiting and failure replace the AP number; recalculation keeps the previous values dimmed.
export function resultSlotState(plan: EventShopPlanContext): ResultSlotState {
  if (plan.calculationFailed) {
    return { kind: "failed", text: "계산하지 못했어요", retryLabel: "다시 계산", retry: plan.retryCalculation };
  }
  if (plan.roadPuzzlePlannerStatus === "missing") {
    return {
      kind: "failed",
      text: roadPuzzleLocale.noData,
      retryLabel: roadPuzzleLocale.retry,
      retry: plan.roadPuzzleCalculation.retry,
    };
  }
  if (plan.roadPuzzlePlannerStatus === "failed") {
    return {
      kind: "failed",
      text: roadPuzzleLocale.plannerFailed,
      retryLabel: roadPuzzleLocale.retry,
      retry: plan.roadPuzzleCalculation.retry,
    };
  }
  if (plan.resultTreasureHuntStatus === "failed") {
    return {
      kind: "failed",
      text: treasureHuntLocale.failedResult,
      retryLabel: treasureHuntLocale.retry,
      retry: plan.treasureHuntCalculation.retry,
    };
  }
  if (plan.resultTreasureHuntStatus === "round-limit")
    return { kind: "blocked", text: treasureHuntLocale.roundLimitResult };
  if (plan.roadPuzzlePlannerStatus === "pending") return { kind: "waiting", text: "철도 연결 계산을 기다리는 중" };
  if (plan.holdTreasureHuntCalculations || plan.resultTreasureHuntStatus === "pending") {
    return { kind: "waiting", text: "보물찾기 계산을 기다리는 중" };
  }
  if (!hasShopSelection(plan) && plan.stageCalculations.totalApWithExtras <= 0 && !plan.isCalculating) {
    return { kind: "empty" };
  }
  return { kind: "ready" };
}

export function minigameTitle(type: string) {
  return (
    (
      {
        clue_search: "단서 찾기",
        dice: "주사위",
        card_flip: "카드 뒤집기",
        treasure_hunt: "보물찾기",
        box_gacha: "상자 뽑기",
        fortune_gacha: "운세 뽑기",
        road_puzzle: roadPuzzleLocale.title,
        janken: jankenLocale.gameTitle,
      } as Record<string, string>
    )[type] ?? "미니게임"
  );
}
