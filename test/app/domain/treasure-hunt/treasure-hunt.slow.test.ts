import { describe, expect, it } from "@jest/globals";
import { createTreasureHuntSimulator, histogramPercentile } from "~/domain/treasure-hunt";
import { compositions } from "./compositions";

describe("10847 composition sample results (C5)", () => {
  it.each(compositions)("$label produces 1,000 deterministic games within the prototype percentile tolerance", ({
    label,
    composition,
    p10: expectedP10,
    p50: expectedP50,
    p90: expectedP90,
  }) => {
    const start = performance.now();
    const simulator = createTreasureHuntSimulator(composition);
    const counts = Array(simulator.boardCells - simulator.minCells + 1).fill(0) as number[];
    for (let gameIndex = 0; gameIndex < 1000; gameIndex++) {
      const openedCells = simulator.simulateGame(gameIndex);
      const index = openedCells - simulator.minCells;
      const count = counts[index];
      if (count === undefined) {
        throw new Error(`Game ${gameIndex} returned an out-of-range cell count ${openedCells}.`);
      }
      counts[index] = count + 1;
    }
    const histogram = { minCells: simulator.minCells, counts };
    const p10 = histogramPercentile(histogram, 0.1);
    const p50 = histogramPercentile(histogram, 0.5);
    const p90 = histogramPercentile(histogram, 0.9);
    const wallClockMs = performance.now() - start;

    console.info(
      `[C5] ${JSON.stringify({
        composition: label,
        games: 1000,
        histogram,
        cells: { p10, p50, p90 },
        cost: { p10: p10 * 200, p50: p50 * 200, p90: p90 * 200 },
        wallClockMs: Number(wallClockMs.toFixed(1)),
      })}`,
    );
    expect(Math.abs(p10 - expectedP10)).toBeLessThanOrEqual(1);
    expect(Math.abs(p50 - expectedP50)).toBeLessThanOrEqual(1);
    expect(Math.abs(p90 - expectedP90)).toBeLessThanOrEqual(1);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1000);
  }, 180_000);
});
