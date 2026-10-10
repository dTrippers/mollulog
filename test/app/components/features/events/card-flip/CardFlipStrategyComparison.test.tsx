import { describe, expect, it, jest } from "@jest/globals";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardFlipStrategyComparison } from "~/components/features/events/card-flip/CardFlipStrategyComparison";
import type { EventShopPlanContext } from "~/components/features/events/shop/ShopCalculatorScreen";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { CardFlipData } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const photoCard = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "photo-card",
  resourceName: "포토 카드",
  quantity: 200,
};
const cardFlip: Extract<CardFlipData, { status: "available" }> = {
  status: "available",
  slotCount: 2,
  flipCosts: [200, 210, 220, 230].map((quantity, index) => ({
    flip: index + 1,
    payments: [{ ...photoCard, quantity }],
  })),
  drawRules: { initialGroup: 1, maxDrawCount: 4, advanceOnRarities: [] },
  cards: [
    {
      uid: "normal",
      name: "일반 카드",
      rarity: 1,
      imageUrl: null,
      slots: [{ slot: 1, weight: 1 }],
      rewards: [
        {
          resourceType: ResourceTypeEnum.Item,
          resourceUid: "gift",
          resourceName: "선물용 특산 계화과",
          quantity: 5,
        },
      ],
    },
  ],
};
const comparison = calculateCardFlipStrategyComparison(cardFlip, 1000);

function createPlan(cardCount = 1000, strategy: "one-open" | "sr-reset" | "all-open" = "all-open") {
  return {
    state: { minigamePlayCount: cardCount, cardFlipStrategy: strategy },
    actions: { setMinigamePlayCount: jest.fn(), setCardFlipStrategy: jest.fn() },
  } as unknown as EventShopPlanContext;
}

function render(cardCount = 1000) {
  return renderToStaticMarkup(
    createElement(CardFlipStrategyComparison, {
      plan: createPlan(cardCount),
      cardFlip,
      comparison: calculateCardFlipStrategyComparison(cardFlip, cardCount),
    }),
  );
}

function findElements(node: ReactNode, type: string): ReactElement[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as ReactElement<{ children?: ReactNode }>;
    return [...(element.type === type ? [element] : []), ...findElements(element.props.children, type)];
  });
}

describe("CardFlipStrategyComparison", () => {
  it("renders one accessible radio group with three name-only radio labels and separate cost/reward blocks", () => {
    const markup = render();

    expect(markup).toContain('<fieldset class="mt-4">');
    expect(markup).toContain('<legend class="sr-only">카드 뒤집기 전략</legend>');
    expect(markup).toContain('aria-labelledby="card-flip-strategy-one-open-label"');
    expect(markup).toContain('aria-describedby="card-flip-strategy-one-open-rule"');
    expect(markup).toContain('aria-labelledby="card-flip-strategy-sr-reset-label"');
    expect(markup).toContain('aria-labelledby="card-flip-strategy-all-open-label"');
    expect((markup.match(/name="card-flip-strategy"/g) ?? []).length).toBe(3);
    expect((markup.match(/>소비 재화<\/p>/g) ?? []).length).toBe(3);
    expect((markup.match(/>획득 보상<\/p>/g) ?? []).length).toBe(3);
    expect((markup.match(/<table/g) ?? []).length).toBe(3);
    expect(markup).toContain("기대량");
    expect(markup).toContain("100장당");
    expect(markup).toContain("포토 카드");
    expect(markup).toContain("선물용 특산 계화과");
  });

  it("allows the selected header to wrap without truncation, separates numeric columns, and preserves a distinct focus outline", () => {
    const markup = render();

    expect(markup).toContain("has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary");
    expect(markup).not.toContain("has-focus-visible:ring-2");
    expect(markup).toContain('class="flex min-w-0 items-center gap-2"');
    expect(markup).toContain('class="flex min-w-0 items-start gap-2 lg:min-h-20"');
    expect(markup).toContain('class="min-w-0 break-keep font-semibold"');
    expect(markup).not.toContain('class="min-w-0 truncate font-semibold"');
    expect(markup).toContain('class="w-[72px] pl-2 text-right font-normal"');
    expect((markup.match(/class="pl-2 text-right tabular-nums"/g) ?? []).length).toBe(3);
    expect(markup).not.toContain("flex flex-wrap items-center gap-2");
  });

  it("updates the selected strategy and exposes the selected badge in that card", () => {
    const setStrategy = jest.fn();
    const plan = {
      state: { minigamePlayCount: 1000, cardFlipStrategy: "all-open" },
      actions: { setMinigamePlayCount: jest.fn(), setCardFlipStrategy: setStrategy },
    } as unknown as EventShopPlanContext;
    const tree = CardFlipStrategyComparison({ plan, cardFlip, comparison });
    const inputs = findElements(tree, "input");
    const allOpenInput = inputs.find((input) => (input.props as { value?: string }).value === "sr-reset");

    expect(allOpenInput).toBeDefined();
    (allOpenInput?.props as { onChange?: () => void }).onChange?.();
    expect(setStrategy).toHaveBeenCalledWith("sr-reset");
  });

  it("formats the large-value threshold and decimals as specified", () => {
    const boundaryComparison = comparison.map((result) => ({
      ...result,
      rewards: [
        {
          ...result.rewards[0],
          quantity: 56_000,
          per100Cards: 56_000,
        },
        {
          ...result.rewards[0],
          resourceUid: "under-threshold",
          resourceName: "보상 경계값",
          quantity: 9_999.4,
          per100Cards: 9_999.44,
        },
      ],
    }));
    const markup = renderToStaticMarkup(
      createElement(CardFlipStrategyComparison, {
        plan: createPlan(),
        cardFlip,
        comparison: boundaryComparison,
      }),
    );

    expect((markup.match(/56K/g) ?? []).length).toBe(6);
    expect(markup).toContain("9,999.4");
    expect(markup).toContain("9,999.44");
  });

  it("shows guidance without rendering zero cost or reward values when no card count is set", () => {
    const markup = render(0);

    expect(markup).toContain("뒤집을 카드 수를 입력해 주세요");
    expect(markup).toContain("카드 수를 입력하면 전략별 소비 재화와 획득 보상을 비교할 수 있어요");
    expect(markup).not.toContain("소비 재화</p>");
    expect(markup).not.toContain("획득 보상</p>");
    expect(markup).not.toContain("100장당");
    expect(markup).not.toContain("<table");
    expect(markup).toContain("계획에 반영 중");
  });

  it("omits prohibited legacy copy", () => {
    const markup = render();
    expect(markup).not.toMatch(/깡|1,000개당|계산을 위한 가정|기대 소비/);
  });
});
