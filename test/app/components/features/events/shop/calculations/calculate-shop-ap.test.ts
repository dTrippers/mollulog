import { describe, expect, it } from "@jest/globals";
import { calculateShopApRequirement } from "../../../../../../../app/components/features/events/shop/calculations/calculate-shop-ap";
import type { Stage } from "../../../../../../../app/domain/event-shop";
import { createDefaultEventShopState } from "../../../../../../../app/domain/event-shop-state";
import { ResourceTypeEnum } from "../../../../../../../app/graphql/graphql";

describe("calculateShopApRequirement", () => {
  it("shares the same totalApWithExtras calculation used by the shop screen", () => {
    const stages: Stage[] = [{ uid: "story", index: "1", entryAp: 12, difficulty: 0, rewards: [] }];
    const state = createDefaultEventShopState(stages, []);
    state.enabledStages.story = true;
    state.includeFirstClear = true;
    state.extraStageRuns.story = 3;

    const result = calculateShopApRequirement({
      state,
      stages,
      shopResources: [],
      minigameConfig: null,
      appliedBonusRatio: {},
    });

    expect(result).toMatchObject({
      firstClearAp: 12,
      questSweepAp: 0,
      extraSweepAp: 36,
      totalApWithExtras: 48,
    });
  });

  it("includes simulated treasure rewards in the shared AP calculation ledger", () => {
    const state = createDefaultEventShopState([], []);
    state.minigamePlayCount = 6;
    const result = calculateShopApRequirement({
      state,
      stages: [],
      shopResources: [],
      appliedBonusRatio: {},
      minigameConfig: {
        minigameType: "treasure_hunt",
        payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "legacy-cost", quantity: 10 },
        payments: [],
        rewardGroups: [],
      },
      minigamePaymentCosts: [{ resourceType: ResourceTypeEnum.Item, resourceUid: "yukari", quantity: 7000 }],
      minigameRewards: [
        { resourceType: ResourceTypeEnum.Item, resourceUid: "renge", quantity: 200 },
        { resourceType: ResourceTypeEnum.Currency, resourceUid: "credit", quantity: 8320000 },
      ],
    });

    expect(result.itemBreakdown.toPlayMinigame).toEqual({ yukari: 7000 });
    expect(result.itemBreakdown.fromMinigame).toEqual({ renge: 200, credit: 8320000 });
    expect(result.itemBreakdown.remaining).toMatchObject({ renge: 200, credit: 8320000 });
    expect(result.unobtainableTargets).toEqual({ yukari: 7000 });
  });
});
