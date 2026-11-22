import { describe, expect, it, jest } from "@jest/globals";
import { convertToRaidStatistics } from "~/lib/ranks/stats";

jest.mock("~/lib/ranks/base", () => ({
  RANK_API_BASE_URL: "http://localhost:8080",
  createProtobufRootCache: jest.fn(() => jest.fn()),
  fetchProtobuf: jest.fn(),
}));

type StatsResponse = Parameters<typeof convertToRaidStatistics>[0];

const student = {
  studentUid: "10098",
  statistics: [{ tier: 5, count: 12, assistCount: 3 }],
  raid: { raidType: "total_assault", season: 93, defenseType: "light_armor" },
};

describe("convertToRaidStatistics", () => {
  it("converts form usage from the stats response", () => {
    const result = convertToRaidStatistics({
      students: [
        {
          ...student,
          formUsage: [
            { studentUid: "10098", partyCount: "2", ratio: 0.996 },
            { studentUid: "10099", partyCount: "1", ratio: 0.004 },
          ],
        },
      ],
    } satisfies StatsResponse);

    expect(result[0].formUsage).toEqual([
      { studentUid: "10098", partyCount: 2, ratio: 0.996 },
      { studentUid: "10099", partyCount: 1, ratio: 0.004 },
    ]);
  });

  it("returns empty form usage when the response predates form usage", () => {
    const result = convertToRaidStatistics({ students: [student] } satisfies StatsResponse);

    expect(result[0].formUsage).toEqual([]);
  });
});
