import { useMemo } from "react";
import type Decimal from "decimal.js";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { Stage, ShopResource, CollectableResource } from "../types";
import type { ShopState } from "./useShopState";
import { calculateStageInfos, optimizeStageRuns, calculateItemBreakdowns, calculateRequiredQuantities } from "../calculations";

type UseShopCalculationsParams = {
  state: ShopState;
  stages: Stage[];
  shopResources: ShopResource[];
  collectableResources: CollectableResource[];
  appliedBonusRatio: Record<string, Decimal>;
  minigamePaymentResource?: { resourceUid: string; quantity: number };
  minigameRewards?: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    quantity: number;
  }[];
  eventUid: string;
};

/**
 * Memoized calculation orchestration hook.
 * Coordinates all shop calculations in the correct order.
 */
export function useShopCalculations({
  state,
  stages,
  shopResources,
  collectableResources,
  appliedBonusRatio,
  minigamePaymentResource,
  minigameRewards,
  eventUid,
}: UseShopCalculationsParams) {
  return useMemo(() => {
    const targetRequirements = calculateRequiredQuantities({
      shopResources,
      collectableResources,
      itemQuantities: state.itemQuantities,
      existingPaymentItemQuantities: state.existingPaymentItemQuantities,
      stages,
      includeFirstClear: state.includeFirstClear,
      minigamePlayCount: state.minigamePlayCount,
      minigameRewards,
      minigameCostItemUid: minigamePaymentResource?.resourceUid,
      minigameCostAmount: minigamePaymentResource?.quantity,
      enabledStages: state.enabledStages,
      appliedBonusRatio,
      overriddenRequiredQuantities: state.overriddenRequiredQuantities,
    });

    const targets = Object.entries(targetRequirements).filter(([, qty]) => (qty || 0) > 0);
    const stageInfos = calculateStageInfos(stages, state.enabledStages, appliedBonusRatio, targets as [string, number][]);
    const { stageRuns } = optimizeStageRuns(stageInfos, targets as [string, number][]);

    const itemBreakdownResult = calculateItemBreakdowns({
      stages,
      enabledStages: state.enabledStages,
      stageRuns,
      extraStageRuns: state.extraStageRuns,
      appliedBonusRatio,
      paymentItemQuantities: targetRequirements,
      includeFirstClear: state.includeFirstClear,
      minigamePlayCount: state.minigamePlayCount,
      eventUid,
      minigameRewards: minigameRewards ? { [eventUid]: minigameRewards } : undefined,
      shopResources,
      itemQuantities: state.itemQuantities,
      collectableResources,
      minigamePaymentResource,
    });

    return { stageRuns, ...itemBreakdownResult };
  }, [
    state.itemQuantities,
    state.existingPaymentItemQuantities,
    state.includeFirstClear,
    state.minigamePlayCount,
    state.enabledStages,
    state.extraStageRuns,
    state.overriddenRequiredQuantities,
    stages,
    shopResources,
    collectableResources,
    appliedBonusRatio,
    minigamePaymentResource,
    minigameRewards,
    eventUid,
  ]);
}
