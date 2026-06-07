import { describe, expect, it } from "@jest/globals";
import { ResourceTypeEnum } from "../../../app/graphql/graphql";
import {
  type FarmingStage,
  buildEquipmentFarmingNeeded,
  buildEquipmentFarmingRequirements,
  buildFarmingRecommendations,
} from "../../../app/models/farming-recommendation";
import type { StudentGrowthResourceRequirements } from "../../../app/models/growth-resource";

function requirement(items: StudentGrowthResourceRequirements["items"]): StudentGrowthResourceRequirements {
  return {
    items,
    characterExp: 0,
    skillUnavailable: false,
  };
}

function stage(overrides: Partial<FarmingStage>): FarmingStage {
  return {
    uid: "stage-1",
    name: "1-1",
    area: "1",
    stageNumber: "1",
    difficulty: 0,
    apCost: 10,
    rewards: [],
    ...overrides,
  };
}

describe("farming-recommendation", () => {
  it("calculates blueprint farming needs from required minus owned quantities", () => {
    const requirements = [
      requirement([
        {
          uid: "101001",
          type: ResourceTypeEnum.Equipment,
          rarity: 1,
          amount: 25,
          source: "equipment",
        },
        {
          uid: "101002",
          type: ResourceTypeEnum.Equipment,
          rarity: 1,
          amount: 10,
          source: "equipment",
        },
        {
          uid: "1000",
          type: ResourceTypeEnum.Equipment,
          rarity: 1,
          amount: 99,
          source: "equipment",
        },
        {
          uid: "3000",
          type: ResourceTypeEnum.Item,
          rarity: 1,
          amount: 12,
          source: "skill",
        },
      ]),
      requirement([
        {
          uid: "101001",
          type: ResourceTypeEnum.Equipment,
          rarity: 1,
          amount: 5,
          source: "equipment",
        },
      ]),
    ];

    expect(buildEquipmentFarmingNeeded(requirements, { "101001": 8, "101002": 20 })).toEqual({
      "101001": 22,
    });
    expect(buildEquipmentFarmingRequirements(requirements, { "101001": 8, "101002": 20 })).toEqual([
      {
        uid: "101001",
        required: 30,
        owned: 8,
        needed: 22,
      },
    ]);
  });

  it("scores repeatable equipment drops and excludes one-time or non-probability rewards", () => {
    const recommendations = buildFarmingRecommendations(
      { "101001": 20, "102001": 10 },
      [
        stage({
          uid: "stage-1",
          rewards: [
            { uid: "101001", rewardType: "equipment", rewardTag: null, probability: 0.4 },
            { uid: "102001", rewardType: "equipment", rewardTag: null, probability: 0.2 },
            { uid: "101002", rewardType: "equipment", rewardTag: null, probability: 0.8 },
            { uid: "101001", rewardType: "equipment", rewardTag: "first_clear", probability: 1 },
            { uid: "102001", rewardType: "equipment", rewardTag: "three_star", probability: 1 },
            { uid: "102001", rewardType: "equipment", rewardTag: null, probability: null },
            { uid: "101001", rewardType: "item", rewardTag: null, probability: 1 },
          ],
        }),
      ],
      { dropMultiplier: 2 },
    );

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].score).toBeCloseTo(20);
    expect(recommendations[0].matches).toEqual([
      { uid: "101001", name: undefined, probability: 0.4, needed: 20 },
      { uid: "102001", name: undefined, probability: 0.2, needed: 10 },
    ]);
  });

  it("filters by difficulty, removes zero-score stages, and sorts by descending score", () => {
    const recommendations = buildFarmingRecommendations(
      { "101001": 10, "102001": 20 },
      [
        stage({
          uid: "normal-low",
          area: "2",
          stageNumber: "1",
          difficulty: 0,
          rewards: [{ uid: "101001", rewardType: "equipment", rewardTag: null, probability: 0.1 }],
        }),
        stage({
          uid: "normal-high",
          area: "1",
          stageNumber: "2",
          difficulty: 0,
          rewards: [{ uid: "102001", rewardType: "equipment", rewardTag: null, probability: 0.5 }],
        }),
        stage({
          uid: "hard",
          area: "1",
          stageNumber: "1",
          difficulty: 1,
          rewards: [{ uid: "102001", rewardType: "equipment", rewardTag: null, probability: 0.9 }],
        }),
        stage({
          uid: "zero",
          area: "1",
          stageNumber: "3",
          difficulty: 0,
          rewards: [{ uid: "103001", rewardType: "equipment", rewardTag: null, probability: 1 }],
        }),
      ],
      { difficulty: "normal" },
    );

    expect(recommendations.map((recommendation) => recommendation.stage.uid)).toEqual(["normal-high", "normal-low"]);
    expect(recommendations.map((recommendation) => recommendation.score)).toEqual([10, 1]);
  });
});
