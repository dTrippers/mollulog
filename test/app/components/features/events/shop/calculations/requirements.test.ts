import { describe, expect, it } from "@jest/globals";
import { calculateRequiredQuantities } from "../../../../../../../app/components/features/events/shop/calculations/requirements";
import type {
  CollectableResource,
  ShopResource,
  Stage,
} from "../../../../../../../app/components/features/events/shop/types";
import { ResourceTypeEnum } from "../../../../../../../app/graphql/graphql";

const eventCoin = {
  type: ResourceTypeEnum.Item,
  uid: "event-coin",
  name: "이벤트 재화",
};

const exchangePayment = {
  type: ResourceTypeEnum.Item,
  uid: "exchange-payment",
  name: "교환 재화",
};

function createStage(): Stage {
  return {
    uid: "stage-1",
    index: "1",
    entryAp: 10,
    difficulty: 1,
    rewards: [],
  };
}

function createExchangeResource(purchaseTiers: ShopResource["purchaseTiers"]): ShopResource {
  return {
    uid: "exchange-entry",
    resource: {
      type: ResourceTypeEnum.Item,
      uid: eventCoin.uid,
      name: eventCoin.name,
      rarity: 1,
    },
    resourceAmount: 10,
    paymentResource: exchangePayment,
    purchaseTiers,
    shopAmount: 10,
  };
}

const collectableResources: CollectableResource[] = [
  { ...eventCoin, forPayment: true },
  { ...exchangePayment, forPayment: true },
];

describe("calculateRequiredQuantities", () => {
  it("recursively converts ordinary exchange entries", () => {
    const result = calculateRequiredQuantities({
      shopResources: [
        createExchangeResource([
          { tierIndex: 0, startQuantity: 1, quantity: 10, unitPrice: 5, paymentResource: exchangePayment },
        ]),
      ],
      collectableResources,
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages: [createStage()],
      includeFirstClear: false,
      minigamePlayCount: 0,
      overriddenRequiredQuantities: { [eventCoin.uid]: 20 },
    });

    expect(result).toEqual({ [exchangePayment.uid]: 10 });
  });

  it("keeps daily-reset exchange entries unconverted because purchase days are user-selected", () => {
    const result = calculateRequiredQuantities({
      shopResources: [
        createExchangeResource([
          { tierIndex: 0, startQuantity: 1, quantity: 10, unitPrice: 5, paymentResource: exchangePayment },
          { tierIndex: 1, startQuantity: 11, quantity: 10, unitPrice: 10, paymentResource: exchangePayment },
        ]),
      ],
      collectableResources,
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages: [createStage()],
      includeFirstClear: false,
      minigamePlayCount: 0,
      overriddenRequiredQuantities: { [eventCoin.uid]: 20 },
    });

    expect(result).toEqual({ [eventCoin.uid]: 20 });
  });
});
