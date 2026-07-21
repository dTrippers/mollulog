import { describe, expect, it } from "@jest/globals";
import Decimal from "decimal.js";
import { calculateItemBreakdowns } from "../../../../../../../app/components/features/events/shop/calculations/breakdown";
import type { ResourceLedger } from "../../../../../../../app/components/features/events/shop/calculations/types";
import type { Stage } from "../../../../../../../app/domain/event-shop";

const resourceLedger: ResourceLedger = {
  requiredForShopItems: { coin: 100 },
  requiredForMinigame: {},
  requiredTotals: { coin: 100 },
  existing: { coin: 10 },
  fromFirstRun: { coin: 5 },
  fromShop: { coin: 10 },
  fromMinigame: { coin: 5 },
  acquiredBeforeSweeps: { coin: 30 },
  remainingToFarm: { coin: 70 },
};

const stages: Stage[] = [
  {
    uid: "story",
    index: "1",
    entryAp: 5,
    difficulty: 0,
    rewards: [],
  },
  {
    uid: "quest",
    index: "9",
    entryAp: 20,
    difficulty: 1,
    rewards: [
      {
        amount: 50,
        rewardRequirement: "FirstClear",
        chance: "1.0",
        item: { uid: "coin", name: "이벤트 재화", category: "coin", rarity: 1 },
      },
      {
        amount: 10,
        rewardRequirement: null,
        chance: "1.0",
        item: { uid: "coin", name: "이벤트 재화", category: "coin", rarity: 1 },
      },
    ],
  },
];

describe("calculateItemBreakdowns", () => {
  it("combines first-clear, calculated, and extra sweep AP with ledger remaining quantities", () => {
    const result = calculateItemBreakdowns({
      stages,
      enabledStages: { story: false, quest: true },
      stageRuns: { quest: 2 },
      extraStageRuns: { quest: 1 },
      appliedBonusRatio: { coin: new Decimal("0.5") },
      includeFirstClear: true,
      resourceLedger,
    });

    expect(result).toMatchObject({
      totalAp: 40,
      firstClearAp: 25,
      questSweepAp: 40,
      extraSweepAp: 20,
      totalApWithExtras: 85,
      itemBreakdown: {
        existing: { coin: 10 },
        fromFirstRun: { coin: 5 },
        fromShop: { coin: 10 },
        fromMinigame: { coin: 5 },
        fromRepeatedRuns: { coin: 45 },
        toBuyShopItems: { coin: 100 },
        remaining: { coin: -25 },
      },
    });
  });
});
