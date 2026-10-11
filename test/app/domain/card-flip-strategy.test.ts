import { describe, expect, it } from "@jest/globals";
import {
  calculateCardFlipStrategy,
  calculateCardFlipStrategyComparison,
  resolveCardFlipMinigameInputs,
} from "~/domain/card-flip-strategy";
import type { CardFlipData, MinigameConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const photoCard = {
  resourceType: ResourceTypeEnum.Item,
  resourceUid: "photo-card",
  resourceName: "포토 카드",
  quantity: 1,
};

const cardFlip: Extract<CardFlipData, { status: "available" }> = {
  status: "available",
  slotCount: 4,
  flipCosts: [200, 210, 220, 230].map((quantity, index) => ({
    flip: index + 1,
    payments: [{ ...photoCard, quantity }],
  })),
  drawRules: {
    initialGroup: 1,
    maxDrawCount: 4,
    advanceOnRarities: [1, 2],
  },
  cards: [
    {
      uid: "normal",
      name: "일반 카드",
      rarity: 1,
      imageUrl: null,
      slots: [1, 2, 3].map((slot) => ({ slot, weight: 1 })),
      rewards: [
        {
          resourceType: ResourceTypeEnum.Item,
          resourceUid: "x",
          resourceName: "보상 X",
          quantity: 1,
        },
      ],
    },
    {
      uid: "sr",
      name: "SR 카드",
      rarity: 3,
      imageUrl: null,
      slots: [1, 2, 3, 4].map((slot) => ({ slot, weight: slot === 4 ? 2 : 1 })),
      rewards: [
        {
          resourceType: ResourceTypeEnum.Item,
          resourceUid: "y",
          resourceName: "보상 Y",
          quantity: 10,
        },
      ],
    },
  ],
};

function expected(result: ReturnType<typeof calculateCardFlipStrategy>) {
  return {
    cost: result.costs[0]?.quantity,
    x: result.rewards.find(({ resourceUid }) => resourceUid === "x")?.quantity,
    y: result.rewards.find(({ resourceUid }) => resourceUid === "y")?.quantity,
  };
}

describe("card flip strategy calculations", () => {
  it.each([
    ["one-open", 3, { cost: 600, x: 1.5, y: 15 }],
    ["sr-reset", 2, { cost: 405, x: 1, y: 10 }],
    ["sr-reset", 5, { cost: 1028.125, x: 2.40625, y: 25.9375 }],
    ["all-open", 4, { cost: 860, x: 1.9375, y: 20.625 }],
    ["all-open", 6, { cost: 1270, x: 2.9375, y: 30.625 }],
  ] as const)("matches the independent hand calculation for %s with %i cards", (strategy, count, value) => {
    expect(expected(calculateCardFlipStrategy(cardFlip, count, strategy))).toEqual(value);
  });

  it("calculates strategy-normalized reward yields independent of the selected card count", () => {
    const comparison = calculateCardFlipStrategyComparison(cardFlip, 1000);
    const oneOpen = comparison.find(({ strategy }) => strategy === "one-open");
    const srReset = comparison.find(({ strategy }) => strategy === "sr-reset");
    const allOpen = comparison.find(({ strategy }) => strategy === "all-open");

    expect(oneOpen?.rewards.map(({ resourceUid, per100Cards }) => [resourceUid, per100Cards])).toEqual([
      ["x", 50],
      ["y", 500],
    ]);
    expect(srReset?.rewards[0]?.per100Cards).toBeCloseTo(46.6666667, 3);
    expect(srReset?.rewards[1]?.per100Cards).toBeCloseTo(533.3333333, 3);
    expect(allOpen?.rewards.map(({ resourceUid, per100Cards }) => [resourceUid, per100Cards])).toEqual([
      ["x", 48.4375],
      ["y", 515.625],
    ]);
    expect(calculateCardFlipStrategy(cardFlip, 500, "one-open").rewards.map(({ per100Cards }) => per100Cards)).toEqual(
      oneOpen?.rewards.map(({ per100Cards }) => per100Cards),
    );
    expect(calculateCardFlipStrategy(cardFlip, 500, "sr-reset").rewards.map(({ per100Cards }) => per100Cards)).toEqual(
      srReset?.rewards.map(({ per100Cards }) => per100Cards),
    );
  });

  it("keeps the card-definition reward order identical across the fixed strategy order and includes zero rewards", () => {
    const grouped: Extract<CardFlipData, { status: "available" }> = {
      ...cardFlip,
      cards: [
        { ...cardFlip.cards[0], slots: [{ slot: 1, weight: 1 }] },
        {
          ...cardFlip.cards[1],
          slots: [{ slot: 2, weight: 1 }],
          rewards: [{ ...cardFlip.cards[1].rewards[0], resourceUid: "later" }],
        },
      ],
    };
    const comparison = calculateCardFlipStrategyComparison(grouped, 1);

    expect(comparison.map(({ strategy }) => strategy)).toEqual(["one-open", "sr-reset", "all-open"]);
    expect(comparison.map(({ rewards }) => rewards.map(({ resourceUid }) => resourceUid))).toEqual([
      ["x", "later"],
      ["x", "later"],
      ["x", "later"],
    ]);
    expect(comparison.every(({ rewards }) => rewards[1]?.quantity === 0)).toBe(true);
  });

  it("uses logarithmic transition powering for a million draws", () => {
    const result = calculateCardFlipStrategy(cardFlip, 1_000_000, "one-open");
    expect(result.costs[0]?.quantity).toBe(200_000_000);
    expect(result.rewards.map(({ quantity }) => quantity)).toEqual([500_000, 5_000_000]);
  });

  it("returns selected-strategy costs and rewards to the shop calculation and rejects unavailable data", () => {
    const config: MinigameConfig = {
      minigameType: "card_flip",
      payment: photoCard,
      payments: [photoCard],
      rewardGroups: [],
      cardFlip,
    };
    const selected = resolveCardFlipMinigameInputs(config, 5, "sr-reset");
    const expectedResult = calculateCardFlipStrategy(cardFlip, 5, "sr-reset");

    expect(selected?.costs).toEqual(expectedResult.costs);
    expect(selected?.rewards).toEqual(expectedResult.rewards.map(({ per100Cards: _per100Cards, ...reward }) => reward));
    expect(resolveCardFlipMinigameInputs({ ...config, cardFlip: { status: "invalid" } }, 5, "all-open")).toBeNull();
  });

  it("throws when a reachable draw group has no positive weight", () => {
    expect(() =>
      calculateCardFlipStrategy(
        {
          ...cardFlip,
          cards: cardFlip.cards.map((card) => ({ ...card, slots: card.slots.filter(({ slot }) => slot !== 2) })),
        },
        2,
        "sr-reset",
      ),
    ).toThrow("No card flip weight for reachable group 2");
  });
});
