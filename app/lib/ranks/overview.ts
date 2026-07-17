import protobuf from "protobufjs";
import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";
import { createProtobufRootCache, fetchProtobuf, fetchProtobufBytes, RANK_API_BASE_URL } from "./base";

const OVERVIEW_PROTO_SCHEMA = `
syntax = "proto3";

package overview;

option go_package = "github.com/dTrippers/mollulog-rank/api";

message RaidOverviewResponse {
  map<string, int64> clear_levels = 1;
  repeated StudentStatistics student_stats = 2;
  repeated OftenUsedParty often_used_parties = 3;
}

message StudentStatistics {
  string student_uid = 1;
  repeated TierStatistics statistics = 2;
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

const getOverviewProtobufRoot = createProtobufRootCache();

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
  count: string | number;
  assistCount: string | number;
};

type ServerStudentStatistics = {
  studentUid: string;
  statistics: ServerTierStatistics[];
};

type ServerOftenUsedParty = {
  count: string | number;
  maxRank: number;
  maxScore: string | number;
  parties: ServerParty[];
};

type ServerRaidOverviewResponse = {
  clearLevels: Record<string, string | number>;
  studentStats: ServerStudentStatistics[];
  oftenUsedParties: ServerOftenUsedParty[];
};

export async function fetchRaidOverview(params: {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
}): Promise<ServerRaidOverviewResponse> {
  const queryParams = new URLSearchParams({
    raidType: params.raidType,
    season: params.season.toString(),
    defenseType: params.defenseType,
  });

  return await fetchProtobuf<ServerRaidOverviewResponse>({
    url: `${RANK_API_BASE_URL}/v1/overview?${queryParams.toString()}`,
    method: "GET",
    schema: OVERVIEW_PROTO_SCHEMA,
    messageType: "overview.RaidOverviewResponse",
    getRoot: getOverviewProtobufRoot,
  });
}

function readTierOwnCount(reader: protobuf.Reader, end: number): number {
  let count = 0;
  while (reader.pos < end) {
    const tag = reader.uint32();
    if (tag >>> 3 === 3) {
      count += Number(reader.int64().toString());
    } else {
      reader.skipType(tag & 7);
    }
  }
  return count;
}

function readClearLevelCount(reader: protobuf.Reader, end: number): number {
  let count = 0;
  while (reader.pos < end) {
    const tag = reader.uint32();
    if (tag >>> 3 === 2) {
      count = Number(reader.int64().toString());
    } else {
      reader.skipType(tag & 7);
    }
  }
  return count;
}

function readStudentCount(reader: protobuf.Reader, end: number): { studentUid: string; count: number } {
  let studentUid = "";
  let count = 0;
  while (reader.pos < end) {
    const tag = reader.uint32();
    if (tag >>> 3 === 1) {
      studentUid = reader.string();
    } else if (tag >>> 3 === 2) {
      count += readTierOwnCount(reader, reader.uint32() + reader.pos);
    } else {
      reader.skipType(tag & 7);
    }
  }
  return { studentUid, count };
}

export function decodeRaidOverviewStudentUsage(data: ArrayBuffer): {
  sampleSize: number;
  studentCounts: Record<string, number>;
} {
  let sampleSize = 0;
  const studentCounts: Record<string, number> = {};
  const reader = protobuf.Reader.create(new Uint8Array(data));
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag >>> 3 === 1) {
      sampleSize += readClearLevelCount(reader, reader.uint32() + reader.pos);
    } else if (tag >>> 3 === 2) {
      const student = readStudentCount(reader, reader.uint32() + reader.pos);
      if (student.studentUid && student.count > 0) {
        studentCounts[student.studentUid] = (studentCounts[student.studentUid] ?? 0) + student.count;
      }
    } else {
      reader.skipType(tag & 7);
    }
  }
  return { sampleSize, studentCounts };
}

export async function fetchRaidOverviewStudentUsage(params: {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
}): Promise<{ sampleSize: number; studentCounts: Record<string, number> }> {
  const queryParams = new URLSearchParams({
    raidType: params.raidType,
    season: params.season.toString(),
    defenseType: params.defenseType,
  });
  const data = await fetchProtobufBytes({ url: `${RANK_API_BASE_URL}/v1/overview?${queryParams.toString()}` });
  return decodeRaidOverviewStudentUsage(data);
}
