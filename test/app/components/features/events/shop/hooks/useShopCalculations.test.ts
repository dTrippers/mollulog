/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";
import type { ShopResource, Stage } from "~/domain/event-shop";
import { calculateShopApRequirement } from "~/domain/event-shop/calculations/calculate-shop-ap";
import { ResourceTypeEnum } from "~/graphql/graphql";
import {
  buildShopCalculationInputSets,
  calculationInputsMatch,
  isUserCalculationPending,
  useShopCalculations,
} from "~/lib/event-shop/hooks/useShopCalculations";
import type { ShopState } from "~/lib/event-shop/hooks/useShopState";

jest.mock("~/domain/event-shop/calculations/calculate-shop-ap", () => ({
  calculateShopApRequirement: jest.fn(() => ({
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
  })),
}));

afterEach(() => {
  jest.useRealTimers();
});

const state: ShopState = {
  itemQuantities: {},
  itemPurchaseDays: {},
  selectedBonusStudentUids: [],
  bonusStudentSelectionMode: "shared",
  selectedBonusStudentUidsByItem: {},
  includeRecruitedStudents: false,
  enabledStages: {},
  existingPaymentItemQuantities: {},
  includeFirstClear: false,
  extraStageRuns: {},
  minigameStartRound: 1,
  minigamePlayCount: 6,
  minigamePaymentQuantityMode: "expected",
  cardFlipStrategy: "all-open",
  overriddenRequiredQuantities: {},
};

const stages: Stage[] = [];
const shopResources: ShopResource[] = [];
const noClearedJankenStages: string[] = [];
const noJankenStagePlays: Record<string, number> = {};

describe("useShopCalculations input tracking", () => {
  it("does not treat simulation-only result updates as user calculation changes", () => {
    const inputs = {
      state,
      stages,
      shopResources: [],
      appliedBonusRatio: {},
      jankenClearedStageUids: [],
      jankenStagePlays: {},
      jankenScore: { currentScore: 0, averageScore: null },
    };
    const pendingInputs = buildShopCalculationInputSets(inputs);
    const provisionalInputs = buildShopCalculationInputSets({
      ...inputs,
      minigamePaymentCosts: [{ resourceType: ResourceTypeEnum.Currency, resourceUid: "cell", quantity: 200 }],
    });

    const changedStrategyInputs = buildShopCalculationInputSets({
      ...inputs,
      state: { ...state, cardFlipStrategy: "sr-reset" },
    });
    const changedJankenClears = buildShopCalculationInputSets({
      ...inputs,
      jankenClearedStageUids: ["stage-1"],
    });
    const changedJankenScore = buildShopCalculationInputSets({
      ...inputs,
      jankenScore: { currentScore: 100_000, averageScore: 50_000 },
    });

    expect(calculationInputsMatch(pendingInputs.calculation, provisionalInputs.calculation)).toBe(false);
    expect(calculationInputsMatch(pendingInputs.user, provisionalInputs.user)).toBe(true);
    expect(calculationInputsMatch(pendingInputs.calculation, changedStrategyInputs.calculation)).toBe(false);
    expect(calculationInputsMatch(pendingInputs.user, changedStrategyInputs.user)).toBe(false);
    expect(calculationInputsMatch(pendingInputs.calculation, changedJankenClears.calculation)).toBe(false);
    expect(calculationInputsMatch(pendingInputs.user, changedJankenClears.user)).toBe(false);
    expect(calculationInputsMatch(pendingInputs.calculation, changedJankenScore.calculation)).toBe(false);
    expect(calculationInputsMatch(pendingInputs.user, changedJankenScore.user)).toBe(false);
    expect(isUserCalculationPending(false, true, pendingInputs.user, provisionalInputs.user)).toBe(false);
  });

  it("settles with logged-in quantities when user-only inputs are recreated during renders", async () => {
    jest.useFakeTimers();
    jest.mocked(calculateShopApRequirement).mockClear();
    const loggedInState: ShopState = {
      ...state,
      itemQuantities: { "shop-item": 2 },
      existingPaymentItemQuantities: { "event-currency": 125_000 },
      selectedBonusStudentUids: ["recruited-student-1", "recruited-student-2"],
    };
    const appliedBonusRatio = {};
    const { result } = renderHook(() =>
      useShopCalculations({
        state: {
          ...loggedInState,
          selectedBonusStudentUids: [...loggedInState.selectedBonusStudentUids],
          selectedBonusStudentUidsByItem: { "shop-item": ["recruited-student-1"] },
        },
        stages,
        shopResources,
        appliedBonusRatio,
        jankenClearedStageUids: noClearedJankenStages,
        jankenStagePlays: noJankenStagePlays,
        jankenScore: { currentScore: 0, averageScore: null },
      }),
    );

    expect(result.current.isCalculating).toBe(true);
    expect(result.current.isReady).toBe(false);
    // The empty result before the first calculation is not a result.
    expect(result.current.hasResult).toBe(false);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });

    expect(result.current.isCalculating).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(result.current.hasResult).toBe(true);
    expect(calculateShopApRequirement).toHaveBeenCalledTimes(1);
  });

  it("stops calculating and reports a failure when the calculation throws", async () => {
    jest.useFakeTimers();
    const calculate = jest.mocked(calculateShopApRequirement);
    const succeed = calculate.getMockImplementation();
    if (!succeed) throw new Error("calculate mock has no implementation");
    calculate.mockClear();
    calculate.mockImplementation(() => {
      throw new Error("solver failed");
    });
    const appliedBonusRatio = {};
    const { result } = renderHook(() =>
      useShopCalculations({
        state,
        stages,
        shopResources,
        appliedBonusRatio,
        jankenClearedStageUids: noClearedJankenStages,
        jankenStagePlays: noJankenStagePlays,
        jankenScore: { currentScore: 0, averageScore: null },
      }),
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });

    expect(result.current.isCalculating).toBe(false);
    expect(result.current.calculationFailed).toBe(true);

    calculate.mockImplementation(succeed);
    act(() => {
      result.current.retryCalculation();
    });
    expect(result.current.calculationFailed).toBe(false);
    expect(result.current.isCalculating).toBe(true);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });

    expect(result.current.calculationFailed).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(calculate).toHaveBeenCalledTimes(2);
  });
});
