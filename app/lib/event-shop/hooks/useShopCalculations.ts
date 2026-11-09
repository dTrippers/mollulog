import type Decimal from "decimal.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameConfig, MinigamePayment, RewardItem, ShopResource, Stage } from "~/domain/event-shop";
import type { CalculationResult } from "~/domain/event-shop/calculations";
import { calculateShopApRequirement } from "~/domain/event-shop/calculations/calculate-shop-ap";
import type { JankenScoreProgress } from "~/domain/event-shop/janken";
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
  jankenClearedStageUids: readonly string[];
  jankenStagePlays: Record<string, number>;
  jankenScore: JankenScoreProgress;
  holdCalculations?: boolean;
};

export type { CalculationResult } from "~/domain/event-shop/calculations";

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
  jankenClearedStageUids,
  jankenStagePlays,
  jankenScore,
}: ShopCalculationInputParams): ShopCalculationInputSets {
  return {
    user: [
      state.itemQuantities,
      state.itemPurchaseDays,
      state.existingPaymentItemQuantities,
      state.includeFirstClear,
      state.minigameStartRound,
      state.minigamePlayCount,
      jankenStagePlays,
      jankenClearedStageUids,
      jankenScore.currentScore,
      jankenScore.averageScore,
      state.minigamePaymentQuantityMode,
      state.cardFlipStrategy,
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
      jankenStagePlays,
      jankenClearedStageUids,
      jankenScore.currentScore,
      jankenScore.averageScore,
      state.minigamePaymentQuantityMode,
      state.cardFlipStrategy,
      state.enabledStages,
      state.extraStageRuns,
      state.overriddenRequiredQuantities,
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
      jankenClearedStageUids,
      jankenStagePlays,
      jankenScore,
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
  jankenClearedStageUids,
  jankenStagePlays,
  jankenScore,
  holdCalculations = false,
}: UseShopCalculationsParams) {
  const jankenCurrentScore = jankenScore.currentScore;
  const jankenAverageScore = jankenScore.averageScore;
  const [result, setResult] = useState<CalculationResult>(EMPTY_RESULT);
  const [isCalculating, setIsCalculating] = useState(false);
  // A thrown calculation must not leave the result waiting forever. The failure shows until the inputs change or
  // the viewer retries.
  const [calculationFailed, setCalculationFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
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
          cardFlipStrategy: state.cardFlipStrategy,
          overriddenRequiredQuantities: state.overriddenRequiredQuantities,
        },
        stages,
        shopResources,
        appliedBonusRatio,
        minigamePaymentCosts,
        minigameRewards,
        excludedShopResourceUids,
        minigameConfig,
        jankenClearedStageUids,
        jankenStagePlays,
        jankenScore: { currentScore: jankenCurrentScore, averageScore: jankenAverageScore },
      }),
    [
      state.itemQuantities,
      state.itemPurchaseDays,
      state.existingPaymentItemQuantities,
      state.includeFirstClear,
      state.minigameStartRound,
      state.minigamePlayCount,
      jankenStagePlays,
      jankenClearedStageUids,
      jankenCurrentScore,
      jankenAverageScore,
      state.minigamePaymentQuantityMode,
      state.cardFlipStrategy,
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
  const calculationInputsRef = useRef<readonly unknown[]>(inputSets.calculation);
  if (!calculationInputsMatch(calculationInputsRef.current, inputSets.calculation)) {
    calculationInputsRef.current = inputSets.calculation;
  }
  const calculationInputs = calculationInputsRef.current;
  const inputSetsRef = useRef(inputSets);
  inputSetsRef.current = inputSets;
  const lastCompletedUserInputsRef = useRef<readonly unknown[] | null>(inputSets.user);
  const isReady = !holdCalculations && calculationInputsMatch(lastCompletedInputsRef.current, calculationInputs);
  const isUserCalculating = isUserCalculationPending(
    holdCalculations,
    isCalculating,
    lastCompletedUserInputsRef.current,
    inputSets.user,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount reruns the same inputs after a failed calculation.
  useEffect(() => {
    const currentInputSets = inputSetsRef.current;
    const {
      state: calculationState,
      stages: calculationStages,
      shopResources: calculationShopResources,
      appliedBonusRatio: calculationAppliedBonusRatio,
      minigamePaymentCosts: calculationMinigamePaymentCosts,
      minigameRewards: calculationMinigameRewards,
      excludedShopResourceUids: calculationExcludedShopResourceUids,
      minigameConfig: calculationMinigameConfig,
      jankenClearedStageUids: calculationJankenClearedStageUids,
      jankenStagePlays: calculationJankenStagePlays,
      jankenScore: calculationJankenScore,
    } = currentInputSets.effect;

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setCalculationFailed(false);
    if (holdCalculations) {
      setIsCalculating(false);
      setResult(EMPTY_RESULT);
      return;
    }

    setIsCalculating(true);

    // Debounce calculation by 300ms to prevent excessive recalculations
    debounceTimerRef.current = setTimeout(() => {
      let nextResult: CalculationResult;
      try {
        nextResult = calculateShopApRequirement({
          state: calculationState,
          stages: calculationStages,
          shopResources: calculationShopResources,
          appliedBonusRatio: calculationAppliedBonusRatio,
          minigamePaymentCosts: calculationMinigamePaymentCosts,
          minigameRewards: calculationMinigameRewards,
          excludedShopResourceUids: calculationExcludedShopResourceUids,
          minigameConfig: calculationMinigameConfig,
          jankenClearedStageUids: calculationJankenClearedStageUids,
          jankenStagePlays: calculationJankenStagePlays,
          jankenScore: calculationJankenScore,
        });
      } catch (error) {
        console.error("Event shop calculation failed", error);
        setCalculationFailed(true);
        setIsCalculating(false);
        return;
      }
      setResult(nextResult);
      lastCompletedInputsRef.current = calculationInputs;
      lastCompletedUserInputsRef.current = inputSetsRef.current.user;
      setIsCalculating(false);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [calculationInputs, holdCalculations, retryCount]);

  return useMemo(
    () => ({
      ...(holdCalculations ? EMPTY_RESULT : result),
      isCalculating: holdCalculations || calculationFailed ? false : !isReady || isCalculating,
      isReady,
      isUserCalculating: calculationFailed ? false : isUserCalculating,
      calculationFailed: !holdCalculations && calculationFailed,
      retryCalculation: () => setRetryCount((count) => count + 1),
    }),
    [holdCalculations, result, isCalculating, isReady, isUserCalculating, calculationFailed],
  );
}
