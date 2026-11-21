import { describe, expect, it } from "@jest/globals";
import { buildTicks, formatRankTick } from "~/components/v2/features/raid-records/RaidRecordTrendChart";

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
