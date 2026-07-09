import { describe, expect, it } from "@jest/globals";
import {
  buildStudentRaidInvestment,
  buildStudentRaidSummary,
  type StudentRaidSummaryStat,
} from "~/routes/students.$id._components/StudentRaidSummaryModel";

function makeStat(overrides: Partial<StudentRaidSummaryStat>): StudentRaidSummaryStat {
  return {
    slotsCount: 0,
    slotsByTier: [],
    assistsCount: 0,
    ...overrides,
  };
}

describe("buildStudentRaidSummary", () => {
  it("uses all provided seasons for the summary", () => {
    const result = buildStudentRaidSummary({
      statistics: [
        makeStat({
          slotsCount: 100,
          slotsByTier: [{ tier: 7, count: 100 }],
          assistsCount: 100,
        }),
        makeStat({
          slotsCount: 60,
          slotsByTier: [{ tier: 7, count: 60 }],
          assistsCount: 40,
        }),
      ],
    });

    expect(result.ownCount).toBe(160);
    expect(result.assistCount).toBe(140);
    expect(result.totalCount).toBe(300);
  });

  it("includes every collected statistic", () => {
    const result = buildStudentRaidSummary({
      statistics: [
        makeStat({
          slotsCount: 459,
          slotsByTier: [{ tier: 7, count: 459 }],
          assistsCount: 57,
        }),
      ],
    });

    expect(result.ownCount).toBe(459);
    expect(result.assistCount).toBe(57);
    expect(result.totalCount).toBe(516);
  });

  it("calculates assist ratio and handles empty samples with a low-confidence decision", () => {
    const empty = buildStudentRaidSummary({ statistics: [] });
    expect(empty.assistRatio).toBeNull();
    expect(empty.sampleInsufficient).toBe(true);
    expect(empty.decision).toEqual({
      value: "지표 부족",
      description: "판단을 위한 정보가 부족해요",
    });

    const result = buildStudentRaidSummary({
      statistics: [
        makeStat({
          slotsCount: 75,
          slotsByTier: [{ tier: 6, count: 75 }],
          assistsCount: 25,
        }),
      ],
    });
    expect(result.assistRatio).toBe(0.25);
    expect(result.decision).toEqual({
      value: "모집 학생 위주",
      description: "직접 모집한 학생의 출전 비율이 높아요",
    });
  });

  it("uses all available seasons for the standalone investment distribution", () => {
    const result = buildStudentRaidInvestment({
      myStudentTier: 8,
      statistics: [
        makeStat({
          slotsCount: 100,
          slotsByTier: [{ tier: 8, count: 100 }],
          assistsCount: 0,
        }),
        makeStat({
          slotsCount: 20,
          slotsByTier: [{ tier: 6, count: 20 }],
          assistsCount: 0,
        }),
      ],
    });

    expect(result.ownCount).toBe(120);
    expect(result.distribution.find(({ tier }) => tier === 8)).toMatchObject({ count: 100, ratio: 100 / 120 });
    expect(result.distribution.find(({ tier }) => tier === 6)).toMatchObject({ count: 20, ratio: 20 / 120 });
    expect(result.medianTier).toBe(8);
    expect(result.myTier).toBe(8);
  });

  it("keeps threshold wording at assist-ratio and sample-size boundaries", () => {
    const smallSample = buildStudentRaidSummary({
      statistics: [
        makeStat({
          slotsCount: 50,
          slotsByTier: [{ tier: 7, count: 50 }],
          assistsCount: 49,
        }),
      ],
    });
    expect(smallSample.sampleInsufficient).toBe(true);
    expect(smallSample.decision).toEqual({
      value: "지표 부족",
      description: "판단을 위한 정보가 부족해요",
    });

    const balanced = buildStudentRaidSummary({
      statistics: [
        makeStat({
          slotsCount: 65,
          slotsByTier: [{ tier: 7, count: 65 }],
          assistsCount: 35,
        }),
      ],
    });
    expect(balanced.sampleInsufficient).toBe(false);
    expect(balanced.decision).toEqual({
      value: "모집/조력 비슷",
      description: "모집 학생과 조력 학생이 비슷하게 쓰였어요",
    });

    const assistHeavy = buildStudentRaidSummary({
      statistics: [
        makeStat({
          slotsCount: 35,
          slotsByTier: [{ tier: 7, count: 35 }],
          assistsCount: 65,
        }),
      ],
    });
    expect(assistHeavy.decision).toEqual({
      value: "조력 학생 위주",
      description: "조력 학생으로 클리어 한 비율이 높아요",
    });
  });
});
