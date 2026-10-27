/** @jest-environment jsdom */

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TextDecoder, TextEncoder } from "node:util";
import type { EventShopPlanContext } from "~/components/features/events/shop/ShopCalculatorScreen";
import type { RoadPuzzleStatsCalculation } from "~/components/features/events/shop/hooks/useRoadPuzzleStats";
import type { CalculationResult } from "~/components/features/events/shop/hooks/useShopCalculations";
import type { ShopActions, ShopState } from "~/components/features/events/shop/hooks";
import type { MinigameConfig, Stage } from "~/domain/event-shop";
import type { RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
import { ResourceTypeEnum } from "~/graphql/graphql";

let mockRoadPuzzleStatus: RoadPuzzleStatsCalculation["status"] = "pending";
let mockShopCalculationsReady = false;
let mockLastCalculationHold = false;

const emptyBreakdown = {
  fromFirstRun: {},
  fromRepeatedRuns: {},
  existing: {},
  fromShop: {},
  toPlayMinigame: {},
  toBuyShopItems: {},
  fromMinigame: {},
  remaining: {},
};

const emptyCalculationResult: CalculationResult = {
  stageRuns: {},
  unobtainableTargets: {},
  totalAp: 0,
  totalApWithExtras: 0,
  firstClearAp: 0,
  questSweepAp: 0,
  extraSweepAp: 0,
  itemBreakdown: emptyBreakdown,
};

const readyCalculationResult: CalculationResult = {
  ...emptyCalculationResult,
  stageRuns: { "stage-1": 5 },
  totalAp: 840,
  totalApWithExtras: 840,
  questSweepAp: 840,
};

const plannerState: ShopState = {
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
};

jest.mock("~/components/features/events/shop/hooks", () => ({
  useAutoSave: () => ({ isSaving: false, saveError: null, retrySave: jest.fn() }),
  useBonusCalculation: () => ({ appliedBonusRatios: {} }),
  useShopCalculations: (params: { holdCalculations?: boolean }) => {
    mockLastCalculationHold = Boolean(params.holdCalculations);
    const result = mockShopCalculationsReady ? readyCalculationResult : emptyCalculationResult;
    return {
      ...result,
      isCalculating: !mockShopCalculationsReady && !params.holdCalculations,
      isReady: mockShopCalculationsReady && !params.holdCalculations,
      isUserCalculating: false,
    };
  },
  useShopState: () => ({ state: plannerState, actions: {} }),
}));

jest.mock("~/components/features/events/shop/hooks/useRoadPuzzleStats", () => ({
  useRoadPuzzleStats: () => ({
    status: mockRoadPuzzleStatus,
    resultsByUid: mockRoadPuzzleStatus === "ready" ? { "map-1": roadPuzzleSolution } : {},
    completedMaps: mockRoadPuzzleStatus === "ready" ? 1 : 0,
    totalMaps: 1,
    elapsedMs: mockRoadPuzzleStatus === "ready" ? 1 : null,
    retry: jest.fn(),
  }),
}));

jest.mock("~/components/features/events/shop/hooks/useTreasureHuntStats", () => ({
  useTreasureHuntStats: () => ({ statsBySignature: {}, progress: null, retry: jest.fn() }),
}));

Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, "TextDecoder", { configurable: true, value: TextDecoder });

const { MemoryRouter } = require("react-router") as typeof import("react-router");
const EventDetailShopPage = require("~/components/features/events/EventDetailShopPage").default as typeof import("~/components/features/events/EventDetailShopPage").default;
const { CollectedTotalsSection } = require("~/components/features/events/shop/CollectedTotalsSection") as typeof import("~/components/features/events/shop/CollectedTotalsSection");
const { StageSelector } = require("~/components/features/events/shop/StageSelector") as typeof import("~/components/features/events/shop/StageSelector");

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
    railSetReward: [],
    rounds: [{ round: 1, isLoop: false, mapUids: ["map-1"], rewards: [], additionalRewards: [] }],
    maps: [{ uid: "map-1", name: "map-1", deck: { straight: 1, longCurve: 1, shortCurve: 1 }, tiles: [], fixedRails: [] }],
  },
};

