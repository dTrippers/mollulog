import { describe, expect, it } from "@jest/globals";
import type { RoadPuzzleMap } from "~/domain/event-shop";
import { analyzeRoadPuzzleMap, calculateExpectedDraws, solveRoadPuzzleMap } from "~/domain/road-puzzle/solver";
import fixture from "../../../fixtures/road-puzzle-10846-maps.json";

const maps = fixture.maps.map((map) => ({
  uid: map.uid,
  name: map.name.toLowerCase(),
  deck: {
    straight: map.deck.straight,
    longCurve: map.deck.long_curve,
    shortCurve: map.deck.short_curve,
  },
  tiles: map.tiles,
  fixedRails: map.fixed_rails.map((rail) => ({
    x: rail.x,
    y: rail.y,
    z: rail.z,
    entranceIndex: rail.entrance_index,
    exitIndex: rail.exit_index,
    rotation: rail.rotation,
  })),
})) as RoadPuzzleMap[];

const smallMap: RoadPuzzleMap = {
  uid: "small-map",
  name: "Small map",
  deck: { straight: 2, longCurve: 1, shortCurve: 1 },
  tiles: [
    { x: 0, y: 0, z: 0, type: 1, rotation: 0 },
    { x: 1, y: -1, z: 0, type: 5, rotation: 0 },
    { x: 2, y: -2, z: 0, type: 5, rotation: 0 },
    { x: 3, y: -3, z: 0, type: 2, rotation: 0 },
    { x: 5, y: -5, z: 0, type: 5, rotation: 0 },
  ],
  fixedRails: [
    { x: 0, y: 0, z: 0, entranceIndex: 1, exitIndex: 0, rotation: 0 },
    { x: 3, y: -3, z: 0, entranceIndex: 3, exitIndex: 0, rotation: 0 },
  ],
};

const markedReferenceCells = [
  { x: -4, y: 1, z: 3 },
  { x: -5, y: 2, z: 3 },
];

const expectedByMap: readonly [string, number, number, number][] = [
  ["roadpuzzlemapname_start2", 1_950, 1_950, 1_950],
  ["roadpuzzlemapname_easy2", 4_500, 4_500, 4_500],
  ["roadpuzzlemapname_lessstraight", 4_200, 4_484, 4_500],
  ["roadpuzzlemapname_easy1", 3_750, 4_429, 4_500],
  ["roadpuzzlemapname_30-1", 2_850, 3_241, 4_500],
  ["roadpuzzle_1", 2_250, 2_685, 4_500],
  ["roadpuzzle_2", 2_250, 2_682, 4_500],
  ["roadpuzzle_3", 2_250, 2_603, 4_500],
  ["roadpuzzle_4", 2_250, 2_615, 4_500],
  ["roadpuzzle_5", 2_250, 2_752, 4_500],
  ["roadpuzzle_6", 2_250, 2_601, 4_500],
];

const DIRECTIONS = [
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
] as const;

function hasRouteCounts(required: { straight: number; longCurve: number; shortCurve: number }, drawn: string[]) {
  const counts = {
    straight: drawn.filter((kind) => kind === "straight").length,
    longCurve: drawn.filter((kind) => kind === "longCurve").length,
    shortCurve: drawn.filter((kind) => kind === "shortCurve").length,
  };
  return (
    counts.straight >= required.straight &&
    counts.longCurve >= required.longCurve &&
    counts.shortCurve >= required.shortCurve
  );
}

