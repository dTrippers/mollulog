import { describe, expect, it } from "@jest/globals";
import Decimal from "decimal.js";
import {
  calculateStageInfos,
  optimizeStageRuns,
} from "../../../../../../../app/components/features/events/shop/calculations/optimization";
import type { StageInfo } from "../../../../../../../app/components/features/events/shop/calculations/types";
import type { Stage } from "../../../../../../../app/domain/event-shop";

function createStage(overrides: Partial<Stage>): Stage {
  return {
    uid: "stage",
    entryAp: 10,
    index: "1-1",
    difficulty: 0,
    rewards: [],
    ...overrides,
  };
}

function createStageInfo(overrides: Partial<StageInfo>): StageInfo {
  return {
    uid: overrides.uid ?? "stage",
    index: overrides.index ?? "1-1",
    entryAp: overrides.entryAp ?? new Decimal(10),
    rewardPerItem: overrides.rewardPerItem ?? {},
    contributes: overrides.contributes ?? true,
  };
}

function toPlainStageRuns(result: { stageRuns: Record<string, number>; totalAp: Decimal }) {
  return { stageRuns: result.stageRuns, totalAp: result.totalAp.toNumber() };
}

describe("calculateStageInfos", () => {
  it("only counts coin rewards without a reward requirement toward rewardPerItem", () => {
    const stages = [
      createStage({
        uid: "coin-stage",
        rewards: [
          {
            amount: 100,
            rewardRequirement: null,
            chance: null,
            item: { uid: "coin", name: "코인", category: "coin", rarity: 1 },
          },
          {
            amount: 5,
            rewardRequirement: null,
            chance: null,
            item: { uid: "material", name: "재료", category: "material", rarity: 1 },
          },
          {
            amount: 200,
            rewardRequirement: "some-condition",
            chance: null,
            item: { uid: "coin", name: "코인", category: "coin", rarity: 1 },
          },
        ],
      }),
    ];

    const [stageInfo] = calculateStageInfos(stages, { "coin-stage": true }, {}, [["coin", 1]]);

    expect(Object.keys(stageInfo.rewardPerItem)).toEqual(["coin"]);
    expect(stageInfo.rewardPerItem.coin.toNumber()).toBe(100);
  });

  it("applies the bonus ratio and rounds the bonus portion up", () => {
    const stages = [
      createStage({
        uid: "coin-stage",
        rewards: [
          {
            amount: 100,
            rewardRequirement: null,
            chance: null,
            item: { uid: "coin", name: "코인", category: "coin", rarity: 1 },
          },
        ],
      }),
    ];

    const [stageInfo] = calculateStageInfos(stages, { "coin-stage": true }, { coin: new Decimal(0.125) }, [
      ["coin", 1],
    ]);

    // 100 + ceil(0.125 * 100) = 100 + 13 = 113
    expect(stageInfo.rewardPerItem.coin.toNumber()).toBe(113);
  });

  it("excludes stages that are not enabled", () => {
    const stages = [createStage({ uid: "enabled" }), createStage({ uid: "disabled" })];

    const result = calculateStageInfos(stages, { enabled: true, disabled: false }, {}, []);

    expect(result.map((s) => s.uid)).toEqual(["enabled"]);
  });

  it("marks a stage as not contributing when it has no target rewards", () => {
    const stages = [
      createStage({
        uid: "coin-stage",
        rewards: [
          {
            amount: 100,
            rewardRequirement: null,
            chance: null,
            item: { uid: "coin", name: "코인", category: "coin", rarity: 1 },
          },
        ],
      }),
    ];

    const [withTarget] = calculateStageInfos(stages, { "coin-stage": true }, {}, [["coin", 1]]);
    const [withoutMatchingTarget] = calculateStageInfos(stages, { "coin-stage": true }, {}, [["other-item", 1]]);

    expect(withTarget.contributes).toBe(true);
    expect(withoutMatchingTarget.contributes).toBe(false);
  });
});

describe("optimizeStageRuns", () => {
  it("returns an empty result when there are no targets", () => {
    const stages = [createStageInfo({ uid: "a", rewardPerItem: { x: new Decimal(1) } })];

    expect(toPlainStageRuns(optimizeStageRuns(stages, []))).toEqual({ stageRuns: {}, totalAp: 0 });
  });

  it("returns an empty result when the target item cannot be obtained from any stage", () => {
    const stages = [createStageInfo({ uid: "a", rewardPerItem: { x: new Decimal(1) } })];

    expect(toPlainStageRuns(optimizeStageRuns(stages, [["unobtainable", 5]]))).toEqual({ stageRuns: {}, totalAp: 0 });
  });

  it("picks the cheaper-per-item stage when two stages provide the same reward", () => {
    // Stage A: 10 AP for 3 of item X (3.33 AP/unit)
    // Stage B: 6 AP for 2 of item X (3.00 AP/unit) -- strictly cheaper per unit
    const stages = [
      createStageInfo({ uid: "a", entryAp: new Decimal(10), rewardPerItem: { x: new Decimal(3) } }),
      createStageInfo({ uid: "b", entryAp: new Decimal(6), rewardPerItem: { x: new Decimal(2) } }),
    ];

    const result = optimizeStageRuns(stages, [["x", 10]]);

    expect(toPlainStageRuns(result)).toEqual({ stageRuns: { b: 5 }, totalAp: 30 });
  });

  it("rounds fractional stage runs up and does not reduce below the constraint", () => {
    // 10 AP for 3 units, needing 10 units -> 10/3 = 3.33, must round up to 4
    const stages = [createStageInfo({ uid: "a", entryAp: new Decimal(10), rewardPerItem: { x: new Decimal(3) } })];

    const result = optimizeStageRuns(stages, [["x", 10]]);

    expect(toPlainStageRuns(result)).toEqual({ stageRuns: { a: 4 }, totalAp: 40 });
  });

  it("combines two stages when a single stage cannot satisfy every target item", () => {
    // Stage C only gives item Y, stage D only gives item Z.
    const stages = [
      createStageInfo({ uid: "c", entryAp: new Decimal(5), rewardPerItem: { y: new Decimal(4) } }),
      createStageInfo({ uid: "d", entryAp: new Decimal(8), rewardPerItem: { z: new Decimal(2) } }),
    ];

    const result = optimizeStageRuns(stages, [
      ["y", 8],
      ["z", 4],
    ]);

    expect(toPlainStageRuns(result)).toEqual({ stageRuns: { c: 2, d: 2 }, totalAp: 26 });
  });

  it("does not add extra runs of a stage when a byproduct already satisfies a secondary target", () => {
    // Stage G is the only source of item X, and also yields Y as a byproduct.
    // Stage H is a cheap, Y-only stage that should stay unused because G's byproduct already covers Y.
    const stages = [
      createStageInfo({
        uid: "g",
        entryAp: new Decimal(10),
        rewardPerItem: { x: new Decimal(3), y: new Decimal(3) },
      }),
      createStageInfo({ uid: "h", entryAp: new Decimal(1), rewardPerItem: { y: new Decimal(1) } }),
    ];

    const result = optimizeStageRuns(stages, [
      ["x", 7],
      ["y", 1],
    ]);

    expect(toPlainStageRuns(result)).toEqual({ stageRuns: { g: 3 }, totalAp: 30 });
  });
});
