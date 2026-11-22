import protobuf from "protobufjs";
import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";
import { fetchProtobufBytes, RANK_API_BASE_URL } from "./base";

// Kept apart from overview.ts: this decoder needs protobufjs synchronously, and overview.ts is also used in the browser,
// where protobufjs is loaded on demand.
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
