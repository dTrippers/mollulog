import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import EventDetailShopPage from "~/components/features/events/EventDetailShopPage";
import type { ItemBreakdownResult } from "~/components/features/events/shop/calculations/types";
import { cardFlipCardAccessibleName, summarizeCardFlipPlan } from "~/components/features/events/shop/card-flip";
import type { ShopActions, ShopState } from "~/components/features/events/shop/hooks";
import { MiniGameSection } from "~/components/features/events/shop/MiniGameSection";
import type { CollectableResource, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { eventCardImageUrl } from "~/models/assets";

let mockCardCount = 0;

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

const creditReward = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "credit",
  resourceName: "크레딧 포인트",
  quantity: 1_100_000,
  rarity: 3,
};

const plannedShopReward = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "shop-target",
  resourceName: "상점 목표 재화",
  quantity: 1,
};

const overriddenShopReward = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "override-target",
  resourceName: "입력한 목표 재화",
  quantity: 1,
};

const config: MinigameConfig = {
  minigameType: "card_flip",
  payment: photoCost,
  payments: [photoCost],
  rewardGroups: [{ rounds: "subsequent", payments: [], rewards: [candyReward] }],
  cardFlip: {
    status: "available",
    cardCost: photoCost,
    cards: [
      {
        uid: "card-1",
        name: "축제의 추억",
        rarity: 4,
        imageUrl: "https://assets.baql.net/images/events/cards/group-a.webp",
        rewards: [candyReward, creditReward, plannedShopReward, overriddenShopReward],
      },
    ],
  },
};

