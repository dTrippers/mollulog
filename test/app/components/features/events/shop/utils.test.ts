import { describe, expect, it } from "@jest/globals";
import {
  calculateMinigamePaymentCosts,
  hasVariableMinigamePayment,
} from "../../../../../../app/components/features/events/shop/utils";
import type { MinigameConfig } from "../../../../../../app/domain/event-shop";
import { ResourceTypeEnum } from "../../../../../../app/graphql/graphql";

function createMinigameConfig(overrides: Partial<MinigameConfig> = {}): MinigameConfig {
  return {
    minigameType: "box_gacha",
    payment: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "event-coin",
      resourceName: "이벤트 재화",
      quantity: 100,
    },
    payments: [],
    rewardGroups: [
      {
        rounds: [1, 2],
        payments: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "event-coin",
            resourceName: "이벤트 재화",
            quantityMin: 80,
            quantityExpected: 100,
            quantityMax: 120,
            quantityVariable: true,
          },
        ],
        rewards: [],
      },
      {
        rounds: { gte: 3 },
        payments: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "event-coin",
            resourceName: "이벤트 재화",
            quantityMin: 160,
            quantityExpected: 200,
            quantityMax: 240,
            quantityVariable: true,
          },
        ],
        rewards: [],
      },
    ],
    ...overrides,
  };
}

describe("minigame payment calculations", () => {
  it("calculates round-based payment costs using expected quantity by default", () => {
    const costs = calculateMinigamePaymentCosts(createMinigameConfig(), 4);

    expect(costs).toEqual([
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "event-coin",
        resourceName: "이벤트 재화",
        quantity: 600,
      },
    ]);
  });

  it("calculates round-based payment costs using selected min and max quantity modes", () => {
    const config = createMinigameConfig();

    expect(calculateMinigamePaymentCosts(config, 4, "min")[0].quantity).toBe(480);
    expect(calculateMinigamePaymentCosts(config, 4, "max")[0].quantity).toBe(720);
  });

  it("uses the first matching payment group per box gacha round", () => {
    const config = createMinigameConfig({
      rewardGroups: [
        {
          rounds: [2],
          payments: [
            {
              resourceType: ResourceTypeEnum.Item,
              resourceUid: "event-coin",
              resourceName: "이벤트 재화",
              quantityMin: 10,
              quantityExpected: 10,
              quantityMax: 10,
              quantityVariable: false,
            },
          ],
          rewards: [],
        },
        {
          rounds: { gte: 2 },
          payments: [
            {
              resourceType: ResourceTypeEnum.Item,
              resourceUid: "event-coin",
              resourceName: "이벤트 재화",
              quantityMin: 100,
              quantityExpected: 100,
              quantityMax: 100,
              quantityVariable: false,
            },
          ],
          rewards: [],
        },
      ],
    });

    expect(calculateMinigamePaymentCosts(config, 3)[0].quantity).toBe(110);
  });

  it("falls back to legacy config payments when reward groups have no payment ranges", () => {
    const config = createMinigameConfig({
      payments: [
        {
          resourceType: ResourceTypeEnum.Item,
          resourceUid: "event-coin",
          resourceName: "이벤트 재화",
          quantity: 150,
        },
      ],
      rewardGroups: [],
    });

    expect(calculateMinigamePaymentCosts(config, 3)).toEqual([
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "event-coin",
        resourceName: "이벤트 재화",
        quantity: 450,
      },
    ]);
  });

  it("detects variable payment ranges", () => {
    expect(hasVariableMinigamePayment(createMinigameConfig())).toBe(true);
    expect(hasVariableMinigamePayment(createMinigameConfig({ rewardGroups: [] }))).toBe(false);
  });
});
