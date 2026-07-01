import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";
import { RANK_API_BASE_URL, createProtobufRootCache, fetchProtobuf } from "./base";

const RANGE_STATS_PROTO_SCHEMA = `
syntax = "proto3";

package range_stats;

option go_package = "github.com/dTrippers/mollulog-rank/api";

message RangeStatsResponse {
  int64 sample_size = 1;
  repeated PartyCountBucket party_counts = 2;
  repeated RangeStudentUsage student_usage = 3;
  repeated OftenUsedParty often_used_parties = 4;
}

message PartyCountBucket {
  int32 party_count = 1;
  int64 entry_count = 2;
}

message RangeStudentUsage {
  string student_uid = 1;
  int64 own_count = 2;
  int64 assist_count = 3;
  repeated TierStatistics statistics = 4;
}

message TierStatistics {
  int32 tier = 1;
  optional int32 weapon_tier = 2;
  int64 count = 3;
  int64 assist_count = 4;
}

message OftenUsedParty {
  int64 count = 1;
  int32 max_rank = 2;
  int64 max_score = 3;
  repeated Party parties = 4;
}

message Party {
  repeated StudentSlot students = 1;
}

message StudentSlot {
  oneof slot {
    Student student = 1;
    EmptySlot empty = 2;
  }
}

message EmptySlot {}

message Student {
  string uid = 1;
  int32 level = 2;
  int32 tier = 3;
  int32 weapon_tier = 4;
  bool is_assist = 5;
}
`;

const getRangeStatsProtobufRoot = createProtobufRootCache();

type ServerStudent = {
  uid: string;
  level: number;
  tier: number;
  weaponTier?: number;
  isAssist?: boolean;
};

type ServerStudentSlot = {
  slot: "student" | "empty";
  student?: ServerStudent;
  empty?: Record<string, never>;
};

type ServerParty = {
  students: ServerStudentSlot[];
};

type ServerOftenUsedParty = {
  count: string | number;
  maxRank: number;
  maxScore: string | number;
  parties: ServerParty[];
};

type ServerPartyCountBucket = {
  partyCount: number;
  entryCount: string | number;
};

type ServerTierStatistics = {
  tier: number;
  weaponTier?: number;
  count: string | number;
  assistCount: string | number;
};

type ServerRangeStudentUsage = {
  studentUid: string;
  ownCount: string | number;
  assistCount: string | number;
  statistics?: ServerTierStatistics[];
};

type ServerRangeStatsResponse = {
  sampleSize: string | number;
  partyCounts: ServerPartyCountBucket[];
  studentUsage: ServerRangeStudentUsage[];
  oftenUsedParties: ServerOftenUsedParty[];
};

export type RangeStatsOftenUsedParty = {
  count: number;
  maxRank: number;
  maxScore: number;
  parties: ServerParty[];
};

export type RangeStatsPartyCount = {
  partyCount: number;
  entryCount: number;
};

export type RangeStatsStudentUsage = {
  studentUid: string;
  ownCount: number;
  assistCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsByTier: { tier: number; count: number }[];
};

export type RangeStats = {
  sampleSize: number;
  partyCounts: RangeStatsPartyCount[];
  studentUsage: RangeStatsStudentUsage[];
  oftenUsedParties: RangeStatsOftenUsedParty[];
};

export type FetchRangeStatsParams = {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
  scoreGte?: number;
  scoreLt?: number;
  topParties?: number;
};

export async function fetchRangeStats(params: FetchRangeStatsParams): Promise<RangeStats> {
  const queryParams = new URLSearchParams({
    raidType: params.raidType,
    season: params.season.toString(),
    defenseType: params.defenseType,
  });

  if (params.scoreGte !== undefined) {
    queryParams.set("scoreGte", String(params.scoreGte));
  }
  if (params.scoreLt !== undefined) {
    queryParams.set("scoreLt", String(params.scoreLt));
  }
  if (params.topParties !== undefined) {
    queryParams.set("topParties", String(params.topParties));
  }

  const response = await fetchProtobuf<ServerRangeStatsResponse>({
    url: `${RANK_API_BASE_URL}/v1/range-stats?${queryParams.toString()}`,
    method: "GET",
    schema: RANGE_STATS_PROTO_SCHEMA,
    messageType: "range_stats.RangeStatsResponse",
    getRoot: getRangeStatsProtobufRoot,
  });

  return convertRangeStats(response);
}

export function convertRangeStats(response: ServerRangeStatsResponse): RangeStats {
  return {
    sampleSize: Number(response.sampleSize),
    partyCounts: response.partyCounts.map((bucket) => ({
      partyCount: Number(bucket.partyCount),
      entryCount: Number(bucket.entryCount),
    })),
    studentUsage: response.studentUsage.map(convertRangeStudentUsage),
    oftenUsedParties: response.oftenUsedParties.map((party) => ({
      count: Number(party.count),
      maxRank: Number(party.maxRank),
      maxScore: Number(party.maxScore),
      parties: party.parties,
    })),
  };
}

function convertRangeStudentUsage(usage: ServerRangeStudentUsage): RangeStatsStudentUsage {
  const slotsByTierMap = new Map<number, number>();
  const assistsByTierMap = new Map<number, number>();

  for (const tierStat of usage.statistics ?? []) {
    const totalTier = convertToTotalTier(tierStat.tier, tierStat.weaponTier);
    const count = Number(tierStat.count);
    const assistCount = Number(tierStat.assistCount);

    slotsByTierMap.set(totalTier, (slotsByTierMap.get(totalTier) || 0) + count);
    assistsByTierMap.set(totalTier, (assistsByTierMap.get(totalTier) || 0) + assistCount);
  }

  return {
    studentUid: usage.studentUid,
    ownCount: Number(usage.ownCount),
    assistCount: Number(usage.assistCount),
    slotsByTier: mapToSortedTierCounts(slotsByTierMap),
    assistsByTier: mapToSortedTierCounts(assistsByTierMap),
  };
}

function convertToTotalTier(tier: number, weaponTier?: number): number {
  return tier + (weaponTier || 0);
}

function mapToSortedTierCounts(tierCounts: Map<number, number>): { tier: number; count: number }[] {
  return Array.from(tierCounts.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.tier - a.tier);
}
