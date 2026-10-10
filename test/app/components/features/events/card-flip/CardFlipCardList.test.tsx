import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { CardFlipCardList } from "~/components/features/events/card-flip/CardFlipCardList";
import type { CardFlipCard } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const card: CardFlipCard = {
  uid: "card-1",
  name: "축제의 추억",
  rarity: 4,
  imageUrl: "https://assets.baql.net/images/events/cards/group-a.webp",
  slots: [{ slot: 1, weight: 1 }],
  rewards: [
    {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "gift",
      resourceName: "선물용 특산 계화과",
      quantity: 4,
      rarity: 2,
    },
    {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "credit",
      resourceName: "크레딧 포인트",
      quantity: 1_100_000,
    },
  ],
};

function render(cardFlip: Parameters<typeof CardFlipCardList>[0]["cardFlip"]): string {
  return renderToStaticMarkup(<CardFlipCardList cardFlip={cardFlip} />);
}

describe("CardFlipCardList", () => {
  it("renders card identity and every reward with an exact accessible card description", () => {
    const markup = render({ status: "available", cards: [card, { ...card, uid: "card-2", name: null }] });

    expect(markup).toContain("카드별 보상 (2종)");
    expect(markup).toContain("축제의 추억");
    expect(markup).toContain("SSR 등급");
    expect(markup).toContain("선물용 특산 계화과 4개, 크레딧 포인트 1,100,000개");
    expect(markup).toContain('src="https://assets.baql.net/images/events/cards/group-a.webp"');
    expect(markup).toContain('<div aria-hidden="true" class="flex min-w-0 items-start gap-3">');
    expect((markup.match(/축제의 추억/g) ?? []).length).toBe(1);
    expect(markup).toContain("absolute right-0 bottom-0");
    expect(markup).toContain("h-16 w-12");
    expect(markup).toContain('width="48" height="64"');
    expect(markup).toContain('aria-label="카드별 보상"');
    expect((markup.match(/<li /g) ?? []).length).toBe(2);
    expect((markup.match(/aria-hidden="true"/g) ?? []).length).toBe(2);
  });

  it("retains accessible names and known rarity without inventing missing identity details", () => {
    const markup = render({
      status: "available",
      cards: [
        { ...card, uid: "name-only", rarity: null, imageUrl: null },
        { ...card, uid: "rarity-only", name: null, imageUrl: null, rarity: 2 },
        { ...card, uid: "rarity-zero", name: null, imageUrl: null, rarity: 0 },
        { ...card, uid: "rarity-five", name: null, imageUrl: null, rarity: 5 },
        { ...card, uid: "no-identity", name: null, imageUrl: null, rarity: null },
      ],
    });

    expect(markup).toContain("축제의 추억");
    expect(markup).toContain(">R<");
    expect(markup).not.toContain(">N<");
    expect(markup).not.toContain(">SR<");
    expect(markup).not.toContain(">SSR<");
    expect((markup.match(/src="https:\/\/assets\.baql\.net\/images\/cards/g) ?? []).length).toBe(0);
    expect((markup.match(/<li /g) ?? []).length).toBe(5);
  });

  it("renders rewards without a header when every identity field is null", () => {
    const markup = render({
      status: "available",
      cards: [{ ...card, name: null, rarity: null, imageUrl: null }],
    });

    expect(markup).toContain('<span class="sr-only">선물용 특산 계화과 4개, 크레딧 포인트 1,100,000개</span>');
    expect(markup).not.toContain("축제의 추억");
    expect(markup).not.toContain('src="https://assets.baql.net/images/events/cards/group-a.webp"');
    expect(markup).not.toContain("before:bg-");
    expect(markup).toContain("선물용 특산 계화과");
  });

  it("shows unavailable data without an alert", () => {
    const markup = render({ status: "unavailable" });

    expect(markup).toContain("카드별 보상 정보가 아직 없어요");
    expect(markup).toContain("상점 계산기의 카드 뒤집기 계산도 할 수 없어요");
    expect(markup).not.toContain('role="alert"');
  });

  it("marks invalid card data as an alert within the reward section", () => {
    const markup = render({ status: "invalid" });

    expect(markup).toContain("카드별 보상 정보를 불러오지 못했어요");
    expect((markup.match(/role="alert"/g) ?? []).length).toBe(1);
    expect(markup.indexOf("카드별 보상")).toBeLessThan(markup.indexOf("카드별 보상 정보를 불러오지 못했어요"));
  });
});
