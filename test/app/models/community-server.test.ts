import { describe, expect, it, jest } from "@jest/globals";
import type { CommunityFeedPageResult } from "~/models/community";

const mockGetPostgresCommunityFeedPage = jest.fn<(...args: unknown[]) => Promise<CommunityFeedPageResult>>();
const mockGetPostgresWalkthroughTimelinesByUids = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.mock("~/db/postgres/community", () => ({
  getPostgresCommunityFeedPage: (...args: unknown[]) => mockGetPostgresCommunityFeedPage(...args),
}));
jest.mock("~/db/postgres/walkthrough-timelines", () => ({
  getPostgresWalkthroughTimelinesByUids: (...args: unknown[]) => mockGetPostgresWalkthroughTimelinesByUids(...args),
}));

import { getCommunityFeedPage } from "~/models/community.server";

const staleWalkthrough = {
  uid: "timeline-1",
  postType: "walkthrough_timeline" as const,
  origin: "user" as const,
  title: "이전 공개 제목",
  visibility: "public" as const,
  pinned: false,
  subjectStudentUid: null,
  subjectContentUid: null,
  subjectRaidType: null,
  subjectSeasonIndex: null,
  blocks: [
    {
      type: "plaintext" as const,
      text: "이전 공개 설명",
    },
    {
      type: "walkthrough_timeline" as const,
      timelineUid: "timeline-1",
      bossUid: "boss-1",
      terrain: "indoor" as const,
      defenseType: "heavy" as const,
      maxDifficulty: "torment" as const,
      partyCount: 1,
      usedStudentUids: [],
    },
  ],
  sourceName: null,
  sourceUrl: null,
  sourceMetadata: {},
  displayAt: "2026-09-05T00:00:00.000Z" as const,
  createdAt: "2026-09-05T00:00:00.000Z" as const,
  updatedAt: "2026-09-05T00:00:00.000Z" as const,
  author: null,
  liked: false,
  likeCount: 0,
  comments: [],
};

describe("community feed canonical walkthrough guard", () => {
  it.each([
    ["anonymous", "private", [{ uid: "timeline-1", visibility: "private" }]],
    ["anonymous", "unlisted", [{ uid: "timeline-1", visibility: "unlisted" }]],
    ["anonymous", "deleted", []],
    ["signed-in", "private", [{ uid: "timeline-1", visibility: "private" }]],
    ["signed-in", "unlisted", [{ uid: "timeline-1", visibility: "unlisted" }]],
    ["signed-in", "deleted", []],
  ] as const)("removes a stale %s walkthrough when the canonical record is %s", async (viewer, _state, rows) => {
    mockGetPostgresCommunityFeedPage.mockResolvedValue({
      items: [staleWalkthrough],
      page: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
    });
    mockGetPostgresWalkthroughTimelinesByUids.mockResolvedValue([...rows]);

    await expect(
      getCommunityFeedPage({ DISABLE_CACHE: "true" } as unknown as Env, {
        pageSize: 20,
        ...(viewer === "signed-in" ? { currentUserId: 7 } : {}),
      }),
    ).resolves.toMatchObject({ items: [], totalCount: 0, totalPages: 1 });
    expect(mockGetPostgresWalkthroughTimelinesByUids).toHaveBeenCalledWith(
      expect.anything(),
      ["timeline-1"],
      expect.objectContaining({ ctx: undefined }),
    );
  });

  it("keeps a cached walkthrough only when the canonical record remains public", async () => {
    mockGetPostgresCommunityFeedPage.mockResolvedValue({
      items: [staleWalkthrough],
      page: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
    });
    mockGetPostgresWalkthroughTimelinesByUids.mockResolvedValue([{ uid: "timeline-1", visibility: "public" }]);

    await expect(
      getCommunityFeedPage({ DISABLE_CACHE: "true" } as unknown as Env, { pageSize: 20 }),
    ).resolves.toMatchObject({ items: [staleWalkthrough], totalCount: 1 });
  });
});
