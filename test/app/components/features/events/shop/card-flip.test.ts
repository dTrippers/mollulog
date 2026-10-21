import { describe, expect, it } from "@jest/globals";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { CollectableResource, MinigameConfig } from "~/domain/event-shop";
import type { ItemBreakdownResult } from "~/domain/event-shop/calculations/types";
import { cardFlipCardAccessibleName, summarizeCardFlipPlan } from "~/domain/event-shop/card-flip";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { eventCardImageUrl } from "~/models/assets";

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
const cardFlip = config.cardFlip;
if (cardFlip?.status !== "available") throw new Error("Expected an available card flip fixture");
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

describe("card flip plan domain", () => {
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

  it("limits related-resource ledgers to selected costs and rewards", () => {
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

  it("does not create a summary for zero cards or unavailable card data", () => {
    expect(summarizeCardFlipPlan({ ...planSummaryInput, cardCount: 0 })).toBeNull();
    expect(
      summarizeCardFlipPlan({ ...planSummaryInput, config: { ...config, cardFlip: { status: "invalid" } } }),
    ).toBeNull();
  });

  it("builds an accessible card name from available identity and reward data only", () => {
    const card = cardFlip.cards[0];
    expect(cardFlipCardAccessibleName(card)).toBe("축제의 추억, SSR 등급, 선물용 특산 계화과 2개");
    expect(cardFlipCardAccessibleName({ ...card, name: null, rarity: null })).toBe("선물용 특산 계화과 2개");
  });

  it("does not expose a Latin source label when a Korean student name is unavailable", () => {
    const card = cardFlip.cards[0];
    expect(cardFlipCardAccessibleName({ ...card, name: "KISAKI(SWIMSUIT)" })).toBe(
      "학생 이름을 확인할 수 없어요, SSR 등급, 선물용 특산 계화과 2개",
    );
  });
});
