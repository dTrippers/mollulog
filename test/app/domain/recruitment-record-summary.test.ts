import { describe, expect, it } from "@jest/globals";
import {
  buildRecruitmentTierBars,
  formatRecruitmentRate,
  summarizeRecruitmentRecords,
} from "~/domain/recruitment-record-summary";

describe("formatRecruitmentRate", () => {
  it("formats a rate with two decimals", () => {
    expect(formatRecruitmentRate(3, 100)).toBe("3.00%");
    expect(formatRecruitmentRate(1, 3)).toBe("33.33%");
  });

  it("has no rate when there is no trial count to divide by", () => {
    expect(formatRecruitmentRate(0, 0)).toBeNull();
    expect(formatRecruitmentRate(2, 0)).toBeNull();
  });
});

describe("summarizeRecruitmentRecords", () => {
  it("is empty without records", () => {
    expect(summarizeRecruitmentRecords([], () => ({}))).toEqual({
      recordCount: 0,
      totalTrial: 0,
      tier3Count: 0,
      tier3RateCount: 0,
      pickupCount: 0,
      pickupRateCount: 0,
    });
  });
});

describe("buildRecruitmentTierBars", () => {
  it("returns tiers 1-9 and the unrecruited bar, scaled to the largest one", () => {
    const bars = buildRecruitmentTierBars({ 1: 5, 3: 10, 9: 1 }, 16, 36);
    expect(bars.map((bar) => bar.key)).toEqual([
      "tier-1",
      "tier-2",
      "tier-3",
      "tier-4",
      "tier-5",
      "tier-6",
      "tier-7",
      "tier-8",
      "tier-9",
      "unrecruited",
    ]);
    const byKey = Object.fromEntries(bars.map((bar) => [bar.key, bar]));
    expect(byKey.unrecruited).toMatchObject({ tier: null, count: 20, heightPercent: 100 });
    expect(byKey["tier-3"]?.heightPercent).toBe(50);
    expect(byKey["tier-2"]).toMatchObject({ count: 0, heightPercent: 0 });
  });

  it("fills only the unrecruited bar when no student is recruited", () => {
    const bars = buildRecruitmentTierBars({}, 0, 12);
    expect(bars.filter((bar) => bar.heightPercent > 0).map((bar) => bar.key)).toEqual(["unrecruited"]);
  });

  it("has all bars empty with no students at all", () => {
    expect(buildRecruitmentTierBars({}, 0, 0).every((bar) => bar.heightPercent === 0)).toBe(true);
  });
});
