import { afterEach, describe, expect, it, jest } from "@jest/globals";
import protobuf from "protobufjs";
import { Defense } from "~/graphql/graphql";
import { fetchRanks, RANKS_PROTO_SCHEMA } from "~/lib/ranks/ranks";

const root = protobuf.parse(RANKS_PROTO_SCHEMA).root;
const rankResponseType = root.lookupType("ranks.RankResponse");

function encodeRankFixture(startingSkillOrder?: number): ArrayBuffer {
  const student = {
    uid: "10085",
    level: 90,
    tier: 5,
    weaponTier: 3,
    isAssist: false,
    ...(startingSkillOrder === undefined ? {} : { startingSkillOrder }),
  };
  const encoded = rankResponseType
    .encode(
      rankResponseType.create({
        totalCount: "1",
        ranks: [
          {
            score: "123456",
            rank: 1,
            finalRank: 1,
            parties: [{ students: [{ student }] }],
          },
        ],
      }),
    )
    .finish();
  const bytes = Uint8Array.from(encoded);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function mockRankResponse(startingSkillOrder?: number) {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(encodeRankFixture(startingSkillOrder), {
      headers: { "Content-Type": "application/x-protobuf" },
    }),
  );
}

describe("rank response starting skill order protobuf field", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("decodes a present starting skill order into the slot", async () => {
    mockRankResponse(3);

    const response = await fetchRanks({
      raidType: "total_assault",
      season: 84,
      defenseType: Defense.Special,
      includeStudents: [],
      excludeStudents: [],
      perPage: 10,
      page: 1,
    });

    expect(response.ranks[0].parties[0].slots[0].startingSkillOrder).toBe(3);
  });

  it("keeps an absent order and later slots absent", async () => {
    mockRankResponse();

    const response = await fetchRanks({
      raidType: "total_assault",
      season: 84,
      defenseType: Defense.Special,
      includeStudents: [],
      excludeStudents: [],
      perPage: 10,
      page: 1,
    });

    expect(response.ranks[0].parties[0].slots[0].startingSkillOrder).toBeUndefined();
    expect(response.ranks[0].parties[0].slots[1].startingSkillOrder).toBeUndefined();
  });

  it("does not turn an invalid zero into a starting skill order", async () => {
    mockRankResponse(0);

    const response = await fetchRanks({
      raidType: "total_assault",
      season: 84,
      defenseType: Defense.Special,
      includeStudents: [],
      excludeStudents: [],
      perPage: 10,
      page: 1,
    });

    expect(response.ranks[0].parties[0].slots[0].startingSkillOrder).toBeUndefined();
  });
});
