import type Decimal from "decimal.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameConfig, MinigamePayment, ShopResource, Stage } from "~/domain/event-shop";
import type { ItemBreakdownResult } from "../calculations";
import {
  calculateItemBreakdowns,
  calculateResourceLedger,
  calculateStageInfos,
  optimizeStageRuns,
} from "../calculations";
import type { ShopState } from "./useShopState";

type UseShopCalculationsParams = {
  state: ShopState;
  stages: Stage[];
  shopResources: ShopResource[];
  appliedBonusRatio: Record<string, Decimal>;
  minigamePaymentCosts?: MinigamePayment[];
  minigameConfig?: MinigameConfig | null;
};

export type CalculationResult = {
  stageRuns: Record<string, number>;
  unobtainableTargets: Record<string, number>;
} & ItemBreakdownResult;

const EMPTY_RESULT: CalculationResult = {
  stageRuns: {},
  unobtainableTargets: {},
  totalAp: 0,
  firstClearAp: 0,
  questSweepAp: 0,
  extraSweepAp: 0,
  totalApWithExtras: 0,
  collectedTotals: {},
  itemBreakdown: {
    fromFirstRun: {},
    fromRepeatedRuns: {},
    existing: {},
    fromShop: {},
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
  appliedBonusRatio,
  minigamePaymentCosts,
  minigameConfig,
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
      const resourceLedger = calculateResourceLedger({
        shopResources,
        itemQuantities: state.itemQuantities,
        itemPurchaseDays: state.itemPurchaseDays,
        existingPaymentItemQuantities: state.existingPaymentItemQuantities,
        stages,
        includeFirstClear: state.includeFirstClear,
        minigamePlayCount: state.minigamePlayCount,
        minigameConfig,
        minigamePaymentCosts,
        overriddenRequiredQuantities: state.overriddenRequiredQuantities,
      });

      const targets = Object.entries(resourceLedger.remainingToFarm).filter(([, qty]) => (qty || 0) > 0);
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
        includeFirstClear: state.includeFirstClear,
        resourceLedger,
      });

      setResult({
        stageRuns: optimizationResult.stageRuns,
        unobtainableTargets: optimizationResult.unobtainableTargets,
        ...itemBreakdownResult,
      });
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
    appliedBonusRatio,
    minigamePaymentCosts,
    minigameConfig,
  ]);

  return useMemo(() => ({ ...result, isCalculating }), [result, isCalculating]);
}
