import { describe, expect, it } from "@jest/globals";
import {
  clueSearchRoundCount,
  convertClueSearchCostsToPoints,
  filterClueSearchShopResources,
  getClueSearchExchangeRates,
  getClueSearchOneTimeRange,
  getClueSearchRoundDetails,
  resolveClueSearchExchange,
} from "../../../../../../app/components/features/events/shop/clue-search";
import {
  calculateMinigamePaymentCosts,
  calculateMinigameRewards,
} from "../../../../../../app/components/features/events/shop/utils";
import type { MinigameConfig, ShopResource } from "../../../../../../app/domain/event-shop";
import { ResourceTypeEnum } from "../../../../../../app/graphql/graphql";

const pointResource: ShopResource["resource"] = {
  type: ResourceTypeEnum.Item,
  uid: "event-points",
  name: "이벤트 포인트",
  rarity: 1,
};

function clueResource(uid: string): ShopResource["resource"] {
  return {
    type: ResourceTypeEnum.Item,
    uid,
    name: uid === "clue-a" ? "A 단서" : "B 단서",
    rarity: 1,
  };
}

function exchangeRow(
  uid: string,
  resource: ShopResource["resource"],
  resourceAmount: number,
  paymentResource: ShopResource["paymentResource"],
  unitPrice: number,
  options: { shopAmount?: number | null; tierQuantity?: number | null } = {},
): ShopResource {
  return {
    uid,
    resource: { ...resource, rarity: 1 },
    resourceAmount,
    paymentResource,
    purchaseTiers: [
      { tierIndex: 0, startQuantity: 1, quantity: options.tierQuantity ?? null, unitPrice, paymentResource },
    ],
    shopAmount: options.shopAmount ?? null,
  };
}

function createExchangeRows(): ShopResource[] {
  const clueA = clueResource("clue-a");
  const clueB = clueResource("clue-b");
  return [
    exchangeRow("clue-a-for-points", clueA, 1, pointResource, 200),
    exchangeRow("clue-b-for-points", clueB, 1, pointResource, 300),
    exchangeRow("points-for-clue-a", pointResource, 200, clueA, 1),
    exchangeRow("points-for-clue-b", pointResource, 300, clueB, 1),
  ];
}

function payment(resourceUid: string, quantityExpected: number) {
  return {
    resourceType: ResourceTypeEnum.Item,
    resourceUid,
    resourceName: resourceUid,
    quantityMin: quantityExpected,
    quantityExpected,
    quantityMax: quantityExpected,
    quantityVariable: false,
  };
}

function createConfig(): MinigameConfig {
  return {
    minigameType: "clue_search",
    payment: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "clue-a",
      resourceName: "A 단서",
      quantity: 1,
    },
    payments: [],
    rewardGroups: [
      {
        rounds: [1],
        payments: [payment("clue-a", 2)],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "credits",
            resourceName: "크레딧",
            quantity: 10,
          },
        ],
      },
      {
        rounds: [2],
        payments: [payment("clue-a", 3)],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "credits",
            resourceName: "크레딧",
            quantity: 20,
          },
        ],
      },
      {
        rounds: { gte: 3 },
        payments: [payment("clue-a", 5)],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "credits",
            resourceName: "크레딧",
            quantity: 7,
          },
        ],
      },
    ],
  };
}

