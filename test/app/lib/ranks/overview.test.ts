import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import protobuf from "protobufjs";
import { Defense } from "~/graphql/graphql";
import { fetchProtobufBytes } from "~/lib/ranks/base";
import { decodeRaidOverviewStudentUsage, fetchRaidOverviewStudentUsage } from "~/lib/ranks/overview";

jest.mock("~/lib/ranks/base", () => ({
  RANK_API_BASE_URL: "https://ranks.baql.net",
  createProtobufRootCache: jest.fn(() => jest.fn()),
  fetchProtobuf: jest.fn(),
  fetchProtobufBytes: jest.fn(),
}));

const mockedFetchProtobufBytes = fetchProtobufBytes as jest.MockedFunction<typeof fetchProtobufBytes>;

function encodeTier(count: number, assistCount: number) {
  return protobuf.Writer.create().uint32(24).int64(count).uint32(32).int64(assistCount).finish();
}

function encodeStudent(studentUid: string, tiers: Uint8Array[]) {
  const writer = protobuf.Writer.create().uint32(10).string(studentUid);
  for (const tier of tiers) {
    writer.uint32(18).bytes(tier);
  }
  return writer.finish();
}

function encodeClearLevel(difficulty: string, count: number) {
  return protobuf.Writer.create().uint32(10).string(difficulty).uint32(16).int64(count).finish();
}

function encodeOverview(students: Uint8Array[], clearLevels: Uint8Array[] = []) {
  const writer = protobuf.Writer.create();
  for (const clearLevel of clearLevels) {
    writer.uint32(10).bytes(clearLevel);
  }
  for (const student of students) {
    writer.uint32(18).bytes(student);
  }
  return writer.finish();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("raid overview student counts", () => {
  beforeEach(() => {
    mockedFetchProtobufBytes.mockReset();
  });

  it("decodes sample size and own student counts without protobuf code generation", () => {
    const bytes = encodeOverview(
      [encodeStudent("10001", [encodeTier(10, 2), encodeTier(3, 1)]), encodeStudent("20001", [encodeTier(7, 0)])],
      [encodeClearLevel("torment", 100), encodeClearLevel("lunatic", 50)],
    );

    expect(decodeRaidOverviewStudentUsage(toArrayBuffer(bytes))).toEqual({
      sampleSize: 150,
      studentCounts: { "10001": 13, "20001": 7 },
    });
  });

  it("requests the mapped season and returns sample size with student counts", async () => {
    const bytes = encodeOverview([encodeStudent("10001", [encodeTier(10, 2)])], [encodeClearLevel("torment", 20)]);
    mockedFetchProtobufBytes.mockResolvedValue(toArrayBuffer(bytes));

    await expect(
      fetchRaidOverviewStudentUsage({ raidType: "total_assault", season: 87, defenseType: Defense.Special }),
    ).resolves.toEqual({ sampleSize: 20, studentCounts: { "10001": 10 } });
    expect(mockedFetchProtobufBytes).toHaveBeenCalledWith({
      url: "https://ranks.baql.net/v1/overview?raidType=total_assault&season=87&defenseType=special",
    });
  });
});
