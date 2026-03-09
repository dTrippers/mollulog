import type { RaidType } from "~/models/content.d";
import type { Defense } from "~/graphql/graphql";
import { createProtobufRootCache, fetchProtobuf, RAID_API_BASE_URL } from "./raid-protobuf-utils";

// Protobuf schema definition for overview API response
const OVERVIEW_PROTO_SCHEMA = `
syntax = "proto3";

package overview;

option go_package = "github.com/dTrippers/mollulog-rank/api";

// RaidOverviewResponse contains overview data for a raid
message RaidOverviewResponse {
  map<string, int64> clear_levels = 1;  // difficulty -> count
  repeated StudentStatistics student_stats = 2;  // Top 6
  repeated OftenUsedParty often_used_parties = 3;  // Top 6
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

// OftenUsedParty represents a party composition with its usage count
message OftenUsedParty {
  int64 count = 1;
  int32 max_rank = 2;  // Best (lowest) rank achieved with this composition
  int64 max_score = 3;  // Highest score achieved with this composition
  repeated Party parties = 4;  // Same party composition, different orders
}

// Party represents a team composition with up to 6 student slots
message Party {
  repeated StudentSlot students = 1;
}

// StudentSlot can be either a student or empty (null)
message StudentSlot {
  oneof slot {
    Student student = 1;
    EmptySlot empty = 2;
  }
}

// EmptySlot represents an empty slot in a party
message EmptySlot {}

// Student represents a character in the game
message Student {
  string uid = 1;           // 5-digit student ID
  int32 level = 2;
  int32 tier = 3;           // 1-5
  int32 weapon_tier = 4;    // 1-4, 0 if not specified
  bool is_assist = 5;
}
`;

const getOverviewProtobufRoot = createProtobufRootCache();

// Type definitions for protobuf response
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

type ServerOftenUsedParty = {
  count: string | number; // int64 converted to string
  maxRank: number; // int32
  maxScore: string | number; // int64 converted to string
  parties: ServerParty[];
};

type ServerRaidOverviewResponse = {
  clearLevels: Record<string, string | number>; // map<string, int64>
  studentStats: ServerStudentStatistics[];
  oftenUsedParties: ServerOftenUsedParty[];
};


/**
 * Fetch raid overview from server API
 */
export async function fetchRaidOverview(params: {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
}): Promise<ServerRaidOverviewResponse> {
  const { raidType, season, defenseType } = params;

  // Build query parameters
  const queryParams = new URLSearchParams({
    raidType,
    season: season.toString(),
    defenseType,
  });

  // Fetch from server
  const url = `${RAID_API_BASE_URL}/v1/overview?${queryParams.toString()}`;
  
  return await fetchProtobuf<ServerRaidOverviewResponse>({
    url,
    method: "GET",
    schema: OVERVIEW_PROTO_SCHEMA,
    messageType: "overview.RaidOverviewResponse",
    getRoot: getOverviewProtobufRoot,
  });
}

