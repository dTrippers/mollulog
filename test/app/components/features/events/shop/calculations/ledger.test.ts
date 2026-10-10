import { describe, expect, it } from "@jest/globals";
import { calculateMinigamePaymentCosts } from "~/components/features/events/shop/utils";
import { calculateResourceLedger } from "../../../../../../../app/components/features/events/shop/calculations/ledger";
import type { MinigameConfig, ShopResource, Stage } from "../../../../../../../app/domain/event-shop";
import { ResourceTypeEnum } from "../../../../../../../app/graphql/graphql";

const gamepad = {
  type: ResourceTypeEnum.Item,
  uid: "gamepad",
  name: "예비 게임 패드",
};

const cable = {
  type: ResourceTypeEnum.Item,
  uid: "cable",
  name: "정체 모를 케이블",
};

function createShopResources(): ShopResource[] {
  return [
    {
      uid: "target-entry",
      resource: { type: ResourceTypeEnum.Item, uid: "target-reward", name: "목표 상품", rarity: 1 },
      resourceAmount: 1,
      paymentResource: gamepad,
      purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: 1, unitPrice: 6700, paymentResource: gamepad }],
      shopAmount: 1,
    },
    {
      uid: "exchange-entry",
      resource: { ...gamepad, rarity: 1 },
      resourceAmount: 1,
      paymentResource: cable,
      purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: null, unitPrice: 5, paymentResource: cable }],
      shopAmount: null,
    },
  ];
}

function createClueExchangeResources(): ShopResource[] {
  const clue = { type: ResourceTypeEnum.Item, uid: "legacy-clue", name: "단서" };
  const points = { type: ResourceTypeEnum.Item, uid: "event-points", name: "이벤트 포인트" };
  return [
    {
      uid: "shop-target",
      resource: { type: ResourceTypeEnum.Item, uid: "target-reward", name: "목표 상품", rarity: 1 },
      resourceAmount: 1,
      paymentResource: points,
      purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: 1, unitPrice: 400, paymentResource: points }],
      shopAmount: 1,
    },
    {
      uid: "legacy-clue-for-points",
      resource: { ...clue, rarity: 1 },
      resourceAmount: 1,
      paymentResource: points,
      purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: null, unitPrice: 200, paymentResource: points }],
      shopAmount: null,
    },
    {
      uid: "legacy-points-for-clue",
      resource: { ...points, rarity: 1 },
      resourceAmount: 200,
      paymentResource: clue,
      purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: null, unitPrice: 1, paymentResource: clue }],
      shopAmount: null,
    },
  ];
}

