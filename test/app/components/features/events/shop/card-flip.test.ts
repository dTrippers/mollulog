import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import EventDetailShopPage from "~/components/features/events/EventDetailShopPage";
import type { ItemBreakdownResult } from "~/components/features/events/shop/calculations/types";
import { cardFlipCardAccessibleName, summarizeCardFlipPlan } from "~/components/features/events/shop/card-flip";
import type { ShopActions, ShopState } from "~/components/features/events/shop/hooks";
import { MiniGameSection } from "~/components/features/events/shop/MiniGameSection";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { CollectableResource, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { eventCardImageUrl } from "~/models/assets";

let mockCardCount = 0;
let mockCardFlipStrategy: "one-open" | "sr-reset" | "all-open" = "all-open";

jest.mock("~/components/features/events/shop/hooks", () => ({
  useAutoSave: () => ({ isSaving: false, saveError: null, retrySave: () => {} }),
  useBonusCalculation: () => ({ appliedBonusRatios: {} }),
  useShopCalculations: () => ({
    isCalculating: false,
    isUserCalculating: false,
    itemBreakdown: {
      existing: {},
      fromFirstRun: {},
      fromRepeatedRuns: {},
      fromShop: {},
      toPlayMinigame: {},
      toBuyShopItems: {},
      fromMinigame: {},
      remaining: {},
    },
  }),
  useShopState: () => ({
    state: {
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
      minigamePlayCount: mockCardCount,
      minigamePaymentQuantityMode: "expected",
      cardFlipStrategy: mockCardFlipStrategy,
      overriddenRequiredQuantities: {},
    },
    actions: {},
  }),
}));

jest.mock("~/components/features/events/shop/hooks/useTreasureHuntStats", () => ({
  useTreasureHuntStats: () => ({ statsBySignature: {}, progress: null, retry: () => {} }),
}));

const photoCost = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "photo-card",
  resourceName: "즉석 기념 포토 카드 컬렉션",
  quantity: 200,
};
const candyReward = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "candy",
  resourceName: "선물용 특산 계화과",
  quantity: 2,
  rarity: 2,
};
const config: MinigameConfig = {
  minigameType: "card_flip",
  payment: photoCost,
  payments: [photoCost],
  rewardGroups: [{ rounds: "subsequent", payments: [], rewards: [{ ...candyReward, quantity: 100 }] }],
  cardFlip: {
    status: "available",
    slotCount: 1,
    flipCosts: [{ flip: 1, payments: [photoCost] }],
    drawRules: { initialGroup: 1, maxDrawCount: 1, advanceOnRarities: [] },
    cards: [
      {
        uid: "card-1",
        name: "축제의 추억",
        rarity: 4,
        imageUrl: "https://assets.baql.net/images/events/cards/group-a.webp",
        slots: [{ slot: 1, weight: 1 }],
        rewards: [candyReward],
      },
    ],
  },
};
const cardFlipData = config.cardFlip;
if (cardFlipData?.status !== "available") throw new Error("Expected an available card flip fixture");
const cardFlip = cardFlipData as Extract<NonNullable<MinigameConfig["cardFlip"]>, { status: "available" }>;
const comparison = calculateCardFlipStrategyComparison(cardFlip, 4);
const selected = comparison.find(({ strategy }) => strategy === "all-open");
if (!selected) throw new Error("Expected an all-open strategy fixture");

const collectableResources: CollectableResource[] = [
  { type: ResourceTypeEnum.Item, uid: "photo-card", name: "포토 카드", forPayment: true },
  { type: ResourceTypeEnum.Item, uid: "candy", name: "선물용 특산 계화과", forPayment: true },
  { type: ResourceTypeEnum.Item, uid: "unrelated", name: "기타 재화", forPayment: false },
];
const itemBreakdown: ItemBreakdownResult["itemBreakdown"] = {
  existing: { "photo-card": 50 },
  fromFirstRun: {},
  fromRepeatedRuns: {},
  fromShop: {},
  toPlayMinigame: { "photo-card": 800 },
  toBuyShopItems: {},
  fromMinigame: { candy: 8 },
  remaining: { "photo-card": 50, candy: 8 },
};
const planSummaryInput = {
  config,
  cardCount: 4,
  strategy: "all-open" as const,
  costs: selected.costs,
  rewards: selected.rewards,
  collectableResources,
  itemBreakdown,
  overriddenRequiredQuantities: { "photo-card": 900 },
};

