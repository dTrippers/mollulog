import { describe, expect, it } from "@jest/globals";
import {
  calculateBoughtItemQuantities,
  calculateBoughtResourceQuantities,
} from "../../../../../../../app/components/features/events/shop/calculations/shop-rewards";
import type { ShopResource } from "../../../../../../../app/components/features/events/shop/types";
import { ResourceTypeEnum } from "../../../../../../../app/graphql/graphql";

function createShopResource(overrides: Partial<ShopResource>): ShopResource {
  return {
    uid: "shop-resource",
    resource: {
      type: ResourceTypeEnum.Item,
      uid: "reward-item",
      name: "보상 아이템",
      rarity: 1,
    },
    resourceAmount: 1,
    paymentResource: {
      type: ResourceTypeEnum.Item,
      uid: "event-coin",
      name: "이벤트 재화",
    },
    purchaseTiers: [
      {
        tierIndex: 0,
        startQuantity: 1,
        quantity: 10,
        unitPrice: 100,
        paymentResource: {
          type: ResourceTypeEnum.Item,
          uid: "event-coin",
          name: "이벤트 재화",
        },
      },
    ],
    shopAmount: 10,
    ...overrides,
  };
}

describe("shop reward calculations", () => {
  it("multiplies purchase count by bundled resource amount", () => {
    const shopResources = [
      createShopResource({
        uid: "shop-resource-100-pack",
        resourceAmount: 100,
      }),
    ];

    expect(calculateBoughtItemQuantities(shopResources, { "shop-resource-100-pack": 5 })).toEqual({
      "reward-item": 500,
    });
  });

  it("merges repeated rewards for the same resource", () => {
    const shopResources = [
      createShopResource({
        uid: "shop-resource-a",
        resourceAmount: 100,
      }),
      createShopResource({
        uid: "shop-resource-b",
        resourceAmount: 20,
      }),
    ];

    expect(calculateBoughtResourceQuantities(shopResources, { "shop-resource-a": 5, "shop-resource-b": 3 })).toEqual([
      {
        resource: {
          type: ResourceTypeEnum.Item,
          uid: "reward-item",
          name: "보상 아이템",
          rarity: 1,
        },
        totalQuantity: 560,
      },
    ]);
  });

  it("multiplies daily reset purchases by purchase days", () => {
    const shopResources = [
      createShopResource({
        uid: "daily-ticket",
        resourceAmount: 1,
        purchaseTiers: [
          {
            tierIndex: 0,
            startQuantity: 1,
            quantity: 10,
            unitPrice: 5,
            paymentResource: {
              type: ResourceTypeEnum.Currency,
              uid: "4",
              name: "청휘석",
            },
          },
          {
            tierIndex: 1,
            startQuantity: 11,
            quantity: 10,
            unitPrice: 10,
            paymentResource: {
              type: ResourceTypeEnum.Currency,
              uid: "4",
              name: "청휘석",
            },
          },
        ],
        shopAmount: 60,
      }),
    ];

    expect(calculateBoughtItemQuantities(shopResources, { "daily-ticket": 20 }, { "daily-ticket": 14 })).toEqual({
      "reward-item": 280,
    });
  });
});