describe("calculateResourceLedger", () => {
  it("uses selected shop purchases as both resource costs and acquisitions", () => {
    const ledger = calculateResourceLedger({
      shopResources: createShopResources(),
      itemQuantities: { "target-entry": 1, "exchange-entry": 14 },
      itemPurchaseDays: {},
      existingPaymentItemQuantities: { gamepad: 6615, cable: 70 },
      stages: [],
      includeFirstClear: false,
      minigamePlayCount: 0,
    });

    expect(ledger.requiredForShopItems).toEqual({ gamepad: 6700, cable: 70 });
    expect(ledger.requiredTotals).toEqual({ gamepad: 6700, cable: 70 });
    expect(ledger.existing).toEqual({ gamepad: 6615, cable: 70 });
    expect(ledger.fromShop).toEqual({ "target-reward": 1, gamepad: 14 });
    expect(ledger.acquiredBeforeSweeps).toEqual({
      gamepad: 6629,
      cable: 70,
      "target-reward": 1,
    });
    expect(ledger.remainingToFarm).toEqual({ gamepad: 71 });
  });

  it("applies target overrides after adding first-clear rewards and inventory", () => {
    const stages: Stage[] = [
      {
        uid: "story",
        index: "1",
        entryAp: 5,
        difficulty: 0,
        rewards: [
          {
            amount: 5,
            rewardRequirement: null,
            chance: "1.0",
            item: { uid: gamepad.uid, name: gamepad.name, category: "coin", rarity: 1 },
          },
        ],
      },
    ];

    const ledger = calculateResourceLedger({
      shopResources: [],
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: { gamepad: 100 },
      stages,
      includeFirstClear: true,
      minigamePlayCount: 0,
      overriddenRequiredQuantities: { gamepad: 120 },
    });

    expect(ledger.requiredTotals).toEqual({ gamepad: 120 });
    expect(ledger.fromFirstRun).toEqual({ gamepad: 5 });
    expect(ledger.acquiredBeforeSweeps).toEqual({ gamepad: 105 });
    expect(ledger.remainingToFarm).toEqual({ gamepad: 15 });
  });

  it("applies BAQL FirstClear quest rewards only when first-clear rewards are enabled", () => {
    const stages: Stage[] = [
      {
        uid: "quest",
        index: "10",
        entryAp: 20,
        difficulty: 1,
        rewards: [
          {
            amount: 50,
            rewardRequirement: "FirstClear",
            chance: "1.0",
            item: { uid: gamepad.uid, name: gamepad.name, category: "coin", rarity: 1 },
          },
        ],
      },
    ];
    const input = {
      shopResources: [],
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages,
      minigamePlayCount: 0,
      overriddenRequiredQuantities: { gamepad: 100 },
    };

    const withoutFirstClear = calculateResourceLedger({ ...input, includeFirstClear: false });
    const withFirstClear = calculateResourceLedger({ ...input, includeFirstClear: true });

    expect(withoutFirstClear.fromFirstRun).toEqual({});
    expect(withoutFirstClear.remainingToFarm).toEqual({ gamepad: 100 });
    expect(withFirstClear.fromFirstRun).toEqual({ gamepad: 50 });
    expect(withFirstClear.remainingToFarm).toEqual({ gamepad: 50 });
  });

  it("excludes hidden reciprocal exchange rows while keeping converted point targets", () => {
    const ledger = calculateResourceLedger({
      shopResources: createClueExchangeResources(),
      itemQuantities: {
        "shop-target": 1,
        "legacy-clue-for-points": 10,
        "legacy-points-for-clue": 10,
      },
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages: [],
      includeFirstClear: false,
      minigamePlayCount: 1,
      minigamePaymentCosts: [{ resourceType: ResourceTypeEnum.Item, resourceUid: "event-points", quantity: 400 }],
      excludedShopResourceUids: ["legacy-clue-for-points", "legacy-points-for-clue"],
    });

    expect(ledger.requiredForShopItems).toEqual({ "event-points": 400 });
    expect(ledger.requiredForMinigame).toEqual({ "event-points": 400 });
    expect(ledger.requiredTotals).toEqual({ "event-points": 800 });
    expect(ledger.fromShop).toEqual({ "target-reward": 1 });
  });

  it("counts card-flip costs and average rewards once in the resource ledger", () => {
    const cardFlipCost = {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "photo-card",
      resourceName: "포토 카드",
      quantity: 200,
    };
    const minigameConfig: MinigameConfig = {
      minigameType: "card_flip",
      payment: cardFlipCost,
      payments: [cardFlipCost],
      rewardGroups: [
        {
          rounds: "subsequent",
          payments: [],
          rewards: [{ resourceType: ResourceTypeEnum.Item, resourceUid: "average-reward", quantity: 2 }],
        },
      ],
    };
    const playCount = 4;
    const minigamePaymentCosts = calculateMinigamePaymentCosts(minigameConfig, playCount);
    const ledger = calculateResourceLedger({
      shopResources: [],
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages: [],
      includeFirstClear: false,
      minigamePlayCount: playCount,
      minigameConfig,
      minigamePaymentCosts,
    });

    expect(ledger.requiredForMinigame).toEqual({ "photo-card": 800 });
    expect(ledger.fromMinigame).toEqual({ "average-reward": 8 });
    expect(ledger.requiredForMinigame).not.toHaveProperty("average-reward");
    expect(ledger.fromMinigame).not.toHaveProperty("photo-card");
  });

  it("uses external treasure-hunt costs and rewards instead of legacy minigame estimates", () => {
    const minigameConfig: MinigameConfig = {
      minigameType: "treasure_hunt",
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "legacy-cost", quantity: 10 },
      payments: [],
      rewardGroups: [
        {
          rounds: [1],
          payments: [],
          rewards: [{ resourceType: ResourceTypeEnum.Item, resourceUid: "legacy-reward", quantity: 999 }],
        },
      ],
    };
    const ledger = calculateResourceLedger({
      shopResources: [],
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages: [],
      includeFirstClear: false,
      minigamePlayCount: 6,
      minigameConfig,
      minigamePaymentCosts: [{ resourceType: ResourceTypeEnum.Item, resourceUid: "yukari", quantity: 7000 }],
      minigameRewards: [
        { resourceType: ResourceTypeEnum.Item, resourceUid: "renge", quantity: 200 },
        { resourceType: ResourceTypeEnum.Currency, resourceUid: "credit", quantity: 8320000 },
      ],
    });

    expect(ledger.requiredForMinigame).toEqual({ yukari: 7000 });
    expect(ledger.fromMinigame).toEqual({ renge: 200, credit: 8320000 });
    expect(ledger.fromMinigame).not.toHaveProperty("legacy-reward");
    expect(ledger.requiredForMinigame).not.toHaveProperty("legacy-cost");
  });
});
