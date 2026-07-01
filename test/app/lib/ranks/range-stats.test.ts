import { describe, expect, it, jest } from "@jest/globals";
import { convertRangeStats } from "~/lib/ranks/range-stats";

jest.mock("~/lib/ranks/base", () => ({
  RANK_API_BASE_URL: "http://localhost:8080",
  createProtobufRootCache: jest.fn(() => jest.fn()),
  fetchProtobuf: jest.fn(),
}));

type RangeStatsResponse = Parameters<typeof convertRangeStats>[0];

describe("convertRangeStats", () => {
  it("converts student tier statistics into total tier buckets", () => {
    const result = convertRangeStats({
      sampleSize: 1000,
      partyCounts: [],
      studentUsage: [
        {
          studentUid: "10000",
          ownCount: 12,
          assistCount: 5,
          statistics: [
            { tier: 5, count: 7, assistCount: 2 },
            { tier: 5, weaponTier: 1, count: 3, assistCount: 1 },
            { tier: 5, weaponTier: 1, count: 2, assistCount: 2 },
          ],
        },
      ],
      oftenUsedParties: [],
    } satisfies RangeStatsResponse);

    expect(result.studentUsage[0]).toMatchObject({
      studentUid: "10000",
      ownCount: 12,
      assistCount: 5,
      slotsByTier: [
        { tier: 6, count: 5 },
        { tier: 5, count: 7 },
      ],
      assistsByTier: [
        { tier: 6, count: 3 },
        { tier: 5, count: 2 },
      ],
    });
  });

  it("keeps old range-stats responses compatible when tier statistics are missing", () => {
    const result = convertRangeStats({
      sampleSize: 1000,
      partyCounts: [],
      studentUsage: [{ studentUid: "10000", ownCount: 12, assistCount: 5 }],
      oftenUsedParties: [],
    } satisfies RangeStatsResponse);

    expect(result.studentUsage[0]).toMatchObject({
      studentUid: "10000",
      ownCount: 12,
      assistCount: 5,
      slotsByTier: [],
      assistsByTier: [],
    });
  });
});
