import { describe, expect, it, jest } from "@jest/globals";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { CardFlipSection } from "~/components/features/events/shop/CardFlipSection";
import { SegmentedControl } from "~/components/primitives";
import { calculateCardFlipStrategyComparison } from "~/domain/card-flip-strategy";
import type { MinigameConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const payment = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "photo-card",
  resourceName: "포토 카드",
  quantity: 200,
};
const config: MinigameConfig = {
  minigameType: "card_flip",
  payment,
  payments: [payment],
  rewardGroups: [],
  cardFlip: {
    status: "available",
    slotCount: 1,
    flipCosts: [{ flip: 1, payments: [payment] }],
    drawRules: { initialGroup: 1, maxDrawCount: 1, advanceOnRarities: [] },
    cards: [
      {
        uid: "card-1",
        name: "카드",
        rarity: 4,
        imageUrl: null,
        slots: [{ slot: 1, weight: 1 }],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "gift",
            resourceName: "선물용 특산 계화과",
            quantity: 4,
          },
        ],
      },
    ],
  },
};
function getProps(count: number, strategy: "one-open" | "sr-reset" | "all-open" = "all-open") {
  return {
    config,
    eventUid: "event-1",
    state: { minigamePlayCount: count, cardFlipStrategy: strategy },
    actions: { setMinigamePlayCount: jest.fn(), setCardFlipStrategy: jest.fn() },
    comparison: calculateCardFlipStrategyComparison(
      config.cardFlip as Extract<NonNullable<MinigameConfig["cardFlip"]>, { status: "available" }>,
      count,
    ),
  } as unknown as Parameters<typeof CardFlipSection>[0];
}

function findElement(node: ReactNode, type: unknown): ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    const element = child as ReactElement<{ children?: ReactNode }>;
    if (element.type === type) return element;
    const nested = findElement(element.props.children, type);
    if (nested) return nested;
  }
  return undefined;
}

describe("CardFlipSection", () => {
  it("renders a short-label strategy selector and selected strategy result as separate stacked rows", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(CardFlipSection, getProps(1000)),
      ),
    );

    expect(markup).toContain("1장만 열기");
    expect(markup).toContain("SR 이상 셔플");
    expect(markup).toContain("모두 열기");
    expect(markup).toContain("모두 열기 · 항상 1장을 모두 열어요");
    expect(markup).toContain("소비 재화");
    expect(markup).toContain("기대 획득 보상");
    expect(markup).toContain("기대값");
    expect(markup).toContain("기대값이라 실제 획득량은 달라질 수 있어요");
    expect(markup).toContain("전략 비교와 카드별 보상 보기");
    expect(markup).toContain("세 전략의 소비 재화·획득 보상과 카드 1종의 보상 구성을 확인해보세요");
    expect(markup).toContain('href="/events/event-1/shop/card-flip"');
    expect(markup).not.toContain("카드 1장당");
    expect(markup).not.toContain("기대 소비");
  });

  it("passes strategy changes to the shared shop-plan action", () => {
    const props = getProps(1000);
    const section = CardFlipSection(props);
    const segmentedControl = findElement(section, SegmentedControl);

    expect(segmentedControl).toBeDefined();
    (segmentedControl?.props as { onChange?: (value: string) => void }).onChange?.("sr-reset");
    expect(props.actions.setCardFlipStrategy).toHaveBeenCalledWith("sr-reset");
  });

  it("keeps strategy controls at zero while hiding the result box", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(CardFlipSection, getProps(0)),
      ),
    );

    expect(markup).toContain("카드 뒤집기 전략");
    expect(markup).toContain("1장만 열기");
    expect(markup).toContain("SR 이상 셔플");
    expect(markup).toContain("모두 열기");
    expect(markup).not.toContain("mt-4 flex flex-col gap-4 rounded-md bg-card p-3");
    expect(markup).not.toContain("기대 획득 보상");
  });
});