const stages: Stage[] = [{ uid: "stage-1", index: "1-1", difficulty: 1, entryAp: 20, rewards: [] }];
const shopState = {
  enabledStages: { "stage-1": true },
  extraStageRuns: {},
  itemQuantities: {},
  itemPurchaseDays: {},
  existingPaymentItemQuantities: {},
  includeFirstClear: false,
  overriddenRequiredQuantities: {},
} as unknown as ShopState;
const stageCalculations: CalculationResult = {
  stageRuns: { "stage-1": 77 },
  unobtainableTargets: {},
  totalAp: 1_540,
  totalApWithExtras: 1_540,
  firstClearAp: 0,
  questSweepAp: 1_540,
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

function renderStageSelector(status: "pending" | "failed" | "missing") {
  return renderToStaticMarkup(
    createElement(StageSelector, {
      stages,
      appliedBonusRatio: {},
      stageRuns: stageCalculations.stageRuns,
      state: shopState,
      actions: {} as ShopActions,
      roadPuzzleStatus: status,
      onRetryRoadPuzzle: jest.fn(),
    }),
  );
}

function renderCollectedTotals(status: "pending" | "failed" | "missing") {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(CollectedTotalsSection, {
        stages,
        collectableResources: [],
        shopResources: [],
        eventUid: "event-1",
        shopStateUid: "shop-1",
        savedShopStateSource: "none",
        minigameConfig: null,
        treasureHuntStatus: undefined,
        roadPuzzleStatus: status,
        onRetryRoadPuzzle: jest.fn(),
        state: shopState,
        actions: {} as ShopActions,
        stageCalculations,
        signedIn: false,
      }),
    ),
  );
}

function renderPlannerScreen({
  stages: pageStages,
  appliedBonusRatio,
  state,
  actions,
  stageCalculations,
  holdRoadPuzzleCalculations,
  roadPuzzlePlannerStatus,
  collectableResources,
  shopResources,
  minigameConfigForCalculations,
  minigameRewards,
}: EventShopPlanContext) {
  return createElement(
    MemoryRouter,
    null,
    createElement(StageSelector, {
      stages: pageStages,
      appliedBonusRatio,
      stageRuns: holdRoadPuzzleCalculations ? {} : stageCalculations.stageRuns,
      state,
      actions,
      roadPuzzleStatus: roadPuzzlePlannerStatus,
    }),
    createElement(CollectedTotalsSection, {
      stages: pageStages,
      collectableResources,
      shopResources,
      eventUid: "10846",
      shopStateUid: "10846",
      savedShopStateSource: "none",
      minigameConfig: minigameConfigForCalculations,
      minigameRewards,
      roadPuzzleStatus: roadPuzzlePlannerStatus,
      state,
      actions,
      stageCalculations,
      signedIn: false,
    }),
  );
}

describe("road puzzle planner hold state", () => {
  it("does not render prior stage counts while calculation is pending", () => {
    const markup = renderStageSelector("pending");
    expect(markup).toContain("철도 연결 비용을 계산하고 있어요");
    expect(markup).toContain("animate-spin");
    expect(markup).not.toContain('value="77"');
  });

  it("does not render prior AP totals on failure and exposes retry", () => {
    const markup = renderCollectedTotals("failed");
    expect(markup).toContain("철도 연결 비용을 계산하지 못해 소탕 횟수와 필요한 AP를 보여드릴 수 없어요");
    expect(markup).not.toContain("1,540");
    expect(markup).toContain("다시 시도");
  });

  it("shows the explicit missing-data message in the planner", () => {
    expect(renderCollectedTotals("missing")).toContain("철도 연결 데이터를 찾지 못했어요");
  });

  it("keeps the planner held after worker results arrive until shop calculations are ready", () => {
    mockRoadPuzzleStatus = "pending";
    mockShopCalculationsReady = false;
    mockLastCalculationHold = false;

    const props = {
      stages,
      shopResources: [],
      ownedQuantities: null,
      eventRewardBonus: [],
      recruitedStudentUids: [],
      eventUid: "10846",
      shopStateUid: "10846",
      savedShopState: null,
      savedShopStateSource: "none" as const,
      availablePurchaseDays: 1,
      signedIn: false,
      minigameConfig: plannerConfig,
      renderScreen: renderPlannerScreen,
    };
    const view = render(createElement(EventDetailShopPage, props));

    expect(screen.getByText("철도 연결 비용을 계산하고 있어요")).toBeTruthy();
    expect(screen.getByText("계산 중")).toBeTruthy();
    expect(screen.queryByText("0회 소탕")).toBeNull();

    act(() => {
      mockRoadPuzzleStatus = "ready";
      view.rerender(createElement(EventDetailShopPage, props));
    });

    expect(mockLastCalculationHold).toBe(false);
    expect(screen.getByText("철도 연결 비용을 계산하고 있어요")).toBeTruthy();
    expect(screen.getByText("계산 중")).toBeTruthy();
    expect(screen.queryByText("0회 소탕")).toBeNull();
    expect(screen.queryByText("840")).toBeNull();

    act(() => {
      mockShopCalculationsReady = true;
      view.rerender(createElement(EventDetailShopPage, props));
    });

    expect(screen.queryByText("철도 연결 비용을 계산하고 있어요")).toBeNull();
    expect(screen.queryByText("계산 중")).toBeNull();
    expect(screen.getByText("5회 소탕")).toBeTruthy();
    expect(screen.getAllByText("840").length).toBeGreaterThan(0);
  });
});
