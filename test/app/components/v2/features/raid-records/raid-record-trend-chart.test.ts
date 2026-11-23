import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildTicks,
  buildTierLineSegments,
  formatRankTick,
  formatTierBounds,
  RaidRecordTrendChart,
  type RaidRecordTrendPoint,
} from "~/components/v2/features/raid-records/RaidRecordTrendChart";

describe("formatRankTick", () => {
  it("writes the whole rank with thousands separators", () => {
    expect(formatRankTick(1)).toBe("1");
    expect(formatRankTick(9_500)).toBe("9,500");
    expect([10_000, 10_500, 100_000].map(formatRankTick)).toEqual(["10,000", "10,500", "100,000"]);
  });

  it("puts only whole ranks on the axis, with distinct labels, when ranks are one apart", () => {
    for (const [min, max] of [
      [10_000, 10_001],
      [5, 6],
      [42, 42],
    ]) {
      const { ticks } = buildTicks(min, max);
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(new Set(ticks.map(formatRankTick)).size).toBe(ticks.length);
    }
  });
});

describe("RaidRecordTrendChart", () => {
  it("hides the screen-reader table with its caption through a wrapper", () => {
    const points: RaidRecordTrendPoint[] = [1, 2, 3].map((seasonIndex) => ({
      key: `raid-${seasonIndex}`,
      server: "kr",
      raidType: "total_assault",
      seasonIndex,
      bossName: "비나",
      startAt: `2026-0${seasonIndex}-01T00:00:00Z`,
      score: 1_000_000 * seasonIndex,
      rank: 1_000 * seasonIndex,
      rankStatus: "confirmed",
    }));
    const markup = renderToStaticMarkup(createElement(RaidRecordTrendChart, { points }));
    // Firefox clips a table's own overflow and clip-path without its caption, so sr-only must sit on a wrapper.
    expect(markup).toContain('<div class="sr-only"><table><caption>시즌별 순위</caption>');
    expect(markup).not.toContain('<table class="sr-only">');
    expect(markup).toContain('<th scope="col">트로피 기준 순위</th>');
    expect(markup).toContain("<td>플래티넘 10,000위까지, 골드 50,000위까지, 실버 100,000위까지</td>");
  });
});

describe("buildTierLineSegments", () => {
  const left = (index: number) => index * 10;
  const right = (index: number) => (index + 1) * 10;
  const y = (rank: number) => rank / 1000;

  it("draws one level line while the bands stay the same", () => {
    expect(buildTierLineSegments([12_000, 12_000, 12_000], [0, 100_000], left, right, y)).toEqual([
      { x1: 0, x2: 30, y1: 12, y2: 12 },
    ]);
  });

  it("steps where the bands change", () => {
    expect(buildTierLineSegments([10_000, 10_000, 12_000, 12_000], [0, 100_000], left, right, y)).toEqual([
      { x1: 0, x2: 20, y1: 10, y2: 10 },
      { x1: 20, x2: 20, y1: 10, y2: 12 },
      { x1: 20, x2: 40, y1: 12, y2: 12 },
    ]);
  });

  it("leaves out the seasons whose bound is off the rank domain, without a step to it", () => {
    expect(buildTierLineSegments([50_000, 55_000, 55_000], [0, 52_000], left, right, y)).toEqual([
      { x1: 0, x2: 10, y1: 50, y2: 50 },
    ]);
    expect(buildTierLineSegments([null, 12_000], [0, 100_000], left, right, y)).toEqual([
      { x1: 10, x2: 20, y1: 12, y2: 12 },
    ]);
    expect(buildTierLineSegments([240_000, 240_000], [0, 100_000], left, right, y)).toEqual([]);
  });
});

describe("formatTierBounds", () => {
  it("reads each trophy's last rank of the season", () => {
    expect(formatTierBounds({ platinum: 10_000, gold: 50_000, silver: 100_000 })).toBe(
      "플래티넘 10,000위까지, 골드 50,000위까지, 실버 100,000위까지",
    );
  });
});
