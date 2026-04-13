import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";
import { RANK_API_BASE_URL, createProtobufRootCache, fetchProtobuf } from "./base";

const PROTO_SCHEMA = `
syntax = "proto3";

package ranks;

option go_package = "github.com/dTrippers/mollulog-rank/api";

message RankResponse {
  int64 total_count = 1;
  repeated Rank ranks = 2;
}

message Rank {
  int64 score = 1;
  int32 rank = 2;
  int32 final_rank = 3;
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
  score: string | number;
  rank: number;
  finalRank: number;
  parties: ServerParty[];
};

type ServerRankResponse = {
  totalCount: string | number;
  ranks: ServerRank[];
};

const getProtobufRoot = createProtobufRootCache();

export type ParsedRaidRankDocument = {
  raidType: RaidType;
  seasonIndex: number;
  defenseType: Defense;
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

export function convertTier(totalTier: number): { tier: number; weaponTier?: number } {
  if (totalTier <= 5) {
    return { tier: totalTier };
  }

  return { tier: 5, weaponTier: totalTier - 5 };
}

function convertToTotalTier(tier: number, weaponTier?: number): number {
  return tier + (weaponTier || 0);
}

function convertServerRankToParsed(
  serverRank: ServerRank,
  raidType: RaidType,
  seasonIndex: number,
  defenseType: Defense,
): ParsedRaidRankDocument {
  const parties = (serverRank.parties || []).map((party, partyIndex) => {
    const slots = (party.students || []).map((studentSlot, slotIndex) => {
      if (studentSlot.slot === "empty" || !studentSlot.student) {
        return {
          slotIndex,
          tier: null,
          level: null,
          isAssist: null,
          studentUid: null,
        };
      }

      const student = studentSlot.student;
      const totalTier = convertToTotalTier(Number(student.tier || 0), student.weaponTier ?? 0);

      return {
        slotIndex,
        tier: totalTier > 0 ? totalTier : null,
        level: student.level ? Number(student.level) : null,
        isAssist: student.isAssist ?? false,
        studentUid: student.uid || null,
      };
    });

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
    rank: Number(serverRank.rank),
    finalRank: Number(serverRank.finalRank),
    score: Number(serverRank.score),
    parties,
  };
}

export async function fetchRanks(params: {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
  score?: { gte?: number; lt?: number };
  includeStudents: { uid: string; tiers: Array<[number] | [number, number]> }[];
  excludeStudents: { uid: string; tiers: Array<[number] | [number, number]> }[];
  perPage: number;
  page: number;
}): Promise<{ totalCount: number; ranks: ParsedRaidRankDocument[] }> {
  const { raidType, season, defenseType, score, includeStudents, excludeStudents, perPage, page } = params;

  const queryParams = new URLSearchParams({
    raidType,
    season: season.toString(),
    defenseType,
  });

  const body: {
    perPage: number;
    page: number;
    score?: {
      gte?: number;
      lt?: number;
    };
    includeStudents: typeof includeStudents;
    excludeStudents: typeof excludeStudents;
  } = {
    perPage,
    page,
    includeStudents,
    excludeStudents,
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

  const protobufData = await fetchProtobuf<ServerRankResponse>({
    url: `${RANK_API_BASE_URL}/v1/ranks?${queryParams.toString()}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    schema: PROTO_SCHEMA,
    messageType: "ranks.RankResponse",
    getRoot: getProtobufRoot,
  });

  return {
    totalCount: Number(protobufData.totalCount || 0),
    ranks: (protobufData.ranks || []).map((rank) => convertServerRankToParsed(rank, raidType, season, defenseType)),
  };
}
