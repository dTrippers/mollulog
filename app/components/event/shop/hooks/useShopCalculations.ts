import { useMemo, useState, useEffect, useRef } from "react";
import type Decimal from "decimal.js";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import type { Stage, ShopResource, CollectableResource } from "../types";
import type { ShopState } from "./useShopState";
import { calculateStageInfos, optimizeStageRuns, calculateItemBreakdowns, calculateRequiredQuantities } from "../calculations";
import type { ItemBreakdownResult } from "../calculations";

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

export type CalculationResult = {
  stageRuns: Record<string, number>;
} & ItemBreakdownResult;

const EMPTY_RESULT: CalculationResult = {
  stageRuns: {},
  totalAp: 0,
  firstClearAp: 0,
  questSweepAp: 0,
  extraSweepAp: 0,
  totalApWithExtras: 0,
  collectedTotals: {},
  itemBreakdown: {
    fromFirstRun: {},
    fromRepeatedRuns: {},
    toPlayMinigame: {},
    toBuyShopItems: {},
    fromMinigame: {},
    remaining: {},
  },
};

/**
 * Memoized calculation orchestration hook.
 * Coordinates all shop calculations in the correct order.
 * Uses debounce to prevent excessive recalculations.
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
  const [result, setResult] = useState<CalculationResult>(EMPTY_RESULT);
  const [isCalculating, setIsCalculating] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create a stable reference to inputs for comparison
  const inputsRef = useRef({
    itemQuantities: state.itemQuantities,
    existingPaymentItemQuantities: state.existingPaymentItemQuantities,
    includeFirstClear: state.includeFirstClear,
    minigamePlayCount: state.minigamePlayCount,
    enabledStages: state.enabledStages,
    extraStageRuns: state.extraStageRuns,
    overriddenRequiredQuantities: state.overriddenRequiredQuantities,
  });

  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsCalculating(true);

    // Debounce calculation by 300ms to prevent excessive recalculations
    debounceTimerRef.current = setTimeout(() => {
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
        eventUid,
      });

      const targets = Object.entries(targetRequirements).filter(([, qty]) => (qty || 0) > 0);
      const stageInfos = calculateStageInfos(stages, state.enabledStages, appliedBonusRatio, targets as [string, number][]);
      const optimizationResult = optimizeStageRuns(stageInfos, targets as [string, number][]);

      const itemBreakdownResult = calculateItemBreakdowns({
        stages,
        enabledStages: state.enabledStages,
        stageRuns: optimizationResult.stageRuns,
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

      setResult({ stageRuns: optimizationResult.stageRuns, ...itemBreakdownResult });
      setIsCalculating(false);
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
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

  return useMemo(() => ({ ...result, isCalculating }), [result, isCalculating]);
}
