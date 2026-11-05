import { describe, expect, it } from "@jest/globals";
import { calculateShopApRequirement } from "~/domain/event-shop/calculations/calculate-shop-ap";
import type { Stage } from "../../../../../../../app/domain/event-shop";
import { createDefaultEventShopState } from "../../../../../../../app/domain/event-shop-state";
import { ResourceTypeEnum } from "../../../../../../../app/graphql/graphql";
import { janken860Fixture } from "../../../../../domain/fixtures/janken-860";

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

  it("includes janken entry costs and rewards in the shared AP calculation ledger", () => {
    const entryStage: Stage = {
      uid: "entry-farm",
      index: "9",
      entryAp: 6,
      difficulty: 1,
      rewards: [
        {
          amount: 400,
          rewardRequirement: null,
          chance: "1.0",
          item: { uid: "80860", name: "Entry currency", category: "coin", rarity: 1 },
        },
      ],
    };
    const state = createDefaultEventShopState([entryStage], []);
    state.enabledStages[entryStage.uid] = true;

    const result = calculateShopApRequirement({
      state,
      stages: [entryStage],
      shopResources: [],
      appliedBonusRatio: {},
      jankenStagePlays: { "100860204": 2 },
      jankenClearedStageUids: [
        "100860101",
        "100860102",
        "100860103",
        "100860104",
        "100860105",
        "100860201",
        "100860202",
        "100860203",
      ],
      minigameConfig: {
        minigameType: "janken",
        payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 100 },
        payments: [],
        rewardGroups: [],
        janken: janken860Fixture,
      },
    });

    expect(result.totalApWithExtras).toBe(12);
    expect(result.stageRuns).toEqual({ "entry-farm": 2 });
  });
});
