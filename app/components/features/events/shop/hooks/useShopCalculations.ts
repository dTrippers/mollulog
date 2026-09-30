import type Decimal from "decimal.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameConfig, MinigamePayment, RewardItem, ShopResource, Stage } from "~/domain/event-shop";
import type { ItemBreakdownResult } from "../calculations";
import { calculateShopApRequirement } from "../calculations/calculate-shop-ap";
import type { ShopState } from "./useShopState";

type UseShopCalculationsParams = {
  state: ShopState;
  stages: Stage[];
  shopResources: ShopResource[];
  appliedBonusRatio: Record<string, Decimal>;
  minigamePaymentCosts?: MinigamePayment[];
  minigameRewards?: RewardItem[];
  excludedShopResourceUids?: readonly string[];
  minigameConfig?: MinigameConfig | null;
  holdCalculations?: boolean;
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

export function calculationInputsMatch(left: readonly unknown[] | null, right: readonly unknown[]): boolean {
  return Boolean(left && left.length === right.length && left.every((value, index) => value === right[index]));
}

export function isUserCalculationPending(
  holdCalculations: boolean,
  isCalculating: boolean,
  lastCompletedUserInputs: readonly unknown[] | null,
  currentUserInputs: readonly unknown[],
): boolean {
  return !holdCalculations && isCalculating && !calculationInputsMatch(lastCompletedUserInputs, currentUserInputs);
}

type ShopCalculationInputParams = Omit<UseShopCalculationsParams, "holdCalculations">;

type ShopCalculationInputSets = {
  user: readonly unknown[];
  calculation: readonly unknown[];
  effect: ShopCalculationInputParams;
};

export function buildShopCalculationInputSets({
  state,
  stages,
  shopResources,
  appliedBonusRatio,
  minigamePaymentCosts,
  minigameRewards,
  excludedShopResourceUids,
  minigameConfig,
}: ShopCalculationInputParams): ShopCalculationInputSets {
  return {
    user: [
      state.itemQuantities,
      state.itemPurchaseDays,
      state.existingPaymentItemQuantities,
      state.includeFirstClear,
      state.minigameStartRound,
      state.minigamePlayCount,
      state.minigamePaymentQuantityMode,
      state.enabledStages,
      state.extraStageRuns,
      state.overriddenRequiredQuantities,
      state.selectedBonusStudentUids,
      state.bonusStudentSelectionMode,
      state.selectedBonusStudentUidsByItem,
      state.includeRecruitedStudents,
    ],
    calculation: [
      state.itemQuantities,
      state.itemPurchaseDays,
      state.existingPaymentItemQuantities,
      state.includeFirstClear,
      state.minigameStartRound,
      state.minigamePlayCount,
      state.minigamePaymentQuantityMode,
      state.enabledStages,
      state.extraStageRuns,
      state.overriddenRequiredQuantities,
      state.selectedBonusStudentUidsByItem,
      stages,
      shopResources,
      appliedBonusRatio,
      minigamePaymentCosts,
      minigameRewards,
      excludedShopResourceUids,
      minigameConfig,
    ],
    effect: {
      state,
      stages,
      shopResources,
      appliedBonusRatio,
      minigamePaymentCosts,
      minigameRewards,
      excludedShopResourceUids,
      minigameConfig,
    },
  };
}

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
  minigameRewards,
  excludedShopResourceUids,
  minigameConfig,
  holdCalculations = false,
}: UseShopCalculationsParams) {
  const [result, setResult] = useState<CalculationResult>(EMPTY_RESULT);
  const [isCalculating, setIsCalculating] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCompletedInputsRef = useRef<readonly unknown[] | null>(null);
  const inputSets = useMemo(
    () =>
      buildShopCalculationInputSets({
        state: {
          itemQuantities: state.itemQuantities,
          itemPurchaseDays: state.itemPurchaseDays,
          selectedBonusStudentUids: state.selectedBonusStudentUids,
          bonusStudentSelectionMode: state.bonusStudentSelectionMode,
          selectedBonusStudentUidsByItem: state.selectedBonusStudentUidsByItem,
          includeRecruitedStudents: state.includeRecruitedStudents,
          enabledStages: state.enabledStages,
          existingPaymentItemQuantities: state.existingPaymentItemQuantities,
          includeFirstClear: state.includeFirstClear,
          extraStageRuns: state.extraStageRuns,
          minigameStartRound: state.minigameStartRound,
          minigamePlayCount: state.minigamePlayCount,
          minigamePaymentQuantityMode: state.minigamePaymentQuantityMode,
          overriddenRequiredQuantities: state.overriddenRequiredQuantities,
        },
        stages,
        shopResources,
        appliedBonusRatio,
        minigamePaymentCosts,
        minigameRewards,
        excludedShopResourceUids,
        minigameConfig,
      }),
    [
      state.itemQuantities,
      state.itemPurchaseDays,
      state.existingPaymentItemQuantities,
      state.includeFirstClear,
      state.minigameStartRound,
      state.minigamePlayCount,
      state.minigamePaymentQuantityMode,
      state.enabledStages,
      state.extraStageRuns,
      state.overriddenRequiredQuantities,
      state.selectedBonusStudentUids,
      state.bonusStudentSelectionMode,
      state.selectedBonusStudentUidsByItem,
      state.includeRecruitedStudents,
      stages,
      shopResources,
      appliedBonusRatio,
      minigamePaymentCosts,
      minigameRewards,
      excludedShopResourceUids,
      minigameConfig,
    ],
  );
  const lastCompletedUserInputsRef = useRef<readonly unknown[] | null>(inputSets.user);
  const isReady = !holdCalculations && calculationInputsMatch(lastCompletedInputsRef.current, inputSets.calculation);
  const isUserCalculating = isUserCalculationPending(
    holdCalculations,
    isCalculating,
    lastCompletedUserInputsRef.current,
    inputSets.user,
  );

  useEffect(() => {
    const {
      state: calculationState,
      stages: calculationStages,
      shopResources: calculationShopResources,
      appliedBonusRatio: calculationAppliedBonusRatio,
      minigamePaymentCosts: calculationMinigamePaymentCosts,
      minigameRewards: calculationMinigameRewards,
      excludedShopResourceUids: calculationExcludedShopResourceUids,
      minigameConfig: calculationMinigameConfig,
    } = inputSets.effect;

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (holdCalculations) {
      setIsCalculating(false);
      setResult(EMPTY_RESULT);
      return;
    }

    setIsCalculating(true);

    // Debounce calculation by 300ms to prevent excessive recalculations
    debounceTimerRef.current = setTimeout(() => {
      setResult(
        calculateShopApRequirement({
          state: calculationState,
          stages: calculationStages,
          shopResources: calculationShopResources,
          appliedBonusRatio: calculationAppliedBonusRatio,
          minigamePaymentCosts: calculationMinigamePaymentCosts,
          minigameRewards: calculationMinigameRewards,
          excludedShopResourceUids: calculationExcludedShopResourceUids,
          minigameConfig: calculationMinigameConfig,
        }),
      );
      lastCompletedInputsRef.current = inputSets.calculation;
      lastCompletedUserInputsRef.current = inputSets.user;
      setIsCalculating(false);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputSets, holdCalculations]);

  return useMemo(
    () => ({
      ...(holdCalculations ? EMPTY_RESULT : result),
      isCalculating: holdCalculations ? false : isCalculating,
      isReady,
      isUserCalculating,
    }),
    [holdCalculations, result, isCalculating, isReady, isUserCalculating],
  );
}
