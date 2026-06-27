import { describe, expect, it, jest } from "@jest/globals";
import { ResourceTypeEnum } from "../../../app/graphql/graphql";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));
import {
  type FarmingStage,
  buildEquipmentFarmingNeeded,
  buildEquipmentFarmingRequirements,
  buildFarmingRecommendations,
} from "~/domain/farming-recommendation";
import type { StudentGrowthResourceRequirements } from "../../../app/models/growth-resource";

function requirement(items: StudentGrowthResourceRequirements["items"]): StudentGrowthResourceRequirements {
  return {
    items,
    characterExp: 0,
    credit: 0,
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

  it("scores repeatable equipment drops and keeps the full stage drop list", () => {
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
    expect(recommendations[0].spreadsheetScore).toBeCloseTo(6580);
    expect(recommendations[0].estimatedAp).toBeCloseTo(111.11111111111111);
    expect(recommendations[0].matches).toEqual([
      { uid: "101001", name: undefined, probability: 0.4, needed: 20, score: 16 },
      { uid: "102001", name: undefined, probability: 0.2, needed: 10, score: 4 },
    ]);
    expect(recommendations[0].drops.map((drop) => drop.uid)).toEqual(["101002", "101001", "102001"]);
    expect(recommendations[0].drops.find((drop) => drop.uid === "101002")).toMatchObject({
      probability: 0.8,
      needed: 0,
      score: 0,
    });
  });

  it("filters by difficulty, removes stages that cannot reduce needs, and sorts by fixed sheet-style score", () => {
    const recommendations = buildFarmingRecommendations(
      { "101001": 10, "102005": 20 },
      [
        stage({
          uid: "normal-low",
          area: "11",
          stageNumber: "1",
          difficulty: 0,
          rewards: [{ uid: "101001", rewardType: "equipment", rewardTag: null, probability: 0.1 }],
        }),
        stage({
          uid: "normal-high",
          area: "29",
          stageNumber: "2",
          difficulty: 0,
          rewards: [{ uid: "102005", rewardType: "equipment", rewardTag: null, probability: 0.5 }],
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
    expect(recommendations.map((recommendation) => recommendation.spreadsheetScore)).toEqual([6880, 3440]);
    expect(recommendations.map((recommendation) => recommendation.estimatedAp)).toEqual([581.3953488372093, 125]);
  });

  it("applies expert permit blueprint costs as tier weights", () => {
    const recommendations = buildFarmingRecommendations(
      { "101001": 5, "102002": 5 },
      [
        stage({
          uid: "lower-stage",
          area: "20",
          stageNumber: "1",
          rewards: [{ uid: "101001", rewardType: "equipment", rewardTag: null, probability: 1 }],
        }),
        stage({
          uid: "higher-stage",
          area: "20",
          stageNumber: "1",
          apCost: 20,
          rewards: [{ uid: "102002", rewardType: "equipment", rewardTag: null, probability: 0.5 }],
        }),
      ],
      { prioritizeHighTier: true },
    );

    expect(recommendations.map((recommendation) => recommendation.stage.uid)).toEqual(["higher-stage", "lower-stage"]);
    expect(recommendations.map((recommendation) => recommendation.spreadsheetScore)).toEqual([41280, 34400]);
    expect(recommendations[0].matches).toEqual([
      { uid: "102002", name: undefined, probability: 0.5, needed: 5, score: 2.5 },
    ]);
    expect(recommendations[0].drops.map((drop) => drop.uid)).toEqual(["102002"]);
  });

  it("ignores tier weights by default when high-tier priority is disabled", () => {
    const recommendations = buildFarmingRecommendations({ "101001": 5, "102002": 5 }, [
      stage({
        uid: "lower-stage",
        area: "20",
        stageNumber: "1",
        rewards: [{ uid: "101001", rewardType: "equipment", rewardTag: null, probability: 1 }],
      }),
      stage({
        uid: "higher-stage",
        area: "21",
        stageNumber: "1",
        apCost: 20,
        rewards: [{ uid: "102002", rewardType: "equipment", rewardTag: null, probability: 0.5 }],
      }),
    ]);

    expect(recommendations.map((recommendation) => recommendation.stage.uid)).toEqual(["higher-stage", "lower-stage"]);
    expect(recommendations.map((recommendation) => recommendation.spreadsheetScore)).toEqual([1720, 1720]);
  });

  it("can prefer a high-area stage even when the raw expected drop score is lower", () => {
    const recommendations = buildFarmingRecommendations(
      { "101004": 1, "101009": 2 },
      [
        stage({
          uid: "low-area",
          area: "13",
          stageNumber: "1",
          rewards: [{ uid: "101004", rewardType: "equipment", rewardTag: null, probability: 0.72 }],
        }),
        stage({
          uid: "high-area",
          area: "29",
          stageNumber: "1",
          rewards: [{ uid: "101009", rewardType: "equipment", rewardTag: null, probability: 0.344 }],
        }),
      ],
      { prioritizeHighTier: true },
    );

    expect(recommendations.map((recommendation) => recommendation.stage.uid)).toEqual(["high-area", "low-area"]);
    expect(recommendations.map((recommendation) => recommendation.score)).toEqual([0.688, 0.72]);
    expect(recommendations.map((recommendation) => recommendation.spreadsheetScore)).toEqual([688000, 12384]);
  });

  it("gives unavailable T10 blueprints a high farming priority weight", () => {
    const farmingNeeded = { "106001": 840, "106003": 210, "106009": 483 };
    const stages = [
      stage({
        uid: "normal-11-2",
        area: "11",
        stageNumber: "2",
        rewards: [
          { uid: "106003", rewardType: "equipment", rewardTag: null, probability: 0.8 },
          { uid: "106001", rewardType: "equipment", rewardTag: null, probability: 0.2 },
        ],
      }),
      stage({
        uid: "normal-29-2",
        area: "29",
        stageNumber: "2",
        rewards: [{ uid: "106009", rewardType: "equipment", rewardTag: null, probability: 0.344 }],
      }),
    ];
    const recommendations = buildFarmingRecommendations(farmingNeeded, stages, { prioritizeHighTier: true });

    expect(recommendations.map((recommendation) => recommendation.stage.uid)).toEqual(["normal-29-2", "normal-11-2"]);
    expect(recommendations.map((recommendation) => recommendation.spreadsheetScore)).toEqual([166152000, 5382720]);
    expect(recommendations[0].estimatedAp).toBeCloseTo(14040.697674418605);
    expect(recommendations[1].estimatedAp).toBe(2625);

    const equalTierRecommendations = buildFarmingRecommendations(farmingNeeded, stages, {
      prioritizeHighTier: false,
    });

    expect(equalTierRecommendations.map((recommendation) => recommendation.stage.uid)).toEqual([
      "normal-11-2",
      "normal-29-2",
    ]);
    expect(equalTierRecommendations.map((recommendation) => recommendation.spreadsheetScore)).toEqual([240240, 166152]);
  });
});
