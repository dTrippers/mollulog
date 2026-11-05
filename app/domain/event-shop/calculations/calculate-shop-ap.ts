import type Decimal from "decimal.js";
import type { MinigameConfig, MinigamePayment, RewardItem, ShopResource, Stage } from "~/domain/event-shop";
import type { EventShopState } from "~/domain/event-shop-state";
import type { JankenScoreProgress } from "~/domain/event-shop/janken";
import { calculateItemBreakdowns, calculateResourceLedger, calculateStageInfos, optimizeStageRuns } from ".";
import type { CalculationResult } from "./types";

type ShopApCalculationState = Pick<
  EventShopState,
  | "itemQuantities"
  | "itemPurchaseDays"
  | "existingPaymentItemQuantities"
  | "includeFirstClear"
  | "minigameStartRound"
  | "minigamePlayCount"
  | "enabledStages"
  | "extraStageRuns"
  | "overriddenRequiredQuantities"
>;

export function calculateShopApRequirement(input: {
  state: ShopApCalculationState;
  stages: Stage[];
  shopResources: ShopResource[];
  appliedBonusRatio: Record<string, Decimal>;
  minigamePaymentCosts?: MinigamePayment[];
  minigameRewards?: RewardItem[];
  jankenClearedStageUids?: readonly string[];
  jankenStagePlays?: Record<string, number>;
  jankenScore?: JankenScoreProgress;
  excludedShopResourceUids?: readonly string[];
  minigameConfig?: MinigameConfig | null;
}): CalculationResult {
  const {
    state,
    stages,
    shopResources,
    appliedBonusRatio,
    minigamePaymentCosts,
    minigameRewards,
    jankenClearedStageUids,
    jankenStagePlays,
    jankenScore,
    excludedShopResourceUids,
    minigameConfig,
  } = input;
  const resourceLedger = calculateResourceLedger({
    shopResources,
    itemQuantities: state.itemQuantities,
    itemPurchaseDays: state.itemPurchaseDays,
    existingPaymentItemQuantities: state.existingPaymentItemQuantities,
    stages,
    includeFirstClear: state.includeFirstClear,
    minigameStartRound: state.minigameStartRound,
    minigamePlayCount: state.minigamePlayCount,
    jankenStagePlays,
    jankenClearedStageUids,
    jankenScore,
    minigameConfig,
    minigamePaymentCosts,
    minigameRewards,
    excludedShopResourceUids,
    overriddenRequiredQuantities: state.overriddenRequiredQuantities,
  });
  const targets = Object.entries(resourceLedger.remainingToFarm).filter(([, quantity]) => (quantity || 0) > 0);
  const stageInfos = calculateStageInfos(stages, state.enabledStages, appliedBonusRatio);
  const optimization = optimizeStageRuns(stageInfos, targets as [string, number][]);
  const breakdown = calculateItemBreakdowns({
    stages,
    enabledStages: state.enabledStages,
    stageRuns: optimization.stageRuns,
    extraStageRuns: state.extraStageRuns,
    appliedBonusRatio,
    includeFirstClear: state.includeFirstClear,
    resourceLedger,
  });
  return {
    stageRuns: optimization.stageRuns,
    unobtainableTargets: optimization.unobtainableTargets,
    ...breakdown,
  };
}
