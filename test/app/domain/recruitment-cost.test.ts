import { describe, expect, it } from "@jest/globals";
import {
  convolvePullCostDistributions,
  getRecruitmentChargeScope,
  getRecruitmentRuleSet,
  type PullCostDistribution,
  type RecruitmentCostPeriod,
  simulateRecruitmentCost,
  splitRecruitmentCostPeriodByChargeScope,
} from "~/domain/recruitment-cost";
import { RecruitmentTypeEnum } from "~/graphql/graphql";

function period(targetCount = 1, overrides: Partial<RecruitmentCostPeriod> = {}): RecruitmentCostPeriod {
  return {
    uid: "period",
    recruitmentType: RecruitmentTypeEnum.Usual,
    tier2PoolCount: 20,
    tier3PoolCount: 100,
    targets: Array.from({ length: targetCount }, (_, index) => ({
      key: `target-${index}`,
      initialTier: 3,
      recruitmentType: RecruitmentTypeEnum.Usual,
    })),
    ...overrides,
  };
}

function expectedPulls(distribution: PullCostDistribution): number {
  const totalProbability = distribution.reduce((sum, probability) => sum + (probability ?? 0), 0);
  return distribution.reduce(
    (sum, probability, pulls) => sum + (totalProbability > 0 ? ((probability ?? 0) / totalProbability) * pulls : 0),
    0,
  );
}

describe("simulateRecruitmentCost", () => {
  it("bills only complete ten-pull batches", () => {
    const distribution = simulateRecruitmentCost(period(), "legacy_points");
    expect(distribution.findIndex((probability) => probability > 0)).toBe(10);
    expect(distribution.some((probability, pulls) => probability > 0 && pulls % 10 !== 0)).toBe(false);
  });

  it("caps the legacy system at the 200-pull exchange", () => {
    const distribution = simulateRecruitmentCost(period(), "legacy_points");
    expect(distribution.length - 1).toBe(200);
    expect(distribution[200]).toBeGreaterThan(0);
  });

  it("applies the call-charge midpoint and ceiling", () => {
    const distribution = simulateRecruitmentCost(period(), "call_charge_v1");
    expect(distribution.length - 1).toBe(200);
    expect(expectedPulls(distribution)).toBeLessThan(expectedPulls(simulateRecruitmentCost(period(), "legacy_points")));
  });

  it("keeps the active banner fixed for the remaining slots in a ten-pull", () => {
    const distribution = simulateRecruitmentCost(period(2), "call_charge_v1");
    expect(distribution[10]).toBeGreaterThan(0);
    expect(distribution[20]).toBeGreaterThan(0);
    expect(distribution.some((probability, pulls) => probability > 0 && pulls % 10 !== 0)).toBe(false);
  });

  it("counts free pulls toward progress while removing them from paid cost", () => {
    const distribution = simulateRecruitmentCost(period(1, { freePulls: 100 }), "call_charge_v1");
    expect(distribution[0]).toBeGreaterThan(0.5);
    expect(distribution.length - 1).toBe(100);
  });

  it("uses the actual pickup tier for provisional tier-two targets", () => {
    const tier2Period = period(1, {
      targets: [
        {
          key: "tier-2",
          initialTier: 2,
          recruitmentType: RecruitmentTypeEnum.Usual,
        },
      ],
    });
    expect(expectedPulls(simulateRecruitmentCost(tier2Period, "legacy_points"))).toBeLessThan(40);
  });
});

describe("distribution helpers", () => {
  it("convolves independent recruitment periods", () => {
    expect(convolvePullCostDistributions([1], [0, 0.5, 0.5])).toEqual([0, 0.5, 0.5]);
  });

  it("shares charge only between limited and fes recruitment types", () => {
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Limited)).toBe("limited_fes");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Fes)).toBe("limited_fes");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Usual)).toBe("usual");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Given)).toBeNull();
  });

  it("splits independent charge scopes while applying free pulls only once", () => {
    const scopedPeriods = splitRecruitmentCostPeriodByChargeScope({
      ...period(3, { freePulls: 100 }),
      targets: [
        { key: "limited", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Limited },
        { key: "fes", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Fes },
        { key: "usual", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Usual },
      ],
    });

    expect(scopedPeriods.map((scopedPeriod) => scopedPeriod.targets.map((target) => target.key))).toEqual([
      ["limited", "fes"],
      ["usual"],
    ]);
    expect(scopedPeriods.map((scopedPeriod) => scopedPeriod.freePulls)).toEqual([100, 0]);
  });
});

describe("getRecruitmentRuleSet", () => {
  it("switches at the dynamic anchor instant", () => {
    const anchor = "2026-11-24T02:00:00.000Z";
    expect(getRecruitmentRuleSet("2026-11-23T02:00:00.000Z", anchor)).toBe("legacy_points");
    expect(getRecruitmentRuleSet(anchor, anchor)).toBe("call_charge_v1");
    expect(getRecruitmentRuleSet("2026-11-25T02:00:00.000Z", anchor)).toBe("call_charge_v1");
  });
});
