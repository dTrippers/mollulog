/** @jest-environment jsdom */
import { describe, expect, it, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import type { CalculationResult } from "~/domain/event-shop/calculations";
import type { MinigameConfig, Stage } from "~/domain/event-shop";
import type { RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { RoadPuzzleStatsCalculation } from "~/lib/event-shop/hooks/useRoadPuzzleStats";
import type { ShopState } from "~/lib/event-shop/hooks/useShopState";
import { type EventShopControllerInput, useEventShopPlan } from "~/lib/event-shop/useEventShopPlan";

let mockRoadPuzzleStatus: RoadPuzzleStatsCalculation["status"] = "pending";
let mockShopCalculationsReady = false;
let mockLastCalculationHold = false;

const emptyCalculationResult: CalculationResult = {
  stageRuns: {},
  unobtainableTargets: {},
  totalAp: 0,
  totalApWithExtras: 0,
  firstClearAp: 0,
  questSweepAp: 0,
  extraSweepAp: 0,
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

const plannerState = {
  itemQuantities: {},
  itemPurchaseDays: {},
  selectedBonusStudentUids: [],
  bonusStudentSelectionMode: "shared",
  selectedBonusStudentUidsByItem: {},
  includeRecruitedStudents: true,
  enabledStages: { "stage-1": true },
  existingPaymentItemQuantities: {},
  includeFirstClear: false,
  extraStageRuns: {},
  minigameStartRound: 1,
  minigamePlayCount: 1,
  minigamePaymentQuantityMode: "expected",
  cardFlipStrategy: "all-open",
  overriddenRequiredQuantities: {},
} as ShopState;

const roadPuzzleSolution: RoadPuzzleSolution = {
  paretoVectors: [],
  minimumVector: { straight: 1, longCurve: 0, shortCurve: 0 },
  witness: [],
  minimumTiles: 1,
  maximumTiles: 6,
  expectedTiles: 2,
  minimumStickers: 150,
  maximumStickers: 900,
  expectedStickers: 300,
};

jest.mock("~/lib/event-shop/hooks", () => ({
  useAutoSave: () => ({ isSaving: false, saveError: null, retrySave: jest.fn() }),
  useBonusCalculation: () => ({ appliedBonusRatios: {} }),
  useShopCalculations: (params: { holdCalculations?: boolean }) => {
    mockLastCalculationHold = Boolean(params.holdCalculations);
    return {
      ...emptyCalculationResult,
      isCalculating: !mockShopCalculationsReady && !params.holdCalculations,
      isReady: mockShopCalculationsReady && !params.holdCalculations,
      isUserCalculating: false,
    };
  },
  useShopState: () => ({ state: plannerState, actions: {} }),
}));

jest.mock("~/lib/event-shop/hooks/useRoadPuzzleStats", () => ({
  useRoadPuzzleStats: () => ({
    status: mockRoadPuzzleStatus,
    resultsByUid: mockRoadPuzzleStatus === "ready" ? { "map-1": roadPuzzleSolution } : {},
    completedMaps: mockRoadPuzzleStatus === "ready" ? 1 : 0,
    totalMaps: 1,
    elapsedMs: mockRoadPuzzleStatus === "ready" ? 1 : null,
    retry: jest.fn(),
  }),
}));

jest.mock("~/lib/event-shop/hooks/useTreasureHuntStats", () => ({
  useTreasureHuntStats: () => ({ statsBySignature: {}, progress: null, retry: jest.fn() }),
}));

const reward = (resourceUid: string) => ({ resourceType: ResourceTypeEnum.Item, resourceUid, quantity: 1 });

const plannerConfig: MinigameConfig = {
  minigameType: "road_puzzle",
  payment: {
    resourceType: ResourceTypeEnum.Item,
    resourceUid: "sticker",
    resourceName: "하이랜더 기념 스티커",
    quantity: 150,
  },
  payments: [],
  rewardGroups: [],
  roadPuzzle: {
    instantClearRound: 7,
    railSetReward: [reward("rail-set-reward")],
    rounds: [
      {
        round: 1,
        isLoop: false,
        mapUids: ["map-1"],
        rewards: [reward("round-reward")],
        additionalRewards: [reward("additional-reward")],
      },
    ],
    maps: [{ uid: "map-1", name: "map-1", deck: { straight: 1, longCurve: 1, shortCurve: 1 }, tiles: [], fixedRails: [] }],
  },
};

const stages: Stage[] = [{ uid: "stage-1", index: "1-1", difficulty: 1, entryAp: 20, rewards: [] }];

const input: EventShopControllerInput = {
  stages,
  shopResources: [],
  ownedQuantities: null,
  eventRewardBonus: [],
  recruitedStudentUids: [],
  eventUid: "10846",
  shopStateUid: "10846",
  savedShopState: null,
  savedShopStateSource: "none",
  availablePurchaseDays: 1,
  signedIn: false,
  guestPlannerStatus: "ready",
  minigameConfig: plannerConfig,
};

describe("useEventShopPlan road puzzle hold", () => {
  it("keeps the planner held after worker results arrive until shop calculations are ready", () => {
    mockRoadPuzzleStatus = "pending";
    mockShopCalculationsReady = false;
    const { result, rerender } = renderHook(() => useEventShopPlan(input));

    expect(mockLastCalculationHold).toBe(true);
    expect(result.current.plan.roadPuzzlePlannerStatus).toBe("pending");
    expect(result.current.plan.minigameConfigForCalculations).toBeNull();

    mockRoadPuzzleStatus = "ready";
    rerender();
    expect(mockLastCalculationHold).toBe(false);
    expect(result.current.plan.minigamePaymentCosts).toEqual([{ ...plannerConfig.payment, quantity: 300 }]);
    expect(result.current.plan.roadPuzzlePlannerStatus).toBe("pending");

    mockShopCalculationsReady = true;
    rerender();
    expect(result.current.plan.roadPuzzlePlannerStatus).toBeUndefined();
    expect(result.current.plan.holdRoadPuzzleCalculations).toBe(false);
  });

  it("reports a failed worker as a failed planner state", () => {
    mockRoadPuzzleStatus = "failed";
    mockShopCalculationsReady = true;
    const { result } = renderHook(() => useEventShopPlan(input));

    expect(result.current.plan.roadPuzzlePlannerStatus).toBe("failed");
  });

  it("reports missing road puzzle data explicitly", () => {
    mockRoadPuzzleStatus = "idle";
    mockShopCalculationsReady = true;
    const { result } = renderHook(() =>
      useEventShopPlan({ ...input, minigameConfig: { ...plannerConfig, roadPuzzle: undefined } }),
    );

    expect(result.current.plan.roadPuzzlePlannerStatus).toBe("missing");
  });

  it("passes only farming resources, not rail puzzle rewards, to the final result", () => {
    mockRoadPuzzleStatus = "ready";
    mockShopCalculationsReady = true;
    const { result } = renderHook(() => useEventShopPlan(input));

    expect(result.current.plan.collectableResources.map(({ uid }) => uid)).toEqual(["sticker"]);
  });
});