const collectableResources: CollectableResource[] = [
  { type: ResourceTypeEnum.Item, uid: "photo-card", name: "포토 카드", forPayment: true },
  { type: ResourceTypeEnum.Item, uid: "candy", name: "선물용 특산 계화과", forPayment: true },
  { type: ResourceTypeEnum.Item, uid: "credit", name: "크레딧 포인트", forPayment: false },
  { type: ResourceTypeEnum.Item, uid: "shop-target", name: "상점 목표 재화", forPayment: false },
  { type: ResourceTypeEnum.Item, uid: "override-target", name: "입력한 목표 재화", forPayment: false },
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

describe("card flip plan", () => {
  it("builds card images from the BAQL card-group UID without a fallback asset", () => {
    expect(eventCardImageUrl("group/1")).toBe("https://assets.baql.net/images/events/cards/group%2F1.webp");
  });

  it("summarizes per-card cost, total cost, average rewards, and related resource ledgers", () => {
    const summary = summarizeCardFlipPlan({
      config,
      cardCount: 4,
      collectableResources,
      itemBreakdown,
      overriddenRequiredQuantities: { "photo-card": 900 },
    });

    expect(summary).toMatchObject({
      cardCount: 4,
      perCardCosts: [{ resourceUid: "photo-card", quantity: 200 }],
      totalCosts: [{ resourceUid: "photo-card", quantity: 800 }],
      averageRewards: [{ resourceUid: "candy", quantity: 8 }],
      resources: [
        {
          resource: { uid: "photo-card" },
          breakdown: {
            requiredSubtotal: 800,
            acquiredSubtotal: 50,
            hasOverride: true,
            actualRequired: 900,
          },
        },
        {
          resource: { uid: "candy" },
          breakdown: {
            acquiredSubtotal: 8,
            acquiredLines: [{ label: "카드 뒤집기 (평균)", value: 8 }],
          },
        },
      ],
    });
    expect(summary?.resources.map(({ resource }) => resource.uid)).toEqual(["photo-card", "candy"]);
  });

  it("limits the plan summary to card costs and average-reward resources", () => {
    const summary = summarizeCardFlipPlan({
      config,
      cardCount: 4,
      collectableResources: [...collectableResources].reverse(),
      itemBreakdown: {
        ...itemBreakdown,
        toBuyShopItems: { "shop-target": 5 },
      },
      overriddenRequiredQuantities: { "override-target": 7 },
    });

    expect(summary?.resources.map(({ resource }) => resource.uid)).toEqual(["photo-card", "candy"]);
    expect(summary?.resources.map(({ resource }) => resource.uid)).not.toContain("shop-target");
    expect(summary?.resources.map(({ resource }) => resource.uid)).not.toContain("override-target");
    expect(summary?.resources.map(({ resource }) => resource.uid)).not.toContain("unrelated");
    expect(summary?.averageRewards).toMatchObject([{ resourceUid: "candy", quantity: 8 }]);
    expect(summary?.resources[0]?.breakdown.requiredLines).toEqual([{ label: "카드 뒤집기", value: 800 }]);
    expect(summary?.resources[1]?.breakdown.acquiredLines).toEqual([{ label: "카드 뒤집기 (평균)", value: 8 }]);
  });

  it("keeps plan resources stable when card detail data is unavailable or invalid", () => {
    const itemBreakdownWithCandy = {
      ...itemBreakdown,
      toPlayMinigame: { ...itemBreakdown.toPlayMinigame, candy: 6 },
      toBuyShopItems: { candy: 4 },
      fromMinigame: { ...itemBreakdown.fromMinigame, candy: 8 },
      remaining: { ...itemBreakdown.remaining, candy: 3 },
    };
    const summarizeForStatus = (cardFlip: NonNullable<MinigameConfig["cardFlip"]>) =>
      summarizeCardFlipPlan({
        config: { ...config, cardFlip },
        cardCount: 4,
        collectableResources,
        itemBreakdown: itemBreakdownWithCandy,
        overriddenRequiredQuantities: { candy: 20 },
      });

    const availableCardFlip = config.cardFlip;
    if (!availableCardFlip) {
      throw new Error("Expected the card-flip fixture to be available");
    }
    const summaries = [
      summarizeForStatus(availableCardFlip),
      summarizeForStatus({ status: "unavailable" }),
      summarizeForStatus({ status: "invalid" }),
    ];
    const candyResource = summaries[0]?.resources.find(({ resource }) => resource.uid === "candy");

    expect(summaries[1]).toEqual(summaries[0]);
    expect(summaries[2]).toEqual(summaries[0]);
    expect(candyResource?.breakdown).toMatchObject({
      requiredSubtotal: 10,
      acquiredSubtotal: 8,
      hasOverride: true,
      actualRequired: 20,
      remaining: 3,
    });
    expect(candyResource?.breakdown.acquiredLines).toEqual([{ label: "카드 뒤집기 (평균)", value: 8 }]);
  });

  it("does not show a calculated summary when no cards are planned", () => {
    expect(
      summarizeCardFlipPlan({
        config,
        cardCount: 0,
        collectableResources,
        itemBreakdown,
        overriddenRequiredQuantities: {},
      }),
    ).toBeNull();
  });

  it("builds an accessible card name from available identity and reward data only", () => {
    expect(
      cardFlipCardAccessibleName({
        uid: "card-1",
        name: "축제의 추억",
        rarity: 4,
        imageUrl: "https://assets.baql.net/images/events/cards/group-a.webp",
        rewards: [
          { ...candyReward, quantity: 2 },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "credit",
            resourceName: "크레딧 포인트",
            quantity: 1_100_000,
          },
        ],
      }),
    ).toBe("축제의 추억, SSR 등급, 선물용 특산 계화과 2개, 크레딧 포인트 1,100,000개");

    expect(
      cardFlipCardAccessibleName({ uid: "unknown", name: null, rarity: null, imageUrl: null, rewards: [candyReward] }),
    ).toBe("선물용 특산 계화과 2개");
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
  it("uses a card-count input, per-card and total costs, average rewards, and a detail link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(MiniGameSection, {
          config,
          eventUid: "event-1",
          state: { minigamePlayCount: 4 } as ShopState,
          actions: { setMinigamePlayCount: jest.fn() } as unknown as ShopActions,
          treasureHuntCalculation: null as never,
        }),
      ),
    );

    expect(markup).not.toContain('aria-describedby="card-flip-count-description"');
    expect(markup).not.toContain("카드를 1장 뒤집을 때마다 1로 세요");
    expect(markup).toContain("카드 1장당");
    expect(markup).toContain("카드 4장 합계");
    expect(markup).toContain("200");
    expect(markup).toContain("800");
    expect(markup).toContain("평균 획득 보상");
    expect(markup).toContain("평균값이라 실제 획득량은 달라질 수 있어요");
    expect(markup).toContain("카드 1종의 보상 구성과 현재 계획 요약을 확인해보세요");
    expect(markup).toContain('href="/events/event-1/shop/card-flip"');
    expect(markup).not.toContain("소모 재화 기준");
  });
});
