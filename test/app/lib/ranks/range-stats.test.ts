import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Defense } from "~/graphql/graphql";
import { fetchProtobuf } from "~/lib/ranks/base";
import { convertRangeStats, fetchRangeStats } from "~/lib/ranks/range-stats";

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

describe("fetchRangeStats", () => {
  const fetchProtobufMock = fetchProtobuf as jest.MockedFunction<typeof fetchProtobuf>;

  function requestedParams(): URLSearchParams {
    const { url } = fetchProtobufMock.mock.calls.at(-1)?.[0] ?? { url: "" };
    return new URL(url).searchParams;
  }

  beforeEach(() => {
    fetchProtobufMock.mockReset();
    fetchProtobufMock.mockResolvedValue({ sampleSize: 0, partyCounts: [], studentUsage: [], oftenUsedParties: [] });
  });

  it("requests a difficulty band by difficulty without score bounds", async () => {
    await fetchRangeStats({
      raidType: "elimination",
      season: 38,
      defenseType: Defense.Heavy,
      difficulty: "insane",
      topParties: 5,
    });

    const params = requestedParams();
    expect(params.get("difficulty")).toBe("insane");
    expect(params.has("scoreGte")).toBe(false);
    expect(params.has("scoreLt")).toBe(false);
    expect(params.get("topParties")).toBe("5");
  });

  it("requests a score range without difficulty", async () => {
    await fetchRangeStats({
      raidType: "total_assault",
      season: 85,
      defenseType: Defense.Heavy,
      scoreGte: 100,
      scoreLt: 200,
      topParties: 20,
    });

    const params = requestedParams();
    expect(params.has("difficulty")).toBe(false);
    expect(params.get("scoreGte")).toBe("100");
    expect(params.get("scoreLt")).toBe("200");
  });
});
