import type Decimal from "decimal.js";
import type { MinigameConfig, MinigamePayment, ShopResource, Stage } from "~/domain/event-shop";
import type { CalculationResult } from "../hooks/useShopCalculations";
import type { ShopState } from "../hooks/useShopState";
import { calculateItemBreakdowns, calculateResourceLedger, calculateStageInfos, optimizeStageRuns } from ".";

type ShopApCalculationState = Pick<
  ShopState,
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
  excludedShopResourceUids?: readonly string[];
  minigameConfig?: MinigameConfig | null;
}): CalculationResult {
  const {
    state,
    stages,
    shopResources,
    appliedBonusRatio,
    minigamePaymentCosts,
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
    minigameConfig,
    minigamePaymentCosts,
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
