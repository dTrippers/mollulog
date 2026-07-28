import { describe, expect, it } from "@jest/globals";
import {
  applyRecruitmentFunding,
  convolvePullCostDistributions,
  getFundedRecruitmentPulls,
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

  it("keeps total recruitment count separate from funding", () => {
    const distribution = simulateRecruitmentCost(period(), "call_charge_v1");
    expect(distribution.findIndex((probability) => probability > 0)).toBe(10);
    expect(distribution.length - 1).toBe(200);
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

  it("maps recruitment types to their shared charge scopes", () => {
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Usual)).toBe("regular");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Limited)).toBe("limited");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Fes)).toBe("limited");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Recollect)).toBe("limited");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Encore)).toBe("limited");
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Archive)).toBeNull();
    expect(getRecruitmentChargeScope(RecruitmentTypeEnum.Given)).toBeNull();
  });

  it("splits independent charge scopes without splitting shared recruitment benefits", () => {
    const scopedPeriods = splitRecruitmentCostPeriodByChargeScope({
      ...period(5),
      targets: [
        { key: "limited", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Limited },
        { key: "fes", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Fes },
        { key: "recollect", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Recollect },
        { key: "encore", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Encore },
        { key: "usual", initialTier: 3, recruitmentType: RecruitmentTypeEnum.Usual },
      ],
    });

    expect(scopedPeriods.map((scopedPeriod) => scopedPeriod.targets.map((target) => target.key))).toEqual([
      ["limited", "fes", "recollect", "encore"],
      ["usual"],
    ]);
  });

  it.each([
    [70, 70],
    [80, 70],
    [130, 120],
    [140, 120],
    [150, 130],
    [160, 130],
    [170, 140],
    [180, 140],
    [200, 160],
    [400, 320],
  ])("funds %i total pulls as %i pulls after recruitment perks", (totalPulls, fundedPulls) => {
    expect(getFundedRecruitmentPulls(totalPulls, { recruitmentPerks: true })).toBe(fundedPulls);
  });

  it("counts free recruitment toward perk thresholds", () => {
    expect(getFundedRecruitmentPulls(100, { freePulls: 100, recruitmentPerks: true })).toBe(0);
    expect(getFundedRecruitmentPulls(110, { freePulls: 100, recruitmentPerks: true })).toBe(0);
    expect(getFundedRecruitmentPulls(120, { freePulls: 100, recruitmentPerks: true })).toBe(10);
  });

  it("applies shared recruitment benefits once after charge-scope distributions are combined", () => {
    const totalPullDistribution = convolvePullCostDistributions(
      Object.assign(Array(81).fill(0), { 80: 1 }),
      Object.assign(Array(61).fill(0), { 60: 1 }),
    );
    const fundedDistribution = applyRecruitmentFunding(totalPullDistribution, { recruitmentPerks: true });

    expect(fundedDistribution[120]).toBe(1);
    expect(fundedDistribution.reduce((sum, probability) => sum + (probability ?? 0), 0)).toBe(1);
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
