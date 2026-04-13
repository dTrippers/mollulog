import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";
import { RANK_API_BASE_URL, createProtobufRootCache, fetchProtobuf } from "./base";

const STATS_PROTO_SCHEMA = `
syntax = "proto3";

package stats;

option go_package = "github.com/dTrippers/mollulog-rank/api";

message RaidInfo {
  string raid_type = 1;
  int32 season = 2;
  string defense_type = 3;
}

message StudentStatisticsResponse {
  repeated StudentStatistics students = 1;
}

message StudentStatistics {
  string student_uid = 1;
  repeated TierStatistics statistics = 2;
  RaidInfo raid = 3;
}

message TierStatistics {
  int32 tier = 1;
  optional int32 weapon_tier = 2;
  int64 count = 3;
  int64 assist_count = 4;
}
`;

const getStatsProtobufRoot = createProtobufRootCache();

type ServerTierStatistics = {
  tier: number;
  weaponTier?: number;
  count: string | number;
  assistCount: string | number;
};

type ServerRaidInfo = {
  raidType: string;
  season: number;
  defenseType: string;
};

type ServerStudentStatistics = {
  studentUid: string;
  statistics: ServerTierStatistics[];
  raid: ServerRaidInfo;
};

type ServerStudentStatisticsResponse = {
  students: ServerStudentStatistics[];
};

export type RaidStatistics = {
  raid: { raidType: RaidType; season: number; defenseType: Defense };
  studentUid: string;
  slotsCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsCount: number;
  assistsByTier: { tier: number; count: number }[];
};

function convertToTotalTier(tier: number, weaponTier?: number): number {
  return tier + (weaponTier || 0);
}

async function fetchStudentStatistics(
  params: { raidType: RaidType; season: number; defenseType: Defense } | { studentUid: string },
): Promise<ServerStudentStatisticsResponse> {
  const queryParams = new URLSearchParams();

  if ("studentUid" in params) {
    queryParams.set("studentUid", params.studentUid);
  } else {
    queryParams.set("raidType", params.raidType);
    queryParams.set("season", params.season.toString());
    queryParams.set("defenseType", params.defenseType);
  }

  return await fetchProtobuf<ServerStudentStatisticsResponse>({
    url: `${RANK_API_BASE_URL}/v1/stats?${queryParams.toString()}`,
    method: "GET",
    schema: STATS_PROTO_SCHEMA,
    messageType: "stats.StudentStatisticsResponse",
    getRoot: getStatsProtobufRoot,
  });
}

export async function fetchRaidStatisticsByStudent(studentUid: string): Promise<RaidStatistics[]> {
  return convertToRaidStatistics(await fetchStudentStatistics({ studentUid }));
}

export async function fetchRaidStatisticsByRaid(
  raidType: RaidType,
  season: number,
  defenseType: Defense,
): Promise<RaidStatistics[]> {
  return convertToRaidStatistics(await fetchStudentStatistics({ raidType, season, defenseType }));
}

function convertToRaidStatistics(response: ServerStudentStatisticsResponse): RaidStatistics[] {
  return response.students.map((rawStat) => {
    const slotsByTierMap = new Map<number, number>();
    const assistsByTierMap = new Map<number, number>();

    for (const tierStat of rawStat.statistics) {
      const totalTier = convertToTotalTier(Number(tierStat.tier), tierStat.weaponTier);
      const count = Number(tierStat.count);
      const assistCount = Number(tierStat.assistCount);

      slotsByTierMap.set(totalTier, (slotsByTierMap.get(totalTier) || 0) + count);
      assistsByTierMap.set(totalTier, (assistsByTierMap.get(totalTier) || 0) + assistCount);
    }

    const slotsByTier = Array.from(slotsByTierMap.entries())
      .map(([tier, count]) => ({ tier, count }))
      .sort((a, b) => b.tier - a.tier);

    const assistsByTier = Array.from(assistsByTierMap.entries())
      .map(([tier, count]) => ({ tier, count }))
      .sort((a, b) => b.tier - a.tier);

    return {
      raid: {
        raidType: rawStat.raid.raidType as RaidType,
        season: rawStat.raid.season,
        defenseType: rawStat.raid.defenseType as Defense,
      },
      studentUid: rawStat.studentUid,
      slotsCount: Array.from(slotsByTierMap.values()).reduce((sum, count) => sum + count, 0),
      slotsByTier,
      assistsCount: Array.from(assistsByTierMap.values()).reduce((sum, count) => sum + count, 0),
      assistsByTier,
    };
  });
}
