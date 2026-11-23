import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildTicks,
  formatRankTick,
  RaidRecordTrendChart,
  type RaidRecordTrendPoint,
} from "~/components/v2/features/raid-records/RaidRecordTrendChart";

describe("formatRankTick", () => {
  it("keeps small ranks as full numbers", () => {
    expect(formatRankTick(1)).toBe("1");
    expect(formatRankTick(9_500)).toBe("9,500");
  });

  it("shortens large ranks without merging ticks under 1,000 apart", () => {
    const labels = [10_000, 10_500, 11_000, 11_500].map(formatRankTick);
    expect(labels).toEqual(["10K", "10.5K", "11K", "11.5K"]);
    expect(new Set([10_100, 10_200, 10_300].map(formatRankTick)).size).toBe(3);
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
  });
});
