import { describe, expect, it } from "@jest/globals";
import {
  analyzeTreasureHuntBoard,
  InvalidTreasureHuntObservationError,
  type TreasureHuntComposition,
} from "~/domain/treasure-hunt";

const roundOne: TreasureHuntComposition = {
  boardWidth: 9,
  boardHeight: 5,
  pieces: [
    { width: 3, height: 2, count: 2 },
    { width: 3, height: 1, count: 5 },
    { width: 1, height: 2, count: 2 },
  ],
};

const emptyObservation = { knownEmpty: [], foundTreasures: [] };

describe("analyzeTreasureHuntBoard", () => {
  it("returns 10847 round-one marginals whose sum is the 31 treasure cells", () => {
    const result = analyzeTreasureHuntBoard(roundOne, emptyObservation);

    expect(result.status).toBe("ok");
    expect(result.cells).toHaveLength(5);
    expect(result.cells?.every((row) => row.length === 9)).toBe(true);
    const probabilitySum = result.cells?.flat().reduce<number>((sum, probability) => sum + (probability ?? 0), 0) ?? 0;
    expect(probabilitySum).toBeCloseTo(31, 10);
    expect(result.remaining.map(({ width, height, count }) => ({ width, height, count }))).toEqual([
      { width: 1, height: 2, count: 2 },
      { width: 1, height: 3, count: 5 },
      { width: 2, height: 3, count: 2 },
    ]);
  });

  it("is symmetric left-right, top-bottom, and under a 180 degree rotation", () => {
    const cells = analyzeTreasureHuntBoard(roundOne, emptyObservation).cells;
    expect(cells).not.toBeNull();
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 9; x++) {
        expect(cells?.[y]?.[x]).toBe(cells?.[y]?.[8 - x]);
        expect(cells?.[y]?.[x]).toBe(cells?.[4 - y]?.[x]);
        expect(cells?.[y]?.[x]).toBe(cells?.[4 - y]?.[8 - x]);
      }
    }
  });

  it("returns identical probabilities for composition-equivalent rounds 1 and 4", () => {
    const roundFour: TreasureHuntComposition = {
      ...roundOne,
      pieces: [
        { width: 1, height: 2, count: 2 },
        { width: 1, height: 3, count: 5 },
        { width: 2, height: 3, count: 2 },
      ],
    };
    const roundOneResult = analyzeTreasureHuntBoard(roundOne, emptyObservation);
    const roundFourResult = analyzeTreasureHuntBoard(roundFour, emptyObservation);

    expect(roundFourResult.cells).toEqual(roundOneResult.cells);
    expect(roundFourResult.recommended).toEqual(roundOneResult.recommended);
  });

  it("marks recorded cells null and decrements a rotation-matched treasure shape", () => {
    const result = analyzeTreasureHuntBoard(roundOne, {
      knownEmpty: [{ x: 8, y: 4 }],
      foundTreasures: [{ x: 0, y: 0, width: 2, height: 3, orientation: "horizontal" }],
    });

    expect(result.status).toBe("ok");
    expect(result.cells?.[4]?.[8]).toBeNull();
    expect(result.cells?.[0]?.slice(0, 3)).toEqual([null, null, null]);
    expect(result.cells?.[1]?.slice(0, 3)).toEqual([null, null, null]);
    expect(result.remaining).toContainEqual({ width: 2, height: 3, count: 1 });
  });

  it("groups rotation-equivalent composition entries and validates placed direction", () => {
    const composition: TreasureHuntComposition = {
      boardWidth: 5,
      boardHeight: 3,
      pieces: [
        { width: 3, height: 1, count: 1 },
        { width: 1, height: 3, count: 1 },
      ],
    };
    const result = analyzeTreasureHuntBoard(composition, {
      knownEmpty: [],
      foundTreasures: [{ x: 0, y: 0, width: 1, height: 3, orientation: "vertical" }],
    });

    expect(result.status).toBe("ok");
    expect(result.cells?.[0]?.[0]).toBeNull();
    expect(result.cells?.[1]?.[0]).toBeNull();
    expect(result.cells?.[2]?.[0]).toBeNull();
    expect(result.remaining).toEqual([{ width: 1, height: 3, count: 1 }]);
  });

  it("transposes canonical solver coordinates back to portrait board coordinates", () => {
    const portrait: TreasureHuntComposition = {
      boardWidth: 3,
      boardHeight: 5,
      pieces: [{ width: 2, height: 1, count: 1 }],
    };
    const landscape: TreasureHuntComposition = {
      boardWidth: 5,
      boardHeight: 3,
      pieces: [{ width: 2, height: 1, count: 1 }],
    };
    const portraitCells = analyzeTreasureHuntBoard(portrait, emptyObservation).cells;
    const landscapeCells = analyzeTreasureHuntBoard(landscape, emptyObservation).cells;

    expect(portraitCells).toHaveLength(5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        expect(portraitCells?.[y]?.[x]).toBe(landscapeCells?.[x]?.[y]);
      }
    }

    const portraitObserved = analyzeTreasureHuntBoard(portrait, {
      knownEmpty: [{ x: 1, y: 4 }],
      foundTreasures: [{ x: 0, y: 0, width: 2, height: 1, orientation: "horizontal" }],
    });
    expect(portraitObserved.cells?.[4]?.[1]).toBeNull();
    expect(portraitObserved.cells?.[0]?.[0]).toBeNull();
    expect(portraitObserved.cells?.[0]?.[1]).toBeNull();
  });

  it("returns zero probabilities and no recommendations when every treasure is found", () => {
    const result = analyzeTreasureHuntBoard(
      { boardWidth: 2, boardHeight: 1, pieces: [{ width: 1, height: 1, count: 1 }] },
      { knownEmpty: [], foundTreasures: [{ x: 0, y: 0, width: 1, height: 1, orientation: "horizontal" }] },
    );

    expect(result).toEqual({
      status: "ok",
      cells: [[null, 0]],
      recommended: [],
      remaining: [{ width: 1, height: 1, count: 0 }],
    });
  });

  it("returns inconsistent without fabricated probabilities when observations admit no layout", () => {
    const knownEmpty = Array.from({ length: 45 }, (_, index) => ({ x: index % 9, y: Math.floor(index / 9) }));
    const result = analyzeTreasureHuntBoard(roundOne, { knownEmpty, foundTreasures: [] });

    expect(result).toEqual({
      status: "inconsistent",
      cells: null,
      recommended: [],
      remaining: [
        { width: 1, height: 2, count: 2 },
        { width: 1, height: 3, count: 5 },
        { width: 2, height: 3, count: 2 },
      ],
    });
  });

  it("recommends exactly every unopened cell with the greatest probability", () => {
    const result = analyzeTreasureHuntBoard(roundOne, {
      knownEmpty: [
        { x: 0, y: 0 },
        { x: 8, y: 4 },
      ],
      foundTreasures: [{ x: 3, y: 1, width: 3, height: 2, orientation: "horizontal" }],
    });
    const hiddenProbabilities = result.cells?.flatMap((row, y) =>
      row.flatMap((probability, x) => (probability === null ? [] : [{ x, y, probability }])),
    );
    const maximum = Math.max(...(hiddenProbabilities?.map(({ probability }) => probability) ?? []));
    const expected = (hiddenProbabilities ?? [])
      .filter(({ probability }) => probability === maximum)
      .map(({ x, y }) => ({ x, y }));

    expect(result.recommended).toEqual(expected);
  });

  it.each([
    {
      label: "out-of-bounds empty coordinate",
      observation: { knownEmpty: [{ x: 9, y: 0 }], foundTreasures: [] },
    },
    {
      label: "overlapping found treasures",
      observation: {
        knownEmpty: [],
        foundTreasures: [
          { x: 0, y: 0, width: 3, height: 2, orientation: "horizontal" as const },
          { x: 1, y: 0, width: 3, height: 2, orientation: "horizontal" as const },
        ],
      },
    },
    {
      label: "treasure footprint outside the board",
      observation: {
        knownEmpty: [],
        foundTreasures: [{ x: 8, y: 4, width: 3, height: 2, orientation: "horizontal" as const }],
      },
    },
    {
      label: "too many found treasures of a shape",
      observation: {
        knownEmpty: [],
        foundTreasures: [
          { x: 0, y: 0, width: 3, height: 2, orientation: "horizontal" as const },
          { x: 3, y: 0, width: 2, height: 3, orientation: "horizontal" as const },
          { x: 6, y: 0, width: 2, height: 3, orientation: "horizontal" as const },
        ],
      },
    },
  ])("rejects $label", ({ observation }) => {
    expect(() => analyzeTreasureHuntBoard(roundOne, observation)).toThrow(InvalidTreasureHuntObservationError);
  });
});
