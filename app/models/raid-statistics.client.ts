import type { RaidType, DefenseType } from "~/models/content.d";
import { createProtobufRootCache, fetchProtobuf, RAID_API_BASE_URL } from "./raid-protobuf-utils";

// Protobuf schema definition for statistics API response
const STATS_PROTO_SCHEMA = `
syntax = "proto3";

package stats;

option go_package = "github.com/dTrippers/mollulog-rank/api";

// StudentStatisticsResponse contains statistics for all students
message StudentStatisticsResponse {
  repeated StudentStatistics students = 1;
}

// StudentStatistics contains statistics for a single student
message StudentStatistics {
  string student_uid = 1;
  repeated TierStatistics statistics = 2;
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

type ServerStudentStatistics = {
  studentUid: string;
  statistics: ServerTierStatistics[];
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
export async function fetchStudentStatistics(params: {
  raidType: RaidType;
  season: number;
  defenseType: DefenseType;
}): Promise<ServerStudentStatisticsResponse> {
  const { raidType, season, defenseType } = params;

  // Build query parameters
  const queryParams = new URLSearchParams({
    raidType,
    season: season.toString(),
    defenseType,
  });

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

/**
 * Convert server statistics to client format
 */
export function convertStatisticsToClientFormat(
  serverStats: ServerStudentStatisticsResponse,
  allStudents: Record<string, { name: string; role: string }>
): Array<{
  student: { uid: string; name: string; role: string };
  slotsCount: number;
  slotsByTier: { tier: number; count: number }[];
  assistsCount: number;
  assistsByTier: { tier: number; count: number }[];
}> {
  return serverStats.students
    .map((studentStat) => {
      const student = allStudents[studentStat.studentUid];
      if (!student) {
        return null;
      }

      // Aggregate statistics by total tier
      const slotsByTierMap = new Map<number, number>();
      const assistsByTierMap = new Map<number, number>();

      for (const tierStat of studentStat.statistics) {
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
        student: {
          uid: studentStat.studentUid,
          name: student.name,
          role: student.role,
        },
        slotsCount,
        slotsByTier,
        assistsCount,
        assistsByTier,
      };
    })
    .filter((stat): stat is NonNullable<typeof stat> => stat !== null)
    .filter(({ slotsCount, assistsCount }) => slotsCount + assistsCount > 100); // Filter by minimum count
}

