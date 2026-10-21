import type { CardFlipStrategyResult } from "~/domain/card-flip-strategy";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { CardFlipData, MinigameConfig } from "~/domain/event-shop";
import type { CalculationResult } from "~/domain/event-shop/calculations";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { ShopActions, ShopState } from "~/lib/event-shop/hooks/useShopState";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";

const emptyCalculation: CalculationResult = {
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

const emptyState: ShopState = {
  itemQuantities: {},
  itemPurchaseDays: {},
  selectedBonusStudentUids: [],
  bonusStudentSelectionMode: "shared",
  selectedBonusStudentUidsByItem: {},
  includeRecruitedStudents: true,
  enabledStages: {},
  existingPaymentItemQuantities: {},
  includeFirstClear: false,
  extraStageRuns: {},
  minigameStartRound: 1,
  minigamePlayCount: 0,
  minigamePaymentQuantityMode: "expected",
  cardFlipStrategy: "all-open",
  overriddenRequiredQuantities: {},
};

const noAction = () => undefined;
const emptyActions: ShopActions = {
  updateItemQuantity: noAction,
  updateItemQuantities: noAction,
  updateItemPurchaseDay: noAction,
  updateItemPurchaseDays: noAction,
  toggleBonusStudent: noAction,
  setBonusStudents: noAction,
  setBonusStudentSelectionMode: noAction,
  toggleBonusStudentForItem: noAction,
  setBonusStudentForItems: noAction,
  setBonusStudentsForItems: noAction,
  setIncludeRecruitedStudents: noAction,
  toggleStage: noAction,
  updateExtraRuns: noAction,
  setIncludeFirstClear: noAction,
  setMinigameStartRound: noAction,
  setMinigamePlayCount: noAction,
  setMinigamePaymentQuantityMode: noAction,
  setCardFlipStrategy: noAction,
  updateExistingQuantity: noAction,
  updateOverriddenRequired: noAction,
  resetOverriddenRequired: noAction,
};

export function createEventShopPlan(overrides: Partial<EventShopPlanContext> = {}): EventShopPlanContext {
  return {
    stages: [],
    shopResources: [],
    ownedQuantities: null,
    eventRewardBonus: [],
    appliedBonusRatio: {},
    recruitedStudentUids: [],
    eventUid: "event-1",
    shopStateUid: "event-1",
    savedShopStateSource: "none",
    availablePurchaseDays: 0,
    signedIn: false,
    state: emptyState,
    actions: emptyActions,
    minigameConfig: null,
    minigameConfigForCalculations: null,
    collectableResources: [],
    clueSearchExchange: null,
    treasureHuntCalculation: {
      status: "empty",
      progress: null,
      rows: [],
      statsBySignature: {},
      estimate: null,
      retry: noAction,
    },
    holdTreasureHuntCalculations: false,
    roadPuzzleCalculation: {
      status: "idle",
      resultsByUid: {},
      completedMaps: 0,
      totalMaps: 0,
      elapsedMs: null,
      retry: noAction,
    },
    holdRoadPuzzleCalculations: false,
    resultTreasureHuntStatus: undefined,
    minigamePaymentCosts: undefined,
    minigameRewards: undefined,
    cardFlipComparison: null,
    stageCalculations: emptyCalculation,
    isCalculating: false,
    ...overrides,
  };
}

export function createCardFlipPlan(overrides: Partial<EventShopPlanContext> = {}): EventShopPlanContext {
  const payment = {
    resourceType: ResourceTypeEnum.Item,
    resourceUid: "photo-card",
    resourceName: "포토 카드",
    quantity: 10,
  };
  const cardFlip: CardFlipData = {
    status: "available",
    slotCount: 1,
    flipCosts: [{ flip: 1, payments: [payment] }],
    drawRules: { initialGroup: 1, maxDrawCount: 1, advanceOnRarities: [] },
    cards: [
      {
        uid: "card-1",
        name: "축제의 추억",
        rarity: 4,
        imageUrl: "https://assets.example/card.webp",
        slots: [{ slot: 1, weight: 1 }],
        rewards: [
          { resourceType: ResourceTypeEnum.Item, resourceUid: "gift", resourceName: "이벤트 선물", quantity: 3 },
        ],
      },
    ],
  };
  const config: MinigameConfig = {
    minigameType: "card_flip",
    payment,
    payments: [payment],
    rewardGroups: [],
    cardFlip,
  };
  const comparison: CardFlipStrategyResult[] = calculateCardFlipStrategyComparison(cardFlip, 1);
  return createEventShopPlan({
    minigameConfig: config,
    minigameConfigForCalculations: config,
    cardFlipComparison: comparison,
    state: { ...emptyState, minigamePlayCount: 1 },
    ...overrides,
  });
}
