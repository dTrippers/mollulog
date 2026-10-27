import { describe, expect, it } from "@jest/globals";
import type { RoadPuzzleMap } from "~/domain/event-shop";
import { calculateExpectedDraws, solveRoadPuzzleMap } from "~/domain/road-puzzle/solver";
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
});
