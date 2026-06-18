import { describe, expect, it } from "@jest/globals";
import type { UtcIsoString } from "~/lib/date-time";
import { buildStudentRaidSummary, type StudentRaidSummaryStat } from "./StudentRaidSummaryModel";

function makeStat(overrides: Partial<StudentRaidSummaryStat> & { startAt: UtcIsoString }): StudentRaidSummaryStat {
  return {
    raid: { startAt: overrides.startAt },
    slotsCount: 0,
    slotsByTier: [],
    assistsCount: 0,
    ...overrides,
  };
}

describe("buildStudentRaidSummary", () => {
  const asOf = new Date("2026-06-19T00:00:00.000Z");

  it("excludes seasons outside the recent two-year window", () => {
    const result = buildStudentRaidSummary({
      asOf,
      myStudentTier: null,
      statistics: [
        makeStat({
          startAt: "2024-06-18T23:59:59.000Z" as UtcIsoString,
          slotsCount: 100,
          slotsByTier: [{ tier: 7, count: 100 }],
          assistsCount: 100,
        }),
        makeStat({
          startAt: "2024-06-19T00:00:00.000Z" as UtcIsoString,
          slotsCount: 60,
          slotsByTier: [{ tier: 7, count: 60 }],
          assistsCount: 40,
        }),
      ],
    });

    expect(result.ownCount).toBe(60);
    expect(result.assistCount).toBe(40);
    expect(result.totalCount).toBe(100);
  });

  it("calculates assist ratio and handles empty samples without verdict text", () => {
    const empty = buildStudentRaidSummary({ asOf, myStudentTier: null, statistics: [] });
    expect(empty.assistRatio).toBeNull();
    expect(empty.sampleInsufficient).toBe(true);
    expect(empty.sampleMessage).toBe("최근 2년 표본이 없어 판단을 보류하는 편이 좋아요.");
    expect(empty.verdict).toBeNull();

    const result = buildStudentRaidSummary({
      asOf,
      myStudentTier: null,
      statistics: [
        makeStat({
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
          slotsCount: 75,
          slotsByTier: [{ tier: 6, count: 75 }],
          assistsCount: 25,
        }),
      ],
    });
    expect(result.assistRatio).toBe(0.25);
    expect(result.verdict).toBe("본대 비중이 높아 직접 보유 가치가 큰 편이에요.");
  });

  it("aggregates own-slot tier distribution and weighted median tier", () => {
    const result = buildStudentRaidSummary({
      asOf,
      myStudentTier: null,
      statistics: [
        makeStat({
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
          slotsCount: 100,
          slotsByTier: [
            { tier: 5, count: 20 },
            { tier: 6, count: 30 },
            { tier: 7, count: 50 },
          ],
          assistsCount: 80,
        }),
        makeStat({
          startAt: "2026-02-01T00:00:00.000Z" as UtcIsoString,
          slotsCount: 40,
          slotsByTier: [{ tier: 8, count: 40 }],
          assistsCount: 0,
        }),
      ],
    });

    expect(result.ownCount).toBe(140);
    expect(result.distribution.find(({ tier }) => tier === 7)).toMatchObject({ count: 50, ratio: 50 / 140 });
    expect(result.distribution.find(({ tier }) => tier === 8)).toMatchObject({ count: 40, ratio: 40 / 140 });
    expect(result.medianTier).toBe(7);
  });

  it("calculates my tier percentile and branches for owned, missing, and unknown comparison states", () => {
    const statistics = [
      makeStat({
        startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
        slotsCount: 100,
        slotsByTier: [
          { tier: 5, count: 20 },
          { tier: 6, count: 30 },
          { tier: 7, count: 50 },
        ],
        assistsCount: 0,
      }),
    ];

    const ownedLow = buildStudentRaidSummary({ asOf, myStudentTier: 5, statistics });
    expect(ownedLow.myTierPercentile).toBe(0.2);
    expect(ownedLow.myTierVerdict).toBe("본대 분포보다 낮은 편이라 추가 투자가 필요할 수 있어요.");

    const ownedHigh = buildStudentRaidSummary({ asOf, myStudentTier: 7, statistics });
    expect(ownedHigh.myTierPercentile).toBe(1);
    expect(ownedHigh.myTierVerdict).toBe("본대 분포 기준 충분히 높은 편이에요.");

    const missing = buildStudentRaidSummary({ asOf, myStudentTier: null, statistics });
    expect(missing.myTierPercentile).toBeNull();
    expect(missing.myTierVerdict).toBe("미보유 상태예요.");
  });

  it("keeps threshold wording at assist-ratio and sample-size boundaries", () => {
    const smallSample = buildStudentRaidSummary({
      asOf,
      myStudentTier: null,
      statistics: [
        makeStat({
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
          slotsCount: 50,
          slotsByTier: [{ tier: 7, count: 50 }],
          assistsCount: 49,
        }),
      ],
    });
    expect(smallSample.sampleInsufficient).toBe(true);
    expect(smallSample.verdict).toBeNull();

    const balanced = buildStudentRaidSummary({
      asOf,
      myStudentTier: null,
      statistics: [
        makeStat({
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
          slotsCount: 65,
          slotsByTier: [{ tier: 7, count: 65 }],
          assistsCount: 35,
        }),
      ],
    });
    expect(balanced.sampleInsufficient).toBe(false);
    expect(balanced.verdict).toBe("본대와 조력이 함께 쓰여 보유와 대여를 같이 고려할 만해요.");

    const assistHeavy = buildStudentRaidSummary({
      asOf,
      myStudentTier: null,
      statistics: [
        makeStat({
          startAt: "2026-01-01T00:00:00.000Z" as UtcIsoString,
          slotsCount: 40,
          slotsByTier: [{ tier: 7, count: 40 }],
          assistsCount: 60,
        }),
      ],
    });
    expect(assistHeavy.verdict).toBe("조력 비중이 높아 대여로 해결된 사례가 많은 편이에요.");
  });
});
