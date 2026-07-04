import { afterEach, describe, expect, it, jest } from "@jest/globals";
import protobuf from "protobufjs";
import { createProtobufRootCache, fetchProtobuf, parseProtobufResponse } from "~/lib/ranks/base";

// Mirrors the real ranks.RankResponse schema (app/lib/ranks/ranks.ts), including
// a `oneof` and a nested repeated message, to catch decode/toObject shape
// regressions across protobufjs versions.
const SCHEMA = `
syntax = "proto3";

package ranks;

message RankResponse {
  int64 total_count = 1;
  repeated Rank ranks = 2;
}

message Rank {
  int64 score = 1;
  int32 rank = 2;
  repeated Party parties = 3;
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
}
`;

function encodeSample() {
  const root = protobuf.parse(SCHEMA).root;
  const Type = root.lookupType("ranks.RankResponse");
  const message = Type.fromObject({
    totalCount: 42,
    ranks: [
      {
        score: 123456789012,
        rank: 1,
        parties: [
          {
            students: [{ student: { uid: "s1", level: 90 } }, { empty: {} }],
          },
        ],
      },
    ],
  });
  return Type.encode(message).finish();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function gzip(data: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Response(toArrayBuffer(data)).body?.pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

describe("createProtobufRootCache", () => {
  it("parses a schema once and reuses the cached root for repeated calls", async () => {
    const parseSpy = jest.spyOn(protobuf, "parse");
    const getRoot = createProtobufRootCache();

    const first = await getRoot(SCHEMA);
    const second = await getRoot(SCHEMA);

    expect(first).toBe(second);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    parseSpy.mockRestore();
  });

  it("parses different schemas separately", async () => {
    const getRoot = createProtobufRootCache();
    const otherSchema = `syntax = "proto3"; package other; message Empty {}`;

    const first = await getRoot(SCHEMA);
    const second = await getRoot(otherSchema);

    expect(first).not.toBe(second);
  });
});

describe("parseProtobufResponse", () => {
  it("decodes a oneof, nested, and repeated message into the expected plain object", async () => {
    const bytes = encodeSample();
    const getRoot = createProtobufRootCache();

    const result = await parseProtobufResponse<{
      totalCount: string;
      ranks: {
        score: string;
        rank: number;
        parties: { students: { slot: string; student?: { uid: string; level: number }; empty?: object }[] }[];
      }[];
    }>(toArrayBuffer(bytes), SCHEMA, "ranks.RankResponse", getRoot);

    expect(result.totalCount).toBe("42");
    expect(result.ranks).toHaveLength(1);
    expect(result.ranks[0]).toMatchObject({ score: "123456789012", rank: 1 });

    const [studentSlot, emptySlot] = result.ranks[0].parties[0].students;
    expect(studentSlot).toMatchObject({ slot: "student", student: { uid: "s1", level: 90 } });
    expect(emptySlot).toMatchObject({ slot: "empty", empty: {} });
  });
});

describe("fetchProtobuf", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("decodes a plain (non-gzip) protobuf response", async () => {
    const bytes = encodeSample();
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      arrayBuffer: async () => toArrayBuffer(bytes),
      headers: new Headers(),
    } as Response);

    const result = await fetchProtobuf<{ totalCount: string }>({
      url: "https://ranks.example/api",
      schema: SCHEMA,
      messageType: "ranks.RankResponse",
      getRoot: createProtobufRootCache(),
    });

    expect(result.totalCount).toBe("42");
  });

  it("decompresses a gzip-encoded protobuf response before decoding", async () => {
    const bytes = encodeSample();
    const gzipped = await gzip(bytes);

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      arrayBuffer: async () => gzipped,
      headers: new Headers({ "Content-Encoding": "gzip" }),
    } as Response);

    const result = await fetchProtobuf<{ totalCount: string }>({
      url: "https://ranks.example/api",
      schema: SCHEMA,
      messageType: "ranks.RankResponse",
      getRoot: createProtobufRootCache(),
    });

    expect(result.totalCount).toBe("42");
  });

  it("throws when the response is not ok", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      statusText: "Internal Server Error",
    } as Response);

    await expect(
      fetchProtobuf({
        url: "https://ranks.example/api",
        schema: SCHEMA,
        messageType: "ranks.RankResponse",
        getRoot: createProtobufRootCache(),
      }),
    ).rejects.toThrow("Failed to fetch: Internal Server Error");
  });
});
