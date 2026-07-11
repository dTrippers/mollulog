import { describe, expect, it } from "@jest/globals";
import Decimal from "decimal.js";
import {
  calculateStageInfos,
  optimizeStageRuns,
} from "../../../../../../../app/components/features/events/shop/calculations/optimization";
import { calculateRequiredQuantities } from "../../../../../../../app/components/features/events/shop/calculations/requirements";
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

const stages: Stage[] = [
  {
    uid: "gamepad-stage",
    index: "11",
    entryAp: 20,
    difficulty: 1,
    rewards: [
      {
        amount: 36,
        rewardRequirement: null,
        chance: "1.0",
        item: { uid: gamepad.uid, name: gamepad.name, category: "coin", rarity: 1 },
      },
    ],
  },
];

function createTargetResource(): ShopResource {
  return {
    uid: "target-entry",
    resource: { type: ResourceTypeEnum.Item, uid: "target-reward", name: "목표 상품", rarity: 1 },
    resourceAmount: 1,
    paymentResource: gamepad,
    purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: 1, unitPrice: 6700, paymentResource: gamepad }],
    shopAmount: 1,
  };
}

function createExchangeResource(shopAmount: number | null = null): ShopResource {
  return {
    uid: "exchange-entry",
    resource: { ...gamepad, rarity: 1 },
    resourceAmount: 1,
    paymentResource: cable,
    purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: shopAmount, unitPrice: 5, paymentResource: cable }],
    shopAmount,
  };
}

function calculate(overrides: {
  shopResources?: ShopResource[];
  itemQuantities?: Record<string, number>;
  existingPaymentItemQuantities?: Record<string, number>;
  overriddenRequiredQuantities?: Record<string, number>;
}) {
  return calculateRequiredQuantities({
    shopResources: overrides.shopResources ?? [createTargetResource(), createExchangeResource()],
    itemQuantities: overrides.itemQuantities ?? {},
    itemPurchaseDays: {},
    existingPaymentItemQuantities: overrides.existingPaymentItemQuantities ?? {},
    stages,
    includeFirstClear: false,
    minigamePlayCount: 0,
    overriddenRequiredQuantities: overrides.overriddenRequiredQuantities ?? {},
  });
}

describe("calculateRequiredQuantities", () => {
  it("credits only the exchange quantity explicitly selected by the user", () => {
    const existingPaymentItemQuantities = { [gamepad.uid]: 6615, [cable.uid]: 70 };
    const withoutExchange = calculate({
      itemQuantities: { "target-entry": 1 },
      existingPaymentItemQuantities,
    });
    const withExchange = calculate({
      itemQuantities: { "target-entry": 1, "exchange-entry": 14 },
      existingPaymentItemQuantities,
    });

    expect(withoutExchange).toEqual({ [gamepad.uid]: 85 });
    expect(withExchange).toEqual({ [gamepad.uid]: 71 });

    const optimize = (requirements: Record<string, number>) => {
      const targets = Object.entries(requirements);
      const stageInfos = calculateStageInfos(stages, { "gamepad-stage": true }, { [gamepad.uid]: new Decimal("0.95") });
      return optimizeStageRuns(stageInfos, targets).stageRuns;
    };

    expect(optimize(withoutExchange)).toEqual({ "gamepad-stage": 2 });
    expect(optimize(withExchange)).toEqual({ "gamepad-stage": 1 });
  });

  it("does not automatically apply an exchange the user did not select", () => {
    expect(
      calculate({
        shopResources: [createExchangeResource()],
        existingPaymentItemQuantities: { [cable.uid]: 10 },
        overriddenRequiredQuantities: { [gamepad.uid]: 20 },
      }),
    ).toEqual({ [gamepad.uid]: 20 });
  });

  it("keeps the unmet remainder when the selected exchange exceeds its stock", () => {
    expect(
      calculate({
        shopResources: [createExchangeResource(10)],
        itemQuantities: { "exchange-entry": 20 },
        existingPaymentItemQuantities: { [cable.uid]: 50 },
        overriddenRequiredQuantities: { [gamepad.uid]: 20 },
      }),
    ).toEqual({ [gamepad.uid]: 10 });
  });
});
