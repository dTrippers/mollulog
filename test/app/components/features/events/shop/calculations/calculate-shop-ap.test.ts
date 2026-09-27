import { describe, expect, it } from "@jest/globals";
import { calculateShopApRequirement } from "../../../../../../../app/components/features/events/shop/calculations/calculate-shop-ap";
import type { Stage } from "../../../../../../../app/domain/event-shop";
import { createDefaultEventShopState } from "../../../../../../../app/domain/event-shop-state";

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
});
