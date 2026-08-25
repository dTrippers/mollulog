import { describe, expect, it } from "@jest/globals";
import { getTierUsageBarRatio } from "~/routes/raids.$raidType.$seasonIndex._components/RaidScoreUsageList";

describe("getTierUsageBarRatio", () => {
  it("uses 20,000 appearances as the fixed bar width reference", () => {
    expect(getTierUsageBarRatio(4_000)).toBe(0.2);
    expect(getTierUsageBarRatio(20_000)).toBe(1);
  });

  it("caps uncommon counts over 20,000 at full width", () => {
    expect(getTierUsageBarRatio(25_000)).toBe(1);
  });
});
