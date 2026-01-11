import type { RaidType, DefenseType } from "~/models/content.d";
import { createProtobufRootCache, fetchProtobuf, RAID_API_BASE_URL } from "./raid-protobuf-utils";

// Protobuf schema definition for statistics API response
const STATS_PROTO_SCHEMA = `
syntax = "proto3";

package stats;

option go_package = "github.com/dTrippers/mollulog-rank/api";

// RaidInfo represents raid information
message RaidInfo {
  string raid_type = 1;    // "total_assault" or "elimination"
  int32 season = 2;
  string defense_type = 3; // "light", "heavy", "special", "elastic"
}

// StudentStatisticsResponse contains statistics for all students
message StudentStatisticsResponse {
  repeated StudentStatistics students = 1;
}

// StudentStatistics contains statistics for a single student
message StudentStatistics {
  string student_uid = 1;
  repeated TierStatistics statistics = 2;
  RaidInfo raid = 3;
}

// TierStatistics contains statistics for a specific tier/weaponTier combination
message TierStatistics {
  int32 tier = 1;
  optional int32 weapon_tier = 2;
  int64 count = 3;
  int64 assist_count = 4;
}
`;

const getStatsProtobufRoot = createProtobufRootCache();

// Type definitions for protobuf response
type ServerTierStatistics = {
  tier: number;
  weaponTier?: number;
  count: string | number; // int64 converted to string
  assistCount: string | number; // int64 converted to string
};

type ServerRaidInfo = {
  raidType: string; // "total_assault" or "elimination"
  season: number;
  defenseType: string; // "light", "heavy", "special", "elastic"
};

type ServerStudentStatistics = {
  studentUid: string;
  statistics: ServerTierStatistics[];
  raid: ServerRaidInfo;
};

type ServerStudentStatisticsResponse = {
  students: ServerStudentStatistics[];
};


/**
 * Convert tier + weaponTier to total tier format
 * Total tier = tier + (weaponTier || 0)
 */
function convertToTotalTier(tier: number, weaponTier?: number): number {
  return tier + (weaponTier || 0);
}

/**
 * Fetch student statistics from server API
 */
async function fetchStudentStatistics(params:
  | { raidType: RaidType; season: number; defenseType: DefenseType }
  | { studentUid: string }
): Promise<ServerStudentStatisticsResponse> {
  // Build query parameters
  const queryParams = new URLSearchParams();
  if ("studentUid" in params) {
    queryParams.set("studentUid", params.studentUid);
  } else {
    const { raidType, season, defenseType } = params;
    queryParams.set("raidType", raidType);
    queryParams.set("season", season.toString());
    queryParams.set("defenseType", defenseType);
  }

  // Fetch from server
  const url = `${RAID_API_BASE_URL}/v1/stats?${queryParams.toString()}`;
  return await fetchProtobuf<ServerStudentStatisticsResponse>({
    url,
    method: "GET",
    schema: STATS_PROTO_SCHEMA,
    messageType: "stats.StudentStatisticsResponse",
    getRoot: getStatsProtobufRoot,
  });
}

export type RaidStatistics = {
  raid: { raidType: RaidType; season: number; defenseType: DefenseType };
  studentUid: string;
  slotsCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsCount: number;
  assistsByTier: { tier: number; count: number }[];
};

export async function fetchRaidStatisticsByStudent(studentUid: string): Promise<RaidStatistics[]> {
  const response = await fetchStudentStatistics({ studentUid });
  return convertToRaidStatistics(response);
}

export async function fetchRaidStatisticsByRaid(raidType: RaidType, season: number, defenseType: DefenseType): Promise<RaidStatistics[]> {
  const response = await fetchStudentStatistics({ raidType, season, defenseType });
  return convertToRaidStatistics(response);
}

function convertToRaidStatistics(response: ServerStudentStatisticsResponse): RaidStatistics[] {
  return response.students.map((rawStat) => {
    const slotsByTierMap = new Map<number, number>();
    const assistsByTierMap = new Map<number, number>();
    for (const tierStat of rawStat.statistics) {
      const totalTier = convertToTotalTier(
        Number(tierStat.tier),
        tierStat.weaponTier !== undefined ? Number(tierStat.weaponTier) : undefined
      );
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

    const slotsCount = Array.from(slotsByTierMap.values()).reduce((sum, count) => sum + count, 0);
    const assistsCount = Array.from(assistsByTierMap.values()).reduce((sum, count) => sum + count, 0);
    return {
      raid: {
        raidType: rawStat.raid.raidType as RaidType,
        season: rawStat.raid.season,
        defenseType: rawStat.raid.defenseType as DefenseType,
      },
      studentUid: rawStat.studentUid,
      slotsCount,
      slotsByTier,
      assistsCount,
      assistsByTier,
    };
  });
}