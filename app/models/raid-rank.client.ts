import type { RaidType, DefenseType } from "~/models/content.d";
import { createProtobufRootCache, fetchProtobuf, RAID_API_BASE_URL } from "./raid-protobuf-utils";

// Protobuf schema definition for server API response
const PROTO_SCHEMA = `
syntax = "proto3";

package ranks;

option go_package = "github.com/dTrippers/mollulog-rank/api";

// RankResponse contains paginated rank data
message RankResponse {
  int64 total_count = 1;
  repeated Rank ranks = 2;
}

// Rank represents a single rank entry
message Rank {
  int64 score = 1;
  int32 rank = 2;
  int32 final_rank = 3;
  repeated Party parties = 4;
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

type ServerRank = {
  score: string | number; // int64 converted to string
  rank: number;
  finalRank: number;
  parties: ServerParty[];
};

type ServerRankResponse = {
  totalCount: string | number; // int64 converted to string
  ranks: ServerRank[];
};

const getProtobufRoot = createProtobufRootCache();

// Parsed document format (for use in components)
export type ParsedRaidRankDocument = {
  raidType: RaidType;
  seasonIndex: number;
  defenseType: DefenseType;
  rank: number;
  finalRank: number;
  score: number;
  parties: {
    partyIndex: number;
    slots: {
      slotIndex: number;
      tier: number | null;
      level: number | null;
      isAssist: boolean | null;
      studentUid: string | null;
    }[];
  }[];
};

/**
 * Convert total tier format to tier + weaponTier format
 * Total tier = tier + weaponTier (tier max 5)
 * Examples:
 * - Total tier 8 → { tier: 5, weaponTier: 3 }
 * - Total tier 4 → { tier: 4 }
 */
export function convertTier(totalTier: number): { tier: number; weaponTier?: number } {
  if (totalTier <= 5) {
    return { tier: totalTier };
  }
  return { tier: 5, weaponTier: totalTier - 5 };
}

/**
 * Convert new tier + weaponTier format to total tier format
 * Total tier = tier + (weaponTier || 0)
 */
function convertToTotalTier(tier: number, weaponTier?: number): number {
  return tier + (weaponTier || 0);
}


/**
 * Convert server Rank to ParsedRaidRankDocument
 */
function convertServerRankToParsed(
  serverRank: ServerRank,
  raidType: RaidType,
  seasonIndex: number,
  defenseType: DefenseType
): ParsedRaidRankDocument {
  const rank = Number(serverRank.rank);

  const parties = (serverRank.parties || []).map((party: ServerParty, partyIndex: number) => {
    const slots = (party.students || []).map((studentSlot: ServerStudentSlot, slotIndex: number) => {
      if (studentSlot.slot === "empty" || !studentSlot.student) {
        return {
          slotIndex,
          tier: null,
          level: null,
          isAssist: null,
          studentUid: null,
        };
      }

      const student = studentSlot.student!;
      // Convert server tier + weaponTier to total tier format
      // Server: tier (1-5), weaponTier (0-4, 0 if not specified)
      // Total tier format: tier (1-9) = tier + weaponTier
      const serverTier = Number(student.tier || 0);
      const serverWeaponTier = student.weaponTier !== undefined ? Number(student.weaponTier) : 0;
      const totalTier = convertToTotalTier(serverTier, serverWeaponTier);

      return {
        slotIndex,
        tier: totalTier > 0 ? totalTier : null,
        level: student.level ? Number(student.level) : null,
        isAssist: student.isAssist ?? false,
        studentUid: student.uid || null,
      };
    });

    // Ensure 6 slots per party
    while (slots.length < 6) {
      slots.push({
        slotIndex: slots.length,
        tier: null,
        level: null,
        isAssist: null,
        studentUid: null,
      });
    }

    return { partyIndex, slots };
  });

  return {
    raidType,
    seasonIndex,
    defenseType,
    rank,
    finalRank: Number(serverRank.finalRank),
    score: Number(serverRank.score),
    parties,
  };
}


/**
 * Fetch ranks from server API
 */
export async function fetchRanks(params: {
  raidType: RaidType;
  season: number;
  defenseType: DefenseType;
  score?: { gte?: number; lt?: number };
  includeStudents: { uid: string; tiers: Array<[number] | [number, number]> }[];
  excludeStudents: { uid: string; tiers: Array<[number] | [number, number]> }[];
  perPage: number;
  page: number;
}): Promise<{ totalCount: number; ranks: ParsedRaidRankDocument[] }> {
  const { raidType, season, defenseType, score, includeStudents, excludeStudents, perPage, page } = params;

  // Build query parameters
  const queryParams = new URLSearchParams({
    raidType,
    season: season.toString(),
    defenseType,
  });

  // Build request body
  const body: any = {
    perPage,
    page,
  };

  if (score) {
    body.score = {};
    if (score.gte !== undefined) {
      body.score.gte = score.gte;
    }
    if (score.lt !== undefined) {
      body.score.lt = score.lt;
    }
  }

  // Always include includeStudents and excludeStudents, even if empty
  // Empty tiers array means "all tiers"
  body.includeStudents = includeStudents;
  body.excludeStudents = excludeStudents;

  // Fetch from server
  const url = `${RAID_API_BASE_URL}/v1/ranks?${queryParams.toString()}`;
  const protobufData = await fetchProtobuf<ServerRankResponse>({
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    schema: PROTO_SCHEMA,
    messageType: "ranks.RankResponse",
    getRoot: getProtobufRoot,
  });
  const totalCount = Number(protobufData.totalCount || 0);
  const serverRanks = protobufData.ranks || [];
  const ranks = serverRanks.map((rank) => convertServerRankToParsed(rank, raidType, season, defenseType));
  return { totalCount, ranks };
}
