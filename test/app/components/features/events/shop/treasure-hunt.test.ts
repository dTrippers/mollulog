import { describe, expect, it } from "@jest/globals";
import { normalizeClueSearchRoundRange } from "~/components/features/events/shop/clue-search";
import {
  areTreasureHuntRangeEconomicsCompatible,
  calculateTreasureHuntEstimate,
  getTreasureHuntCellCostResources,
  getTreasureHuntRoundRows,
  getTreasureHuntTreasureRewards,
  getTreasureHuntUniqueCompositions,
} from "~/components/features/events/shop/treasure-hunt";
import type { TreasureHuntConfig, TreasureHuntRoundConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { treasureHuntLocale } from "~/locales/ko";

function createRound(round: number, options: { cost?: number; treasureReward?: number } = {}): TreasureHuntRoundConfig {
  return {
    round,
    boardWidth: 3,
    boardHeight: 3,
    cellCost: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "yukari",
      resourceName: "유카리 목각인형",
      quantity: options.cost ?? 200,
    },
    openCellRewards: [
      {
        resourceType: ResourceTypeEnum.Currency,
        resourceUid: "credit",
        resourceName: "크레딧",
        quantity: 40,
      },
    ],
    treasures: [
      {
        uid: `treasure-${round}`,
        width: 1,
        height: 1,
        count: 2,
        rewards: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "renge",
            resourceName: "렌게 목각인형",
            quantity: options.treasureReward ?? 1,
          },
        ],
      },
    ],
  };
}

function createConfig(rounds: TreasureHuntRoundConfig[], loopRound = 3): TreasureHuntConfig {
  return { loopRound, rounds };
}

function containsBigInt(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "bigint") return true;
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => containsBigInt(child, seen));
}

describe("treasure hunt round range and estimates", () => {
  it("uses the approved basis and open-reward captions", () => {
    expect(treasureHuntLocale.costMode).toBe("보상 획득 기준");
    expect(treasureHuntLocale.openRewards).toBe("오픈 보상");
  });

  it("normalizes the saved completed-round range and compacts loop rounds", () => {
    expect(normalizeClueSearchRoundRange(3.8, 8.2)).toEqual({ startRound: 3, endRound: 8 });
    const rows = getTreasureHuntRoundRows(createConfig([createRound(1), createRound(2), createRound(3)]), 1, 8);
    expect(rows.map(({ round, multiplicity, isLoop }) => ({ round, multiplicity, isLoop }))).toEqual([
      { round: 1, multiplicity: 1, isLoop: false },
      { round: 2, multiplicity: 1, isLoop: false },
      { round: 3, multiplicity: 6, isLoop: true },
    ]);
  });

  it("rejects a selected range whose per-cell economics differ", () => {
    const rows = getTreasureHuntRoundRows(createConfig([createRound(1), createRound(2, { cost: 250 })]), 1, 2);
    expect(areTreasureHuntRangeEconomicsCompatible(rows)).toBe(false);
  });

  it("returns only unique per-round cell-cost resources for collectable treasure-hunt currencies", () => {
    const firstRound = createRound(1);
    const secondRound = createRound(2);

    expect(getTreasureHuntCellCostResources([firstRound, secondRound])).toEqual([firstRound.cellCost]);
  });

  it("combines round distributions before selecting percentiles and sums rewards", () => {
    const rows = getTreasureHuntRoundRows(createConfig([createRound(1), createRound(2, { treasureReward: 3 })]), 1, 2);
    const [composition] = getTreasureHuntUniqueCompositions(rows);
    expect(composition).toBeDefined();
    const signature = composition?.signature;
    if (!signature) throw new Error("Expected a treasure hunt composition.");

    const statsBySignature = {
      [signature]: {
        histogram: { minCells: 2, counts: [500, 0, 500] },
        completedGames: 1000,
        targetGames: 1000,
      },
    };
    const estimate = calculateTreasureHuntEstimate(rows, statsBySignature, "expected");
    const componentCalculation = {
      status: "ready",
      progress: 100,
      rows,
      statsBySignature,
      estimate,
      retry: () => undefined,
    };

    expect(estimate).not.toBeNull();
    expect(containsBigInt(componentCalculation)).toBe(false);
    expect(estimate?.openedCells).toBe(6);
    expect(estimate?.payment.quantity).toBe(1200);
    expect(estimate?.treasureRewards).toMatchObject([{ resourceUid: "renge", quantity: 8 }]);
    expect(estimate?.openCellRewards).toMatchObject([{ resourceUid: "credit", quantity: 240 }]);
    expect(estimate?.rounds.map(({ openedCells }) => openedCells)).toEqual([2, 2]);
    expect(getTreasureHuntTreasureRewards(rows)).toMatchObject([{ resourceUid: "renge", quantity: 8 }]);

    const topEstimate = calculateTreasureHuntEstimate(
      rows,
      {
        [signature]: {
          histogram: { minCells: 2, counts: [250, 0, 250] },
          completedGames: 500,
          targetGames: 1000,
        },
      },
      "min",
    );
    expect(topEstimate?.openedCells).toBe(4);
  });
});
