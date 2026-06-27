import type Decimal from "decimal.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameConfig, MinigamePayment } from "~/domain/event-shop";
import type { CollectableResource, ShopResource, Stage } from "~/domain/event-shop";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import {
  calculateItemBreakdowns,
  calculateRequiredQuantities,
  calculateStageInfos,
  optimizeStageRuns,
} from "../calculations";
import type { ItemBreakdownResult } from "../calculations";
import type { ShopState } from "./useShopState";

type UseShopCalculationsParams = {
  state: ShopState;
  stages: Stage[];
  shopResources: ShopResource[];
  collectableResources: CollectableResource[];
  appliedBonusRatio: Record<string, Decimal>;
  minigamePaymentCosts?: MinigamePayment[];
  minigameRewards?: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    quantity: number;
  }[];
  minigameConfig?: MinigameConfig | null;
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
  minigamePaymentCosts,
  minigameRewards,
  minigameConfig,
  eventUid,
}: UseShopCalculationsParams) {
  const [result, setResult] = useState<CalculationResult>(EMPTY_RESULT);
  const [isCalculating, setIsCalculating] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        itemPurchaseDays: state.itemPurchaseDays,
        existingPaymentItemQuantities: state.existingPaymentItemQuantities,
        stages,
        includeFirstClear: state.includeFirstClear,
        minigamePlayCount: state.minigamePlayCount,
        minigameConfig,
        minigameRewards,
        minigamePaymentCosts,
        enabledStages: state.enabledStages,
        appliedBonusRatio,
        overriddenRequiredQuantities: state.overriddenRequiredQuantities,
      });

      const targets = Object.entries(targetRequirements).filter(([, qty]) => (qty || 0) > 0);
      const stageInfos = calculateStageInfos(
        stages,
        state.enabledStages,
        appliedBonusRatio,
        targets as [string, number][],
      );
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
        minigameConfig,
        minigameRewards: minigameRewards ? { [eventUid]: minigameRewards } : undefined,
        shopResources,
        itemQuantities: state.itemQuantities,
        itemPurchaseDays: state.itemPurchaseDays,
        collectableResources,
        minigamePaymentCosts,
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
    state.itemPurchaseDays,
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
    minigamePaymentCosts,
    minigameRewards,
    minigameConfig,
    eventUid,
  ]);

  return useMemo(() => ({ ...result, isCalculating }), [result, isCalculating]);
}
