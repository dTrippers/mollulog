import { performance } from "node:perf_hooks";
import { describe, expect, it } from "@jest/globals";
import type { RewardItem, RoadPuzzleConfig, RoadPuzzleMap } from "~/domain/event-shop";
import {
  getRoadPuzzleRoundRows,
  getRoadPuzzleTotalCost,
  getRoadPuzzleTotalRewards,
} from "~/domain/road-puzzle/calculator";
import type { RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
import { ResourceTypeEnum } from "~/graphql/graphql";

const expectedMapCosts = [1_950, 4_500, 4_484, 4_429, 3_241, 2_685, 2_682, 2_603, 2_615, 2_752, 2_601];
const minimumMapCosts = [1_950, 4_500, 4_200, 3_750, 2_850, 2_250, 2_250, 2_250, 2_250, 2_250, 2_250];
const mapUids = expectedMapCosts.map((_, index) => `map-${index + 1}`);

const reward = (uid: string, name: string, quantity: number): RewardItem => ({
  resourceType: ResourceTypeEnum.Item,
  resourceUid: uid,
  resourceName: name,
  quantity,
});

const rounds: RoadPuzzleConfig["rounds"] = Array.from({ length: 7 }, (_, index) => {
  const round = index + 1;
  return {
    round,
    isLoop: round === 7,
    mapUids: round === 7 ? mapUids.slice(6) : [mapUids[index]!],
    rewards: [reward("wrench", "파이프 렌치", round === 7 ? 10 : 5)],
    additionalRewards: [reward("path-credit", "크레딧", 100)],
  };
});

const config: RoadPuzzleConfig = {
  instantClearRound: 7,
  railSetReward: [reward("rail-set", "크레딧", 7_500)],
  rounds,
  maps: mapUids.map((uid) => ({
    uid,
    name: uid,
    deck: { straight: 1, longCurve: 1, shortCurve: 1 },
    tiles: [],
    fixedRails: [],
  })) as RoadPuzzleMap[],
};

const solutionsByUid = Object.fromEntries(
  mapUids.map((uid, index) => {
    const minimumTiles = minimumMapCosts[index]! / 150;
    const expectedTiles = expectedMapCosts[index]! / 150;
    const solution: RoadPuzzleSolution = {
      paretoVectors: [],
      minimumVector: { straight: minimumTiles, longCurve: 0, shortCurve: 0 },
      witness: [],
      minimumTiles,
      maximumTiles: 30,
      expectedTiles,
      minimumStickers: minimumMapCosts[index]!,
      maximumStickers: 4_500,
      expectedStickers: expectedMapCosts[index]!,
    };
    return [uid, solution];
  }),
);

describe("road puzzle calculator", () => {
  it("uses the six fixed rounds and the five-map loop average for total sticker cost", () => {
    const expectedRounds1To6 = expectedMapCosts.slice(0, 6).reduce((sum, cost) => sum + cost, 0);
    expect(getRoadPuzzleTotalCost(config, solutionsByUid, 1, 9, "expected", 150)).toBe(expectedRounds1To6 + 3 * 2_651);
    expect(getRoadPuzzleTotalCost(config, solutionsByUid, 3, 9, "expected", 150)).toBe(
      expectedMapCosts.slice(2, 6).reduce((sum, cost) => sum + cost, 0) + 3 * 2_651,
    );
  });

  it("keeps the loop row at one run of rewards while totals scale by loop count", () => {
    const rows = getRoadPuzzleRoundRows(config, solutionsByUid, 1, 9, 150);
    expect(rows).toHaveLength(7);
    expect(rows[6]).toMatchObject({ round: 7, isLoop: true, loopCount: 3, selected: true });
    expect(rows[6]?.completionRewards).toEqual([reward("wrench", "파이프 렌치", 10)]);
    expect(getRoadPuzzleTotalRewards(config, 1, 9).find(({ resourceUid }) => resourceUid === "wrench")?.quantity).toBe(
      60,
    );
    expect(getRoadPuzzleTotalRewards(config, 1, 9).map(({ resourceUid }) => resourceUid)).not.toContain("path-credit");
    expect(getRoadPuzzleTotalRewards(config, 1, 9).map(({ resourceUid }) => resourceUid)).not.toContain("rail-set");
  });

  it("aggregates very large target rounds using the fixed rounds and loop formula", () => {
    const targetRound = 100_000_000;
    const fixedRoundCost = expectedMapCosts.slice(0, 6).reduce((sum, cost) => sum + cost, 0);
    const startedAt = performance.now();
    const totalCost = getRoadPuzzleTotalCost(config, solutionsByUid, 1, targetRound, "expected", 150);
    const totalRewards = getRoadPuzzleTotalRewards(config, 1, targetRound);
    const elapsedMs = performance.now() - startedAt;

    expect(totalCost).toBe(fixedRoundCost + (targetRound - 6) * 2_651);
    expect(totalRewards.find(({ resourceUid }) => resourceUid === "wrench")?.quantity).toBe(
      6 * 5 + (targetRound - 6) * 10,
    );
    expect(elapsedMs).toBeLessThan(100);
  });
});