describe("card flip plan", () => {
  it("builds card images from the BAQL card-group UID without a fallback asset", () => {
    expect(eventCardImageUrl("group/1")).toBe("https://assets.baql.net/images/events/cards/group%2F1.webp");
  });

  it("summarizes only the selected strategy values and related resource ledgers", () => {
    const summary = summarizeCardFlipPlan(planSummaryInput);

    expect(summary).toMatchObject({
      cardCount: 4,
      strategy: "all-open",
      costs: [{ resourceUid: "photo-card", quantity: 800 }],
      rewards: [{ resourceUid: "candy", quantity: 8 }],
      resources: [
        {
          resource: { uid: "photo-card" },
          breakdown: { requiredSubtotal: 800, acquiredSubtotal: 50, hasOverride: true, actualRequired: 900 },
        },
        {
          resource: { uid: "candy" },
          breakdown: {
            acquiredSubtotal: 8,
            acquiredLines: [{ label: "카드 뒤집기 (기대값)", value: 8 }],
          },
        },
      ],
    });
    expect(summary?.resources.map(({ resource }) => resource.uid)).toEqual(["photo-card", "candy"]);
  });

  it("limits related-resource ledgers to the selected costs and rewards without recalculating reward groups", () => {
    const summary = summarizeCardFlipPlan({
      ...planSummaryInput,
      collectableResources: [...collectableResources].reverse(),
      itemBreakdown: { ...itemBreakdown, toBuyShopItems: { unrelated: 5 } },
      overriddenRequiredQuantities: { unrelated: 7 },
    });

    expect(summary?.resources.map(({ resource }) => resource.uid)).toEqual(["photo-card", "candy"]);
    expect(summary?.resources.map(({ resource }) => resource.uid)).not.toContain("unrelated");
    expect(summary?.resources[0]?.breakdown.requiredLines).toEqual([{ label: "카드 뒤집기", value: 800 }]);
    expect(summary?.resources[1]?.breakdown.acquiredLines).toEqual([{ label: "카드 뒤집기 (기대값)", value: 8 }]);
  });

  it("does not create a current-plan summary for zero cards or unavailable card data", () => {
    expect(summarizeCardFlipPlan({ ...planSummaryInput, cardCount: 0 })).toBeNull();
    expect(
      summarizeCardFlipPlan({
        ...planSummaryInput,
        config: { ...config, cardFlip: { status: "invalid" } },
      }),
    ).toBeNull();
  });

  it("builds an accessible card name from available identity and reward data only", () => {
    const card = cardFlip.cards[0];
    expect(cardFlipCardAccessibleName(card)).toBe("축제의 추억, SSR 등급, 선물용 특산 계화과 2개");
    expect(cardFlipCardAccessibleName({ ...card, name: null, rarity: null })).toBe("선물용 특산 계화과 2개");
  });
});

describe("EventDetailShopPage collectable resources for card flip", () => {
  const shopResources: ShopResource[] = [
    {
      uid: "shop-resource",
      resource: { type: ResourceTypeEnum.Item, uid: "shop-item", name: "상점 상품", rarity: 1 },
      resourceAmount: 1,
      paymentResource: { type: ResourceTypeEnum.Item, uid: "candy", name: "계화과" },
      purchaseTiers: [],
      shopAmount: 1,
    },
    {
      uid: "ticket-shop-resource",
      resource: { type: ResourceTypeEnum.Item, uid: "ticket-shop-item", name: "추가 상품", rarity: 1 },
      resourceAmount: 1,
      paymentResource: { type: ResourceTypeEnum.Item, uid: "facility-ticket", name: "시설 입장권" },
      purchaseTiers: [],
      shopAmount: 1,
    },
  ];
  const stages: Stage[] = [
    {
      uid: "stage-1",
      entryAp: 10,
      index: "9",
      difficulty: 1,
      rewards: [
        {
          amount: 1,
          rewardRequirement: null,
          chance: null,
          item: { uid: "stage-coin", name: "스테이지 재화", category: "coin", rarity: 1 },
        },
      ],
    },
  ];

  function collectableUidsForCardCount(cardCount: number): string[] {
    mockCardCount = cardCount;
    let resourceUids: string[] = [];
    renderToStaticMarkup(
      createElement(EventDetailShopPage, {
        stages,
        shopResources,
        ownedQuantities: null,
        eventRewardBonus: [],
        recruitedStudentUids: [],
        eventUid: "859",
        shopStateUid: "859",
        savedShopState: null,
        savedShopStateSource: "none",
        availablePurchaseDays: 1,
        signedIn: false,
        minigameConfig: config,
        renderScreen: (plan) => {
          resourceUids = plan.collectableResources.map(({ uid }) => uid);
          expect(plan.cardFlipComparison).toHaveLength(3);
          const currentResult = calculateCardFlipStrategyComparison(cardFlip, cardCount).find(
            ({ strategy }) => strategy === "all-open",
          );
          expect(plan.minigamePaymentCosts).toEqual(currentResult?.costs);
          expect(plan.minigameRewards).toEqual(currentResult?.rewards);
          return null;
        },
      }),
    );
    return resourceUids;
  }

  it("does not add individual card rewards to final-result input resources at zero or four cards", () => {
    const expectedExistingResources = ["candy", "facility-ticket", "stage-coin", "photo-card"];

    expect(collectableUidsForCardCount(0)).toEqual(expectedExistingResources);
    expect(collectableUidsForCardCount(4)).toEqual(expectedExistingResources);
  });
});

describe("MiniGameSection for card flip", () => {
  it("shows one card-count input, short strategy labels, selected results, and a detail link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(MiniGameSection, {
          config,
          eventUid: "event-1",
          state: { minigamePlayCount: 4, cardFlipStrategy: "all-open" } as ShopState,
          actions: {
            setMinigamePlayCount: jest.fn(),
            setCardFlipStrategy: jest.fn(),
          } as unknown as ShopActions,
          treasureHuntCalculation: null as never,
          cardFlipComparison: comparison,
        }),
      ),
    );

    expect(markup).toContain("1장만 열기");
    expect(markup).toContain("SR 이상 셔플");
    expect(markup).toContain("모두 열기");
    expect(markup).toContain("모두 열기 · 항상 1장을 모두 열어요");
    expect(markup).toContain("소비 재화");
    expect(markup).toContain("기대 획득 보상");
    expect(markup).toContain("기대값이라 실제 획득량은 달라질 수 있어요");
    expect(markup).toContain("세 전략의 소비 재화·획득 보상과 카드 1종의 보상 구성을 확인해보세요");
    expect(markup).toContain('href="/events/event-1/shop/card-flip"');
    expect(markup).not.toContain("1,000개당");
    expect(markup).not.toContain("기대 소비");
  });
});
