import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import protobuf from "protobufjs";
import { fetchProtobufBytes } from "~/lib/ranks/base";
import { decodeRaidScoreBands, fetchRaidScoreBandsOnServer } from "~/lib/ranks/raid-score-bands.server";

jest.mock("~/lib/ranks/base", () => ({
  RANK_API_BASE_URL: "https://ranks.baql.net",
  fetchProtobufBytes: jest.fn(),
}));

const mockedFetchProtobufBytes = fetchProtobufBytes as jest.MockedFunction<typeof fetchProtobufBytes>;

// The full response schema, as the browser decodes it, so the test encodes every field the server decoder must skip.
const SCHEMA = `
syntax = "proto3";
package clear_time_distribution;
message ClearTimeDistributionResponse {
  ClearTimeAxis axis = 1;
  repeated DifficultyBand bands = 2;
  repeated DifficultySeries series = 3;
  int64 total_count = 4;
  int32 time_budget_sec = 5;
}
message ClearTimeAxis { int32 min_sec = 1; int32 max_sec = 2; int32 bin_width_sec = 3; int32 bin_count = 4; }
message DifficultyBand {
  string difficulty = 1;
  int64 score_per_second = 2;
  int64 floor_score = 3;
  int32 min_sec = 4;
  int32 max_sec = 5;
  int64 min_score = 6;
  int64 max_score = 7;
  int64 sample_count = 8;
}
message DifficultySeries { string difficulty = 1; repeated int32 counts = 2; }
`;

const responseType = protobuf.parse(SCHEMA).root.lookupType("clear_time_distribution.ClearTimeDistributionResponse");

function encodeResponse(payload: Record<string, unknown>): ArrayBuffer {
  const bytes = responseType.encode(responseType.fromObject(payload)).finish();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const FULL_RESPONSE = {
  axis: { minSec: 0, maxSec: 240, binWidthSec: 5, binCount: 48 },
  bands: [
    {
      difficulty: "torment",
      scorePerSecond: 9600,
      floorScore: 31_408_000,
      minSec: 12,
      maxSec: 240,
      minScore: 31_500_000,
      maxScore: 44_000_000,
      sampleCount: 120_000,
    },
    {
      difficulty: "lunatic",
      scorePerSecond: 12_800,
      floorScore: 41_888_000,
      minSec: 30,
      maxSec: 240,
      minScore: 42_000_000,
      maxScore: 4_000_000_000,
      sampleCount: 3_000,
    },
  ],
  series: [{ difficulty: "torment", counts: [1, 2, 3] }],
  totalCount: 123_000,
  timeBudgetSec: 240,
};

describe("raid score bands on the server", () => {
  beforeEach(() => {
    mockedFetchProtobufBytes.mockReset();
  });

  it("reads the bands and time budget and skips every other field", () => {
    expect(decodeRaidScoreBands(encodeResponse(FULL_RESPONSE))).toEqual({
      bands: [
        { difficulty: "torment", scorePerSecond: 9600, floorScore: 31_408_000 },
        { difficulty: "lunatic", scorePerSecond: 12_800, floorScore: 41_888_000 },
      ],
      timeBudgetSec: 240,
    });
  });

  it("requests the season's distribution and returns its bands", async () => {
    mockedFetchProtobufBytes.mockResolvedValue(encodeResponse(FULL_RESPONSE));

    await expect(fetchRaidScoreBandsOnServer("elimination", 35, "heavy")).resolves.toEqual(
      decodeRaidScoreBands(encodeResponse(FULL_RESPONSE)),
    );
    expect(mockedFetchProtobufBytes).toHaveBeenCalledWith({
      url: "https://ranks.baql.net/v1/clear-time-distribution?raidType=elimination&season=35&defenseType=heavy",
    });
  });

  it("returns null for a season the rank data has no bands or time budget for", async () => {
    mockedFetchProtobufBytes.mockResolvedValueOnce(encodeResponse({ ...FULL_RESPONSE, bands: [] }));
    await expect(fetchRaidScoreBandsOnServer("total_assault", 88, "light")).resolves.toBeNull();

    mockedFetchProtobufBytes.mockResolvedValueOnce(encodeResponse({ ...FULL_RESPONSE, timeBudgetSec: 0 }));
    await expect(fetchRaidScoreBandsOnServer("total_assault", 88, "light")).resolves.toBeNull();
  });

  it("does not request a season without a rank season", async () => {
    await expect(fetchRaidScoreBandsOnServer("total_assault", null, "light")).resolves.toBeNull();
    expect(mockedFetchProtobufBytes).not.toHaveBeenCalled();
  });

  it("lets a failed request throw", async () => {
    mockedFetchProtobufBytes.mockRejectedValue(new Error("rank api down"));
    await expect(fetchRaidScoreBandsOnServer("total_assault", 88, "light")).rejects.toThrow("rank api down");
  });
});