describe("clue search exchange resolution", () => {
  it("accepts verified reciprocal rows and converts clue requirements to points", () => {
    const exchange = resolveClueSearchExchange(createConfig(), createExchangeRows());

    expect(exchange).toMatchObject({
      supported: true,
      clueUids: ["clue-a"],
      pointPerClue: { [`${ResourceTypeEnum.Item}:clue-a`]: 200 },
      hiddenShopResourceUids: ["clue-a-for-points", "points-for-clue-a"],
    });
    expect(exchange?.rules).toEqual([
      {
        clueType: ResourceTypeEnum.Item,
        clueUid: "clue-a",
        clueName: "A 단서",
        pointAmount: 200,
        clueAmount: 1,
        pointPerClue: 200,
      },
    ]);
    expect(exchange?.pointResource).toMatchObject({ uid: "event-points", name: "이벤트 포인트" });
    expect(getClueSearchExchangeRates(exchange)).toEqual([{ pointAmount: 200, clueAmount: 1 }]);
    expect(filterClueSearchShopResources(createExchangeRows(), exchange)).toEqual(
      expect.arrayContaining([expect.objectContaining({ uid: "clue-b-for-points" })]),
    );
    expect(filterClueSearchShopResources(createExchangeRows(), exchange)).toHaveLength(2);
    expect(
      convertClueSearchCostsToPoints(
        [{ resourceType: ResourceTypeEnum.Item, resourceUid: "clue-a", quantity: 4 }],
        exchange,
      ),
    ).toEqual([
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "event-points",
        resourceName: "이벤트 포인트",
        quantity: 800,
      },
    ]);
  });

  it("groups clues that use the same point exchange rate", () => {
    const exchange = resolveClueSearchExchange(createConfig(), createExchangeRows());
    expect(exchange?.supported).toBe(true);
    if (!exchange || exchange.rules.length === 0) return;

    const duplicateRateExchange = {
      ...exchange,
      rules: [...exchange.rules, { ...exchange.rules[0], clueUid: "clue-b", clueName: "B 단서" }],
    };

    expect(getClueSearchExchangeRates(duplicateRateExchange)).toEqual([{ pointAmount: 200, clueAmount: 1 }]);
  });

  it("keeps rows visible when a reciprocal row is missing", () => {
    const exchange = resolveClueSearchExchange(
      createConfig(),
      createExchangeRows().filter((shopResource) => shopResource.uid !== "points-for-clue-a"),
    );

    expect(exchange?.supported).toBe(false);
    expect(exchange?.hiddenShopResourceUids).toEqual([]);
    expect(exchange?.reason).toBeTruthy();
  });

  it("does not hide a valid-looking row when a duplicate direction is malformed", () => {
    const rows = createExchangeRows();
    rows.push(exchangeRow("duplicate-clue-a-for-points", clueResource("clue-a"), 2, pointResource, 200));
    const exchange = resolveClueSearchExchange(createConfig(), rows);

    expect(exchange?.supported).toBe(false);
    expect(exchange?.hiddenShopResourceUids).toEqual([]);
  });

  it("requires reciprocal rows to match resource type as well as UID", () => {
    const rows = createExchangeRows().map((row) =>
      row.uid === "clue-a-for-points"
        ? { ...row, resource: { ...row.resource, type: ResourceTypeEnum.Currency } }
        : row,
    );
    const exchange = resolveClueSearchExchange(createConfig(), rows);

    expect(exchange?.supported).toBe(false);
    expect(exchange?.hiddenShopResourceUids).toEqual([]);
  });

  it("does not hide limited or tier-limited exchange rows", () => {
    const limitedShop = createExchangeRows().map((row) =>
      row.uid === "clue-a-for-points" ? { ...row, shopAmount: 10 } : row,
    );
    const limitedTier = createExchangeRows().map((row) =>
      row.uid === "clue-a-for-points"
        ? {
            ...row,
            purchaseTiers: row.purchaseTiers.map((tier) => ({ ...tier, quantity: 10 })),
          }
        : row,
    );

    expect(resolveClueSearchExchange(createConfig(), limitedShop)?.supported).toBe(false);
    expect(resolveClueSearchExchange(createConfig(), limitedTier)?.supported).toBe(false);
  });

  it("does not silently discard an unmapped clue cost", () => {
    const exchange = resolveClueSearchExchange(createConfig(), createExchangeRows());

    expect(
      convertClueSearchCostsToPoints(
        [{ resourceType: ResourceTypeEnum.Item, resourceUid: "unknown-clue", quantity: 1 }],
        exchange,
      ),
    ).toEqual([{ resourceType: ResourceTypeEnum.Item, resourceUid: "unknown-clue", quantity: 1 }]);
  });
});

describe("clue search round ranges", () => {
  it("derives one complete one-time range for the quick action", () => {
    expect(getClueSearchOneTimeRange(createConfig())).toEqual({ startRound: 1, endRound: 2 });
  });

  it("uses the inclusive start/end range and applies loop rounds", () => {
    const config = createConfig();

    expect(calculateMinigamePaymentCosts(config, 4, "expected", 2)).toEqual([
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "clue-a",
        resourceName: "clue-a",
        quantity: 13,
      },
    ]);
    expect(calculateMinigameRewards(config, 4, 2)).toEqual([
      {
        resourceType: ResourceTypeEnum.Currency,
        resourceUid: "credits",
        resourceName: "크레딧",
        quantity: 34,
      },
    ]);
    expect(clueSearchRoundCount(2, 4)).toBe(3);
    expect(getClueSearchRoundDetails(config, 2, 3)).toEqual([
      {
        round: 2,
        clues: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "clue-a",
            resourceName: "clue-a",
            quantity: 3,
          },
        ],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "credits",
            resourceName: "크레딧",
            quantity: 20,
          },
        ],
      },
      {
        round: 3,
        loopCount: 1,
        clues: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "clue-a",
            resourceName: "clue-a",
            quantity: 5,
          },
        ],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "credits",
            resourceName: "크레딧",
            quantity: 7,
          },
        ],
      },
    ]);
  });

  it("keeps unlike resource types and reward rarities separate during detail aggregation", () => {
    const config = createConfig();
    config.rewardGroups = [
      {
        rounds: [1],
        payments: [payment("same-uid", 2), { ...payment("same-uid", 3), resourceType: ResourceTypeEnum.Currency }],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "credits",
            resourceName: "크레딧",
            quantity: 10,
            rarity: 1,
          },
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "credits",
            resourceName: "크레딧",
            quantity: 20,
            rarity: 2,
          },
        ],
      },
    ];

    const [detail] = getClueSearchRoundDetails(config, 1, 1);
    expect(detail.clues).toHaveLength(2);
    expect(detail.rewards).toHaveLength(2);
  });

  it("aggregates a very large loop range without materializing every round", () => {
    const config = createConfig();
    const endRound = 1_000_000_000;
    const loopCount = endRound - 2;

    expect(calculateMinigamePaymentCosts(config, endRound, "expected", 1)).toEqual([
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "clue-a",
        resourceName: "clue-a",
        quantity: 2 + 3 + loopCount * 5,
      },
    ]);
    expect(calculateMinigameRewards(config, endRound, 1)).toEqual([
      {
        resourceType: ResourceTypeEnum.Currency,
        resourceUid: "credits",
        resourceName: "크레딧",
        quantity: 10 + 20 + loopCount * 7,
      },
    ]);

    const details = getClueSearchRoundDetails(config, 1, endRound);
    expect(details).toHaveLength(3);
    expect(details[2]).toMatchObject({ round: 3, loopCount });
  });
});
