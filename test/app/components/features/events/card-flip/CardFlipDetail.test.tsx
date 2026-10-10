import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { CardFlipDetail } from "~/components/features/events/card-flip/CardFlipDetail";
import type { ItemBreakdownResult } from "~/components/features/events/shop/calculations/types";
import type { EventShopPlanContext } from "~/components/features/events/shop/ShopCalculatorScreen";
import type { MinigameConfig } from "~/domain/event-shop";
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
};
const cardData = {
  uid: "card-1",
  name: "축제의 추억",
  rarity: 4,
  imageUrl: "https://assets.baql.net/images/events/cards/group-a.webp",
  rewards: [candy],
};

function createConfig(cardFlip: NonNullable<MinigameConfig["cardFlip"]>): MinigameConfig {
  return {
    minigameType: "card_flip",
    payment: photoCard,
    payments: [photoCard],
    rewardGroups: [{ rounds: "subsequent", payments: [], rewards: [candy] }],
    cardFlip,
  };
}

function createPlan(
  cardFlip: NonNullable<MinigameConfig["cardFlip"]>,
  cardCount: number,
  existingPhotoCount = 50,
  candyEarned = cardCount * 2,
  candyExisting = 0,
): EventShopPlanContext {
  const itemBreakdown: ItemBreakdownResult["itemBreakdown"] = {
    existing: {
      ...(existingPhotoCount > 0 ? { "photo-card": existingPhotoCount } : {}),
      ...(candyExisting > 0 ? { candy: candyExisting } : {}),
    },
    fromFirstRun: {},
    fromRepeatedRuns: {},
    fromShop: {},
    toPlayMinigame: { "photo-card": cardCount * 200 },
    toBuyShopItems: {},
    fromMinigame: { candy: candyEarned },
    remaining: { "photo-card": 50, candy: candyExisting + candyEarned },
  };

  return {
    minigameConfig: createConfig(cardFlip),
    state: {
      minigamePlayCount: cardCount,
      overriddenRequiredQuantities: { "photo-card": 450 },
    },
    actions: { setMinigamePlayCount: () => {} },
    collectableResources: [
      { type: ResourceTypeEnum.Item, uid: "photo-card", name: "포토 카드", forPayment: true },
      { type: ResourceTypeEnum.Item, uid: "candy", name: "선물용 특산 계화과", forPayment: true },
    ],
    stageCalculations: { itemBreakdown } as ItemBreakdownResult,
    isCalculating: false,
  } as unknown as EventShopPlanContext;
}

function render(
  cardFlip: NonNullable<MinigameConfig["cardFlip"]>,
  cardCount: number,
  existingPhotoCount?: number,
  candyEarned?: number,
  candyExisting?: number,
): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(CardFlipDetail, {
        eventUid: "event-1",
        plan: createPlan(cardFlip, cardCount, existingPhotoCount, candyEarned, candyExisting),
      }),
    ),
  );
}

function expectSectionOrder(markup: string, firstSectionTitle: string, linkTitle: string): void {
  const rewardsIndex = markup.indexOf(firstSectionTitle);
  const planIndex = markup.indexOf("현재 계획");
  const linkIndex = markup.indexOf(linkTitle);

  expect(rewardsIndex).toBeGreaterThanOrEqual(0);
  expect(rewardsIndex).toBeLessThan(planIndex);
  expect(planIndex).toBeLessThan(linkIndex);
  expect((markup.match(/<section>/g) ?? []).length).toBe(2);
}

describe("CardFlipDetail", () => {
  it("shows card rewards, the shared current plan, then a calculator return link", () => {
    const markup = render(
      { status: "available", cardCost: photoCard, cards: [cardData, { ...cardData, uid: "card-2", name: null }] },
      2,
      0,
    );

    expectSectionOrder(markup, "카드별 보상 (2종)", "상점 계산기로 돌아가기");
    expect(markup).toContain("카드 2장 합계");
    expect(markup).toContain('value="2"');
    expect(markup).toContain("평균 획득 보상");
    expect(markup).toContain("입력한 목표 수량");
    expect(markup).toContain("450");
    expect((markup.match(/획득 수량/g) ?? []).length).toBe(1);
    expect(markup).toContain('href="/events/event-1/shop"');
  });

  it("offers card-count input at zero cards and keeps the calculator return link", () => {
    const markup = render({ status: "available", cardCost: photoCard, cards: [cardData] }, 0);

    expectSectionOrder(markup, "카드별 보상 (1종)", "상점 계산기로 돌아가기");
    expect(markup).toContain("뒤집을 카드 수");
    expect(markup).toContain('value="0"');
    expect(markup).toContain("위에서 카드 수를 입력하면");
    expect(markup).toContain("아직 뒤집을 카드 수를 입력하지 않았어요");
    expect(markup).toContain("카드 1장당 포토 카드 200개가 필요해요");
    expect(markup).toContain('href="/events/event-1/shop"');
    expect(markup).not.toContain("카드 0장 합계");
    expect(markup).not.toContain("평균 획득 보상");
  });

  it("hides resource cards and rows whose displayed quantities floor to zero", () => {
    const cardFlip = { status: "available" as const, cardCost: photoCard, cards: [cardData] };
    const hiddenCardMarkup = render(cardFlip, 2, 0, 0.75);

    expect(hiddenCardMarkup).not.toContain("획득 수량");
    expect((hiddenCardMarkup.match(/남은 수량/g) ?? []).length).toBe(1);

    const hiddenLinesMarkup = render(cardFlip, 2, 0, 0.75, 0.75);
    expect(hiddenLinesMarkup).toContain("획득 수량");
    expect(hiddenLinesMarkup).not.toContain("기존 보유");
    expect(hiddenLinesMarkup).not.toContain("카드 뒤집기 (평균)");
  });

  it.each([
    ["unavailable", "카드별 보상 정보가 아직 없어요"],
    ["invalid", "카드별 보상 정보를 불러오지 못했어요"],
  ] as const)("preserves current-plan order for %s card data", (status, message) => {
    const cardFlip =
      status === "unavailable" ? { status: "unavailable" as const } : { status: "invalid" as const };
    const markup = render(cardFlip, 2);

    expectSectionOrder(markup, message, "상점 계산기로 돌아가기");
    expect(markup).toContain("카드 2장 합계");
    if (status === "invalid") {
      const alertIndex = markup.indexOf('role="alert"');
      expect(alertIndex).toBeGreaterThanOrEqual(0);
      expect(alertIndex).toBeLessThan(markup.indexOf("현재 계획"));
      expect((markup.match(/role="alert"/g) ?? []).length).toBe(1);
    } else {
      expect(markup).not.toContain('role="alert"');
    }
  });
});