describe("road puzzle solver", () => {
  it.each(expectedByMap)("matches the expected sticker draws for %s", (name, minimum, expected, maximum) => {
    const map = maps.find((item) => item.name === name);
    expect(map).toBeDefined();
    const solution = solveRoadPuzzleMap(map!);
    expect(solution).not.toBeNull();
    expect(solution!.minimumStickers).toBe(minimum);
    expect(Math.abs(Math.round(solution!.expectedStickers) - expected)).toBeLessThanOrEqual(1);
    expect(solution!.maximumStickers).toBe(maximum);
  });

  it.each(expectedByMap.map(([name]) => [name]))("returns a valid minimum witness for %s", (name) => {
    const map = maps.find((item) => item.name === name)!;
    const solution = solveRoadPuzzleMap(map)!;
    const steps = solution.witness;
    const pathTiles = new Map(map.tiles.map((tile) => [`${tile.x},${tile.y},${tile.z}`, tile]));

    expect(steps[0]?.tile).toBe("start");
    expect(steps.at(-1)?.tile).toBe("end");
    expect(new Set(steps.map(({ x, y, z }) => `${x},${y},${z}`)).size).toBe(steps.length);
    expect(steps.filter(({ tile }) => tile === "transit")).toHaveLength(
      map.tiles.filter(({ type }) => type === 3).length,
    );
    expect(steps.filter(({ tile }) => tile === "empty")).toHaveLength(solution.minimumTiles);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]!;
      const sourceTile = pathTiles.get(`${step.x},${step.y},${step.z}`);
      expect(sourceTile?.type).not.toBe(4);
      const next = steps[index + 1];
      if (!next) continue;
      const direction = DIRECTIONS.findIndex(
        ([x, y, z]) => next.x - step.x === x && next.y - step.y === y && next.z - step.z === z,
      );
      expect(direction).toBeGreaterThanOrEqual(0);
      if (step.tile !== "start") expect(step.exitIndex).toBe(direction);
      if (next.tile !== "end") expect(next.entryIndex).toBe((direction + 3) % 6);
    }

    const placed = steps.filter(({ tile }) => tile === "empty");
    const counts = {
      straight: placed.filter(({ railKind }) => railKind === "straight").length,
      longCurve: placed.filter(({ railKind }) => railKind === "longCurve").length,
      shortCurve: placed.filter(({ railKind }) => railKind === "shortCurve").length,
    };
    expect(counts.straight).toBeLessThanOrEqual(map.deck.straight);
    expect(counts.longCurve).toBeLessThanOrEqual(map.deck.longCurve);
    expect(counts.shortCurve).toBeLessThanOrEqual(map.deck.shortCurve);
    expect(placed.length * 150).toBe(solution.minimumStickers);
  });

  it("matches exhaustive drawing probabilities for a small deck", () => {
    const deck = { straight: 2, longCurve: 1, shortCurve: 1 };
    const paretoVectors = [
      { straight: 1, longCurve: 1, shortCurve: 0 },
      { straight: 0, longCurve: 0, shortCurve: 2 },
    ];
    const cards = ["straight", "straight", "longCurve", "shortCurve"];
    let stoppingDrawTotal = 0;
    let permutationCount = 0;

    const visit = (remaining: string[], drawn: string[]) => {
      if (remaining.length === 0) {
        permutationCount += 1;
        const stoppingDraw = drawn.findIndex((_, index) =>
          paretoVectors.some((required) => hasRouteCounts(required, drawn.slice(0, index + 1))),
        );
        stoppingDrawTotal += stoppingDraw >= 0 ? stoppingDraw + 1 : cards.length;
        return;
      }
      const choices = new Set(remaining);
      for (const choice of choices) {
        const index = remaining.indexOf(choice);
        visit([...remaining.slice(0, index), ...remaining.slice(index + 1)], [...drawn, choice]);
      }
    };
    visit(cards, []);

    expect(calculateExpectedDraws(deck, paretoVectors)).toBeCloseTo(stoppingDrawTotal / permutationCount, 10);
  });

  it("filters small-map routes through every marked empty tile", () => {
    const shortest = solveRoadPuzzleMap(smallMap)!;
    const marked = analyzeRoadPuzzleMap(smallMap, [{ x: 1, y: -1, z: 0 }], null);

    expect(shortest.paretoVectors).toEqual([{ straight: 2, longCurve: 0, shortCurve: 0 }]);
    expect(marked.status).toBe("planned");
    expect(marked.witness?.some((step) => step.x === 1 && step.y === -1 && step.z === 0)).toBe(true);
    expect(marked.minimumStickers).toBe(shortest.minimumStickers);
    expect(marked.delta).toEqual({ minimumStickers: 0, expectedStickers: 0 });
  });

  it("returns an explicit no-route result when a valid empty tile is disconnected", () => {
    const result = analyzeRoadPuzzleMap(smallMap, [{ x: 5, y: -5, z: 0 }], null);

    expect(result).toEqual({
      status: "no-route",
      witness: null,
      requiredVector: null,
      drawnVector: null,
      minimumStickers: null,
      expectedStickers: null,
      maximumStickers: null,
      delta: null,
    });
  });

  it("matches the constrained plan reference values for uid 10702", () => {
    const map = maps.find((item) => item.name === "roadpuzzle_2")!;
    const analysis = analyzeRoadPuzzleMap(map, markedReferenceCells, null);

    expect(analysis.status).toBe("planned");
    expect(analysis.requiredVector).toEqual({ straight: 4, longCurve: 10, shortCurve: 3 });
    expect(analysis.minimumStickers).toBe(2_550);
    expect(Math.round(analysis.expectedStickers!)).toBe(2_899);
    expect(analysis.maximumStickers).toBe(4_500);
    expect(analysis.delta).toEqual({ minimumStickers: 300, expectedStickers: 217 });
  });

  it("uses the drawn and remaining counts for incomplete and completable routes", () => {
    const map = maps.find((item) => item.name === "roadpuzzle_2")!;
    const incomplete = analyzeRoadPuzzleMap(map, markedReferenceCells, {
      straight: 3,
      longCurve: 7,
      shortCurve: 8,
    });
    const complete = analyzeRoadPuzzleMap(map, markedReferenceCells, {
      straight: 0,
      longCurve: 5,
      shortCurve: 6,
    });

    expect(incomplete.status).toBe("incomplete");
    expect(incomplete.requiredVector).toEqual({ straight: 4, longCurve: 10, shortCurve: 3 });
    expect(incomplete.drawnVector).toEqual({ straight: 4, longCurve: 5, shortCurve: 3 });
    expect(incomplete.minimumStickers).toBe(750);
    expect(Math.round(incomplete.expectedStickers!)).toBe(995);
    expect(incomplete.maximumStickers).toBe(2_700);
    expect(incomplete.delta).toEqual({ minimumStickers: 300, expectedStickers: 258 });

    expect(complete.status).toBe("completable");
    expect(complete.drawnVector).toEqual({ straight: 7, longCurve: 7, shortCurve: 5 });
    const witnessKeys = new Set(complete.witness?.map(({ x, y, z }) => `${x},${y},${z}`));
    expect(markedReferenceCells.every(({ x, y, z }) => witnessKeys.has(`${x},${y},${z}`))).toBe(true);
    expect(complete.requiredVector?.straight).toBeLessThanOrEqual(complete.drawnVector!.straight);
    expect(complete.requiredVector?.longCurve).toBeLessThanOrEqual(complete.drawnVector!.longCurve);
    expect(complete.requiredVector?.shortCurve).toBeLessThanOrEqual(complete.drawnVector!.shortCurve);
  });

  it("matches exhaustive conditional draws on a small remaining deck", () => {
    const analysis = analyzeRoadPuzzleMap(smallMap, [{ x: 1, y: -1, z: 0 }], {
      straight: 1,
      longCurve: 1,
      shortCurve: 1,
    });
    const orders = [
      ["straight", "longCurve", "shortCurve"],
      ["straight", "shortCurve", "longCurve"],
      ["longCurve", "straight", "shortCurve"],
      ["longCurve", "shortCurve", "straight"],
      ["shortCurve", "straight", "longCurve"],
      ["shortCurve", "longCurve", "straight"],
    ];
    const expectedDraws =
      orders.reduce((total, order) => total + order.findIndex((kind) => kind === "straight") + 1, 0) / orders.length;

    expect(analysis.status).toBe("incomplete");
    expect(analysis.minimumStickers).toBe(150);
    expect(analysis.expectedStickers).toBeCloseTo(expectedDraws * 150, 10);
    expect(analysis.maximumStickers).toBe(450);
  });
});
