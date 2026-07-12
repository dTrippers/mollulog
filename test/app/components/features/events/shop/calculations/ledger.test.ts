import { describe, expect, it } from "@jest/globals";
import { calculateResourceLedger } from "../../../../../../../app/components/features/events/shop/calculations/ledger";
import type { ShopResource, Stage } from "../../../../../../../app/domain/event-shop";
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
});
