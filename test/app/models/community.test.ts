import { describe, expect, it, jest } from "@jest/globals";
import type { WalkthroughTimelineDocument } from "~/domain/walkthrough-timeline";
import {
  createPlaintextCommunityPostBlocks,
  createWalkthroughTimelineCommunityPostBlocks,
  getCommunityFeedPageWithCache,
  getPrimaryPlaintextBlockText,
  normalizeCommunityTimestamp,
  parseCommunityPostBlocks,
  serializeCommunityPostBlocks,
} from "~/models/community";

function createEnv() {
  const values = new Map<string, string>();
  const kv = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    put: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    delete: jest.fn(async (key: string) => {
      values.delete(key);
    }),
    list: jest.fn(async () => ({ keys: [], list_complete: true })),
  };
  return { env: { KV_CACHE: kv } as unknown as Env, kv };
}

describe("community post block helpers", () => {
  it("round-trips blocks and handles malformed storage values", () => {
    const blocks = [
      { type: "plaintext" as const, text: "설명" },
      { type: "youtube" as const, youtubeId: "video-1", startAt: 12 },
    ];

    expect(parseCommunityPostBlocks(serializeCommunityPostBlocks(blocks))).toEqual(blocks);
    expect(parseCommunityPostBlocks(blocks)).toEqual(blocks);
    expect(parseCommunityPostBlocks("not-json")).toEqual([]);
    expect(parseCommunityPostBlocks(JSON.stringify({ type: "plaintext" }))).toEqual([]);
  });

  it("normalizes user-facing plaintext and timestamps", () => {
    expect(createPlaintextCommunityPostBlocks("  공략 설명  ")).toEqual([{ type: "plaintext", text: "공략 설명" }]);
    expect(createPlaintextCommunityPostBlocks("   ")).toEqual([]);
    expect(getPrimaryPlaintextBlockText([{ type: "youtube", youtubeId: "video-1" }])).toBeNull();
    expect(
      getPrimaryPlaintextBlockText([
        { type: "youtube", youtubeId: "video-1" },
        { type: "markdown", text: "본문" },
      ]),
    ).toBe("본문");
    expect(normalizeCommunityTimestamp("2026-07-18T09:00:00+09:00")).toBe("2026-07-18T00:00:00.000Z");
  });

  it("builds a compact walkthrough projection from the first party", () => {
    const document: WalkthroughTimelineDocument = {
      type: "walkthrough_timeline",
      schemaVersion: 1,
      partySize: 6,
      context: { bossUid: "boss-1", terrain: "indoor", defenseType: "heavy", maxDifficulty: "torment" },
      parties: [
        {
          uid: "party-1",
          order: 0,
          startingSkillStudentUids: [],
          units: [
            { slot: 0, studentUid: "student-1" },
            { slot: 1, studentUid: "student-1" },
            { slot: 2, studentUid: null },
          ],
          steps: [],
        },
      ],
    };

    expect(
      createWalkthroughTimelineCommunityPostBlocks({
        uid: "timeline-1",
        description: "공략 설명",
        bossUid: "boss-1",
        terrain: "indoor",
        defenseType: "heavy",
        maxDifficulty: "torment",
        document,
      }),
    ).toEqual([
      { type: "plaintext", text: "공략 설명" },
      {
        type: "walkthrough_timeline",
        timelineUid: "timeline-1",
        bossUid: "boss-1",
        terrain: "indoor",
        defenseType: "heavy",
        maxDifficulty: "torment",
        partySize: 6,
        partyCount: 1,
        usedStudentUids: ["student-1"],
      },
    ]);
  });
});

describe("community feed cache", () => {
  it("caches anonymous first-page reads and bypasses personalized or deeper pages", async () => {
    const { env, kv } = createEnv();
    const page = {
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 0,
    };
    const loader = jest.fn(async () => page);

    await expect(getCommunityFeedPageWithCache(env, { includeEngagement: false }, loader)).resolves.toEqual(page);
    await expect(getCommunityFeedPageWithCache(env, { includeEngagement: false }, loader)).resolves.toEqual(page);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledTimes(1);

    await getCommunityFeedPageWithCache(env, { currentUserId: 1, includeEngagement: false }, loader);
    await getCommunityFeedPageWithCache(env, { page: 2, includeEngagement: false }, loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
