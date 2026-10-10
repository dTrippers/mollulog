import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { CardFlipDetail } from "~/components/features/events/card-flip/CardFlipDetail";
import type { ItemBreakdownResult } from "~/components/features/events/shop/calculations/types";
import type { EventShopPlanContext } from "~/components/features/events/shop/ShopCalculatorScreen";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { CardFlipData, MinigameConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const photoCard = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "photo-card",
  resourceName: "포토 카드",
  quantity: 200,
};
const candy = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "candy",
  resourceName: "사탕",
  quantity: 2,
  rarity: 2,
};
const cardData = {
  uid: "card-1",
  name: "축제의 추억",
  rarity: 4,
  imageUrl: "https://assets.baql.net/images/events/cards/group-a.webp",
  slots: [{ slot: 1, weight: 1 }],
  rewards: [candy],
};
const cardFlip: Extract<CardFlipData, { status: "available" }> = {
  status: "available",
  slotCount: 1,
  flipCosts: [200, 210, 220, 230].map((quantity, index) => ({
    flip: index + 1,
    payments: [{ ...photoCard, quantity }],
  })),
  drawRules: { initialGroup: 1, maxDrawCount: 4, advanceOnRarities: [1, 2] },
  cards: [cardData, { ...cardData, uid: "card-2", name: null }],
};

function createConfig(): MinigameConfig {
  return {
    minigameType: "card_flip",
    payment: photoCard,
    payments: [photoCard],
    rewardGroups: [{ rounds: "subsequent", payments: [], rewards: [{ ...candy, quantity: 100 }] }],
    cardFlip,
  };
}

function createPlan(cardCount: number, strategy: "one-open" | "sr-reset" | "all-open" = "all-open") {
  const itemBreakdown: ItemBreakdownResult["itemBreakdown"] = {
    existing: { "photo-card": 50 },
    fromFirstRun: {},
    fromRepeatedRuns: {},
    fromShop: {},
    toPlayMinigame: { "photo-card": cardCount * 200 },
    toBuyShopItems: {},
    fromMinigame: { candy: cardCount * 2 },
    remaining: { "photo-card": 50, candy: cardCount * 2 },
  };
  return {
    minigameConfig: createConfig(),
    cardFlipComparison: calculateCardFlipStrategyComparison(cardFlip, cardCount),
    state: {
      minigamePlayCount: cardCount,
      cardFlipStrategy: strategy,
      overriddenRequiredQuantities: { "photo-card": 450 },
    },
    actions: { setMinigamePlayCount: jest.fn(), setCardFlipStrategy: jest.fn() },
    collectableResources: [
      { type: ResourceTypeEnum.Item, uid: "photo-card", name: "포토 카드", forPayment: true },
      { type: ResourceTypeEnum.Item, uid: "candy", name: "사탕", forPayment: true },
    ],
    stageCalculations: { itemBreakdown } as ItemBreakdownResult,
    isCalculating: false,
  } as unknown as EventShopPlanContext;
}

function render(cardCount: number, strategy?: "one-open" | "sr-reset" | "all-open"): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(CardFlipDetail, { eventUid: "event-1", plan: createPlan(cardCount, strategy) }),
    ),
  );
}

describe("CardFlipDetail", () => {
  it("orders comparison, current plan, card rewards and the shop link with one card-count input", () => {
    const markup = render(2);
    const comparisonIndex = markup.indexOf("전략별 비교");
    const planIndex = markup.indexOf("현재 계획");
    const cardListIndex = markup.indexOf("카드별 보상 (2종)");
    const linkIndex = markup.indexOf("상점 계산기로 돌아가기");

    expect(comparisonIndex).toBeGreaterThanOrEqual(0);
    expect(comparisonIndex).toBeLessThan(planIndex);
    expect(planIndex).toBeLessThan(cardListIndex);
    expect(cardListIndex).toBeLessThan(linkIndex);
    expect((markup.match(/id="card-flip-detail-play-count"/g) ?? []).length).toBe(1);
    expect(markup).not.toContain("id=\"card-flip-play-count\"");
    expect(markup).toContain("4장 모두 뒤집기");
    expect(markup).toContain("소비 재화");
    expect(markup).toContain("기대 획득 보상");
    expect(markup).toContain("기대값이라 실제 획득량은 달라질 수 있어요");
    expect(markup).toContain('href="/events/event-1/shop"');
    expect(markup).not.toContain("카드 2장 합계");
    expect(markup).not.toContain("평균 획득 보상");
  });

  it("shows only the input guidance and strategy headers at zero cards", () => {
    const markup = render(0);

    expect(markup).toContain("뒤집을 카드 수를 입력해 주세요");
    expect(markup).toContain("카드 수를 입력하면 전략별 소비 재화와 획득 보상을 비교할 수 있어요");
    expect(markup).toContain('value="0"');
    expect(markup).toContain('checked=""');
    expect(markup).not.toContain("현재 계획");
    expect(markup).not.toContain("획득 보상</p>");
    expect(markup).not.toContain("0.0");
    expect(markup).toContain("뒤집는 순서별 소비 재화: 1장째 포토 카드 200개");
  });

  it("uses the selected strategy for current-plan resources and keeps those rows separate", () => {
    const markup = render(2, "sr-reset");
    const currentPlan = markup.slice(markup.indexOf("현재 계획"), markup.indexOf("카드별 보상 (2종)"));

    expect(markup).not.toContain("계획에 반영 중");
    expect(currentPlan).toContain("SR 이상 획득 시 셔플");
    expect(currentPlan).toContain("소비 재화");
    expect(currentPlan).toContain("기대 획득 보상");
    expect(currentPlan).toContain("기대값");
    expect(currentPlan).toContain("candy.webp");
  });

  it.each([
    ["unavailable", "카드별 보상 정보가 아직 없어요"],
    ["invalid", "카드별 보상 정보를 불러오지 못했어요"],
  ] as const)("retains the card reward state for %s data without legacy calculations", (status, message) => {
    const invalid = status === "invalid" ? { status: "invalid" as const } : { status: "unavailable" as const };
    const plan = createPlan(2) as unknown as EventShopPlanContext;
    plan.minigameConfig = { ...createConfig(), cardFlip: invalid };
    plan.cardFlipComparison = null;
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(CardFlipDetail, { eventUid: "event-1", plan }),
      ),
    );

    expect(markup).toContain(message);
    expect(markup).not.toContain("현재 계획");
    expect(markup).not.toContain("기대 획득 보상");
  });
});
