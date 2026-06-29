import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";
import { RANK_API_BASE_URL, createProtobufRootCache, fetchProtobuf } from "./base";

const CLEAR_TIME_DISTRIBUTION_PROTO_SCHEMA = `
syntax = "proto3";

package clear_time_distribution;

option go_package = "github.com/dTrippers/mollulog-rank/api";

message ClearTimeDistributionResponse {
  ClearTimeAxis axis = 1;
  repeated DifficultyBand bands = 2;
  repeated DifficultySeries series = 3;
  int64 total_count = 4;
  int32 time_budget_sec = 5;
}

message ClearTimeAxis {
  int32 min_sec = 1;
  int32 max_sec = 2;
  int32 bin_width_sec = 3;
  int32 bin_count = 4;
}

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

message DifficultySeries {
  string difficulty = 1;
  repeated int32 counts = 2;
}
`;

const getClearTimeDistributionProtobufRoot = createProtobufRootCache();

type ServerClearTimeAxis = {
  minSec: number;
  maxSec: number;
  binWidthSec: number;
  binCount: number;
};

type ServerDifficultyBand = {
  difficulty: string;
  scorePerSecond: string | number;
  floorScore: string | number;
  minSec: number;
  maxSec: number;
  minScore: string | number;
  maxScore: string | number;
  sampleCount: string | number;
};

type ServerDifficultySeries = {
  difficulty: string;
  counts: number[];
};

type ServerClearTimeDistributionResponse = {
  axis?: ServerClearTimeAxis;
  bands: ServerDifficultyBand[];
  series: ServerDifficultySeries[];
  totalCount: string | number;
  timeBudgetSec: number;
};

export type ClearTimeAxis = {
  minSec: number;
  maxSec: number;
  binWidthSec: number;
  binCount: number;
};

export type ClearTimeDifficultyBand = {
  difficulty: string;
  scorePerSecond: number;
  floorScore: number;
  minSec: number;
  maxSec: number;
  minScore: number;
  maxScore: number;
  sampleCount: number;
};

export type ClearTimeDifficultySeries = {
  difficulty: string;
  counts: number[];
};

export type ClearTimeDistribution = {
  axis: ClearTimeAxis;
  bands: ClearTimeDifficultyBand[];
  series: ClearTimeDifficultySeries[];
  totalCount: number;
  timeBudgetSec: number;
};

export type FetchClearTimeDistributionParams = {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
  difficulty?: string;
  binCount?: number;
  binWidthSec?: number;
  minSec?: number;
  maxSec?: number;
};

export async function fetchClearTimeDistribution(
  params: FetchClearTimeDistributionParams,
): Promise<ClearTimeDistribution> {
  const queryParams = new URLSearchParams({
    raidType: params.raidType,
    season: params.season.toString(),
    defenseType: params.defenseType,
  });

  if (params.difficulty) {
    queryParams.set("difficulty", params.difficulty);
  }
  if (params.binCount !== undefined) {
    queryParams.set("binCount", String(params.binCount));
  }
  if (params.binWidthSec !== undefined) {
    queryParams.set("binWidthSec", String(params.binWidthSec));
  }
  if (params.minSec !== undefined) {
    queryParams.set("minSec", String(params.minSec));
  }
  if (params.maxSec !== undefined) {
    queryParams.set("maxSec", String(params.maxSec));
  }

  const response = await fetchProtobuf<ServerClearTimeDistributionResponse>({
    url: `${RANK_API_BASE_URL}/v1/clear-time-distribution?${queryParams.toString()}`,
    method: "GET",
    schema: CLEAR_TIME_DISTRIBUTION_PROTO_SCHEMA,
    messageType: "clear_time_distribution.ClearTimeDistributionResponse",
    getRoot: getClearTimeDistributionProtobufRoot,
  });

  return convertClearTimeDistribution(response);
}

export function convertClearTimeDistribution(response: ServerClearTimeDistributionResponse): ClearTimeDistribution {
  return {
    axis: {
      minSec: response.axis?.minSec ?? 0,
      maxSec: response.axis?.maxSec ?? 0,
      binWidthSec: response.axis?.binWidthSec ?? 0,
      binCount: response.axis?.binCount ?? 0,
    },
    bands: response.bands.map((band) => ({
      difficulty: band.difficulty,
      scorePerSecond: Number(band.scorePerSecond),
      floorScore: Number(band.floorScore),
      minSec: Number(band.minSec),
      maxSec: Number(band.maxSec),
      minScore: Number(band.minScore),
      maxScore: Number(band.maxScore),
      sampleCount: Number(band.sampleCount),
    })),
    series: response.series.map((series) => ({
      difficulty: series.difficulty,
      counts: series.counts.map(Number),
    })),
    totalCount: Number(response.totalCount),
    timeBudgetSec: Number(response.timeBudgetSec),
  };
}
