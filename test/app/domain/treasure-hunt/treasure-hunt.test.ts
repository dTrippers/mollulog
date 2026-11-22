import { describe, expect, it } from "@jest/globals";
import {
  areTreasureHuntRoundEconomicsCompatible,
  combineOpenedCellHistograms,
  countTreasureHuntArrangements,
  createTreasureHuntSimulator,
  histogramPercentile,
  type OpenedCellHistogram,
  openedCellPercentile,
  type TreasureHuntComposition,
  treasureHuntCompositionSignature,
} from "~/domain/treasure-hunt";

import { compositions } from "./compositions";

describe("treasure hunt composition signatures and arrangement counts", () => {
  it("canonicalizes board rotation, piece rotation, and piece ordering", () => {
    const composition: TreasureHuntComposition = {
      boardWidth: 9,
      boardHeight: 5,
      pieces: [
        { width: 3, height: 2, count: 2 },
        { width: 1, height: 3, count: 5 },
        { width: 2, height: 1, count: 2 },
      ],
    };
    const rotated: TreasureHuntComposition = {
      boardWidth: 5,
      boardHeight: 9,
      pieces: [
        { width: 2, height: 1, count: 2 },
        { width: 3, height: 1, count: 5 },
        { width: 2, height: 3, count: 2 },
      ],
    };
    expect(treasureHuntCompositionSignature(rotated)).toBe(treasureHuntCompositionSignature(composition));
  });

  it.each(compositions)("counts exact rotation-permitting arrangements for $label", ({
    label,
    composition,
    arrangements,
  }) => {
    expect(countTreasureHuntArrangements(composition)).toBe(arrangements);
  });
});

describe("treasure hunt deterministic simulations", () => {
  it("returns identical games for the same composition and game indexes", () => {
    const composition: TreasureHuntComposition = {
      boardWidth: 3,
      boardHeight: 2,
      pieces: [
        { width: 1, height: 1, count: 1 },
        { width: 2, height: 1, count: 1 },
      ],
    };
    const first = createTreasureHuntSimulator(composition);
    const second = createTreasureHuntSimulator({ ...composition, pieces: [...composition.pieces].reverse() });
    const allGames = Array.from({ length: 40 }, (_, gameIndex) => first.simulateGame(gameIndex));
    const splitGames = [
      ...Array.from({ length: 17 }, (_, gameIndex) => second.simulateGame(gameIndex)),
      ...Array.from({ length: 23 }, (_, index) => second.simulateGame(index + 17)),
    ];

    expect(splitGames).toEqual(allGames);
  });
});

describe("opened-cell statistics", () => {
  it("convolves empirical distributions with repeated round multiplicity", () => {
    const distribution = combineOpenedCellHistograms([
      { histogram: { minCells: 2, counts: [1, 1] }, multiplicity: 2 },
      { histogram: { minCells: 1, counts: [1, 3] }, multiplicity: 1 },
    ]);

    expect(distribution).toEqual({
      minCells: 5,
      counts: [1n, 5n, 7n, 3n],
      total: 16n,
    });
    expect([0.1, 0.5, 0.9].map((p) => openedCellPercentile(distribution, p as 0.1 | 0.5 | 0.9))).toEqual([6, 7, 8]);
  });

  it("uses the first cumulative histogram value to reach each percentile", () => {
    const histogram: OpenedCellHistogram = { minCells: 10, counts: [1, 7, 2] };
    expect(histogramPercentile(histogram, 0.1)).toBe(10);
    expect(histogramPercentile(histogram, 0.5)).toBe(11);
    expect(histogramPercentile(histogram, 0.9)).toBe(12);
  });
});

describe("treasure hunt round economics compatibility", () => {
  const base = {
    cellCost: { resourceType: "Item", resourceUid: "yukari", quantity: 200 },
    openCellRewards: [{ resourceType: "Currency", resourceUid: "credit", quantity: 40_000 }],
  };

  it("ignores reward order and combines duplicate rows for the same resource", () => {
    expect(
      areTreasureHuntRoundEconomicsCompatible([
        base,
        {
          ...base,
          openCellRewards: [
            { resourceType: "Currency", resourceUid: "credit", quantity: 10_000 },
            { resourceType: "Currency", resourceUid: "credit", quantity: 30_000 },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("rejects different cell payment or per-cell open rewards", () => {
    expect(
      areTreasureHuntRoundEconomicsCompatible([base, { ...base, cellCost: { ...base.cellCost, quantity: 201 } }]),
    ).toBe(false);
    expect(
      areTreasureHuntRoundEconomicsCompatible([
        base,
        { ...base, openCellRewards: [{ ...base.openCellRewards[0]!, quantity: 39_999 }] },
      ]),
    ).toBe(false);
  });
});
