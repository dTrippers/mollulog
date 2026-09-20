import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";

jest.mock("~/lib/postgres.server", () => {
  const actual = jest.requireActual<typeof import("~/lib/postgres.server")>("~/lib/postgres.server");
  return { ...actual, createPostgresClient: jest.fn() };
});

import {
  createPostgresCommunityComment,
  createPostgresContentComment,
  createPostgresContentSubcomment,
  deletePostgresCommunityComment,
  deletePostgresCommunityPostByUid,
  getPostgresCommunityFeedPage,
  getPostgresCommunityLikeCountsByPostUids,
  getPostgresContentCommentIdByUid,
  getPostgresContentCommentSummaries,
  getPostgresLikedCommunityPostUids,
  getPostgresNestedCommunityComments,
  getPostgresRecentStudentGradingsPage,
  getPostgresUserParties,
  pinPostgresContentComment,
  setPostgresCommunityPostLike,
  unpinPostgresContentComment,
  updatePostgresCommunityComment,
  updatePostgresContentOpinion,
} from "~/db/postgres/community";
import { createPostgresClient } from "~/lib/postgres.server";

const createPgClient = createPostgresClient as jest.MockedFunction<typeof createPostgresClient>;
const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;
type ConfiguredAuthor = {
  id: number;
  username: string;
  profileStudentId: string | null;
  profileVisibility: string;
};
let configuredAuthors = new Map<number, ConfiguredAuthor>();

function createClient(
  rowsFor: (text: string, values: unknown[]) => unknown[][] | { rows: unknown[] },
  feedOptions: { feedPost?: unknown[]; feedAuthor?: ConfiguredAuthor | null; feedCount?: number } = {},
) {
  const query = jest.fn(async (config: { text: string }, values: unknown[] = []) => {
    const lowerText = config.text.toLowerCase();
    const isAuthorJoin = lowerText.includes('inner join "senseis"') && lowerText.includes("select distinct");
    const isAuthorLookup = !lowerText.includes('inner join "senseis"') && lowerText.includes('from "senseis"');
    const isFeedJoin = lowerText.includes('left join "senseis"') && lowerText.includes('from "community_posts"');
    const result = isFeedJoin
      ? lowerText.includes("count(*)")
        ? [[feedOptions.feedCount ?? 2]]
        : (() => {
            const author = feedOptions.feedAuthor === undefined ? configuredAuthors.get(3) : feedOptions.feedAuthor;
            return [
              [
                ...(feedOptions.feedPost ??
                  communityPostRow({ id: 3, uid: "curated-3", userId: 3, origin: "curated" })),
                ...(author
                  ? [
                      author.id,
                      `sensei-${author.id}`,
                      author.username,
                      null,
                      author.profileStudentId,
                      null,
                      null,
                      true,
                      null,
                      "guest",
                      author.profileVisibility,
                      new Date("2026-08-01T00:00:00.000Z"),
                      new Date("2026-08-01T00:00:00.000Z"),
                      new Date("2026-08-01T00:00:00.000Z"),
                    ]
                  : Array.from({ length: 13 }, () => null)),
              ],
            ];
          })()
      : isAuthorJoin || isAuthorLookup
        ? [...configuredAuthors.values()].map((author) =>
            isAuthorJoin
              ? [author.id, author.id, author.username, author.profileStudentId, author.profileVisibility]
              : [author.id, author.username, author.profileStudentId, author.profileVisibility],
          )
        : rowsFor(config.text, values);
    return Array.isArray(result)
      ? { rows: result, rowCount: result.length }
      : { ...result, rowCount: result.rows.length };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, query };
}

function postVisibilityRow({ userId = 1, visibility = "public", origin = "user" } = {}): unknown[] {
  return ["post-1", userId, origin, visibility];
}

function commentRow({
  uid,
  postUid = "post-1",
  userId = 2,
  parentUid = postUid,
  visibility = "public",
}: {
  uid: string;
  postUid?: string;
  userId?: number;
  parentUid?: string;
  visibility?: string;
}): unknown[] {
  const now = new Date("2026-08-01T00:00:00.000Z");
  return [1, uid, postUid, userId, parentUid, uid, visibility, null, null, null, now, now, now];
}

function parentCommentRow({
  uid,
  postUid = "post-1",
  userId = 2,
  parentUid = postUid,
  visibility = "public",
}: {
  uid: string;
  postUid?: string;
  userId?: number;
  parentUid?: string;
  visibility?: string;
}): unknown[] {
  return [uid, postUid, parentUid, userId, visibility];
}

function communityPostRow({
  id = 1,
  uid = `post-${id}`,
  userId = 1,
  postType = "student_review",
  origin = "user",
  visibility = "public",
  blocks = [{ type: "plaintext", text: "comment" }],
}: {
  id?: number;
  uid?: string;
  userId?: number;
  postType?: string;
  origin?: string;
  visibility?: string;
  blocks?: unknown[];
} = {}): unknown[] {
  const now = new Date("2026-08-01T00:00:00.000Z");
  return [
    id,
    uid,
    userId,
    postType,
    origin,
    null,
    visibility,
    false,
    "student-1",
    null,
    null,
    null,
    blocks,
    null,
    null,
    null,
    null,
    null,
    {},
    null,
    now,
    now,
    now,
  ];
}

function communityPostObject({
  id = 1,
  uid = `post-${id}`,
  userId = 1,
  postType = "guide",
  origin = "user",
  visibility = "public",
  blocks = [{ type: "party_info", units: [["student-1"]], title: "party" }],
}: {
  id?: number;
  uid?: string;
  userId?: number;
  postType?: string;
  origin?: string;
  visibility?: string;
  blocks?: unknown[];
} = {}) {
  const now = new Date("2026-08-01T00:00:00.000Z");
  return {
    id,
    uid,
    userId,
    postType,
    origin,
    title: null,
    visibility,
    pinned: false,
    subjectStudentUid: null,
    subjectContentUid: null,
    subjectRaidType: null,
    subjectSeasonIndex: null,
    blocks,
    sourceName: null,
    sourceUrl: null,
    sourceMetadata: {},
    displayAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function authors(...values: Array<[number, "public" | "private"]>) {
  return new Map(
    values.map(([id, profileVisibility]) => [
      id,
      { id, username: `user-${id}`, profileStudentId: null, profileVisibility },
    ]),
  );
}

function setAuthors(...values: Array<[number, "public" | "private"]>) {
  configuredAuthors = authors(...values);
}

describe("PostgreSQL community repository", () => {
  it("returns every visible direct subcomment in stable query order", async () => {
    setAuthors([2, "public"], [3, "public"], [4, "public"]);
    const { client, query } = createClient((text) => {
      if (text.includes('from "community_comments"')) {
        return [
          commentRow({ uid: "top", userId: 2 }),
          commentRow({ uid: "child-1", userId: 3, parentUid: "top" }),
          commentRow({ uid: "child-2", userId: 4, parentUid: "top" }),
        ];
      }
      return [];
    });

    await expect(
      getPostgresNestedCommunityComments(env, "post-1", null, { createClient: () => client }),
    ).resolves.toEqual([
      expect.objectContaining({
        uid: "top",
        subcomments: [expect.objectContaining({ uid: "child-1" }), expect.objectContaining({ uid: "child-2" })],
      }),
    ]);
    const commentQuery = query.mock.calls.find(([config]) => config.text.includes('from "community_comments"'));
    expect(commentQuery?.[0].text.match(/community_author_mutes/g)).toHaveLength(2);
    expect(commentQuery?.[0].text.match(/NOT EXISTS/g)).toHaveLength(2);
    expect(commentQuery?.[0].text).toContain("visible_post.uid");
    expect(commentQuery?.[0].text).toContain('"community_comments"."post_uid"');
  });

  it("does not expose engagement for a post hidden from the viewer", async () => {
    const { client, query } = createClient((text) => {
      if (text.includes("count(*)")) return [["post-1", 2]];
      return [["post-1"]];
    });
    const options = { createClient: () => client };

    await expect(getPostgresCommunityLikeCountsByPostUids(env, ["post-1"], 10, options)).resolves.toEqual({
      "post-1": 2,
    });
    await expect(getPostgresLikedCommunityPostUids(env, 10, ["post-1"], options)).resolves.toEqual(new Set(["post-1"]));

    expect(query).toHaveBeenCalledTimes(2);
    for (const [config, values] of query.mock.calls) {
      expect(config.text).toContain("EXISTS");
      expect(config.text).toContain("visible_post.uid");
      expect(config.text).toContain("community_author_mutes");
      expect(config.text).toContain("NOT EXISTS");
      expect(values).toContain(10);
    }
  });

  it("applies post and author visibility to comments and likes while allowing the owner", async () => {
    setAuthors([1, "private"]);
    const blocked = createClient((text) =>
      text.includes('from "community_posts"') ? [postVisibilityRow({ userId: 1 })] : [],
    );
    await expect(
      createPostgresCommunityComment(env, 2, "post-1", "blocked", "public", null, {
        createClient: () => blocked.client,
      }),
    ).rejects.toThrow("Post not found");
    const blockedCommentQuery = blocked.query.mock.calls.find(([config]) =>
      config.text.includes('from "community_posts"'),
    );
    expect(blockedCommentQuery?.[0].text).toContain("community_author_mutes");
    expect(blockedCommentQuery?.[0].text).toContain("NOT EXISTS");
    expect(blocked.query.mock.calls.some(([config]) => config.text.includes('insert into "community_comments"'))).toBe(
      false,
    );

    const own = createClient((text) =>
      text.includes('from "community_posts"') ? [postVisibilityRow({ userId: 1 })] : [],
    );
    await expect(
      createPostgresCommunityComment(env, 1, "post-1", "allowed", "public", null, { createClient: () => own.client }),
    ).resolves.toBeTruthy();
    expect(own.query.mock.calls.some(([config]) => config.text.includes('insert into "community_comments"'))).toBe(
      true,
    );

    const blockedLike = createClient((text) =>
      text.includes('from "community_posts"') ? [postVisibilityRow({ userId: 1 })] : [],
    );
    await setPostgresCommunityPostLike(env, 2, "post-1", true, { createClient: () => blockedLike.client });
    expect(
      blockedLike.query.mock.calls.some(([config]) => config.text.includes('insert into "community_post_likes"')),
    ).toBe(false);

    const ownLike = createClient((text) =>
      text.includes('from "community_posts"') ? [postVisibilityRow({ userId: 1 })] : [],
    );
    await setPostgresCommunityPostLike(env, 1, "post-1", true, { createClient: () => ownLike.client });
    const ownLikeQuery = ownLike.query.mock.calls.find(([config]) => config.text.includes('from "community_posts"'));
    expect(ownLikeQuery?.[0].text).toContain("community_author_mutes");
    expect(ownLikeQuery?.[0].text).toContain("NOT EXISTS");
    expect(ownLikeQuery?.[1]).toContain(1);
    expect(
      ownLike.query.mock.calls.some(([config]) => config.text.includes('insert into "community_post_likes"')),
    ).toBe(true);
  });

  it("rejects invisible or nested parents without changing the error contracts", async () => {
    setAuthors([1, "public"], [2, "private"]);
    const invisibleParent = createClient((text) => {
      if (text.includes('from "community_posts"')) return [postVisibilityRow({ userId: 1 })];
      if (text.includes('from "community_comments"')) return [parentCommentRow({ uid: "parent", userId: 2 })];
      return [];
    });
    await expect(
      createPostgresCommunityComment(env, 3, "post-1", "reply", "public", "parent", {
        createClient: () => invisibleParent.client,
      }),
    ).rejects.toThrow("Parent comment not found");

    setAuthors([1, "public"], [2, "public"]);
    const nestedParent = createClient((text) => {
      if (text.includes('from "community_posts"')) return [postVisibilityRow({ userId: 1 })];
      if (text.includes('from "community_comments"')) {
        return [parentCommentRow({ uid: "nested", userId: 2, parentUid: "another-top" })];
      }
      return [];
    });
    await expect(
      createPostgresCommunityComment(env, 3, "post-1", "reply", "public", "nested", {
        createClient: () => nestedParent.client,
      }),
    ).rejects.toThrow("Cannot reply to a subcomment");
  });

  it("auto-pins only the first content comment created by a user", async () => {
    const first = createClient((text) => (text.includes('from "community_posts"') ? [] : []));
    await expect(
      createPostgresContentComment(env, 10, "content-1", "first", "private", {
        createClient: () => first.client,
      }),
    ).resolves.toBeTruthy();

    const firstInsert = first.query.mock.calls.find(([config]) =>
      config.text.includes('insert into "community_posts"'),
    );
    expect(firstInsert?.[1]).toEqual(expect.arrayContaining([10, "event_opinion", "private", true, "content-1"]));

    const firstOpinionInsert = first.query.mock.calls.find(([config]) =>
      config.text.includes('insert into "community_post_recruitment_opinions"'),
    );
    expect(firstOpinionInsert).toBeTruthy();
    expect(firstOpinionInsert?.[1]).toEqual(
      expect.arrayContaining([firstInsert?.[1]?.[0], null, null, 0]),
    );
    const lowered = first.query.mock.calls.map(([config]) => config.text.toLowerCase());
    expect(lowered).toContain("begin");
    expect(lowered).toContain("commit");
    const postsInsertIndex = lowered.findIndex((text) => text.includes('insert into "community_posts"'));
    const opinionInsertIndex = lowered.findIndex((text) =>
      text.includes('insert into "community_post_recruitment_opinions"'),
    );
    expect(lowered.indexOf("begin")).toBeLessThan(postsInsertIndex);
    expect(opinionInsertIndex).toBeGreaterThan(postsInsertIndex);
    expect(lowered.indexOf("commit")).toBeGreaterThan(opinionInsertIndex);

    const later = createClient((text) => (text.includes('from "community_posts"') ? [["existing"]] : []));
    await expect(
      createPostgresContentComment(env, 10, "content-1", "later", "public", {
        createClient: () => later.client,
      }),
    ).resolves.toBeTruthy();

    const laterInsert = later.query.mock.calls.find(([config]) =>
      config.text.includes('insert into "community_posts"'),
    );
    expect(laterInsert?.[1]).toEqual(expect.arrayContaining([10, "event_opinion", "public", false, "content-1"]));
  });

  it.each([
    ["before", "2026-08-31T23:59:59.999Z", null],
    ["at", "2026-09-01T00:00:00.000Z", "pending"],
    ["after", "2026-09-01T00:00:00.001Z", "pending"],
  ])("creates a classifier job only when a new opinion is at or after recruitment start (%s)", async (_label, now, expectedStatus) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    try {
      const client = createClient(() => []);
      const recruitmentPeriodStartAt = new Date("2026-09-01T00:00:00.000Z");

      await expect(
        createPostgresContentComment(env, 10, "content-1", "body", "public", {
          recruitmentPeriodStartAt,
          createClient: () => client.client,
        }),
      ).resolves.toBeTruthy();

      const opinionInsert = client.query.mock.calls.find(([config]) =>
        config.text.includes('insert into "community_post_recruitment_opinions"'),
      );
      expect(opinionInsert?.[1]).toEqual(
        expect.arrayContaining([recruitmentPeriodStartAt.toISOString(), expectedStatus]),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not classify a pre-recruitment root opinion when it is edited after recruitment starts", async () => {
    const recruitmentPeriodStartAt = new Date("2026-09-01T00:00:00.000Z");
    const existingCreatedAt = new Date("2026-08-31T23:59:59.000Z");
    const { client, query } = createClient((text) => {
      if (text.includes('from "community_posts"') && text.includes('"created_at"')) {
        return [[existingCreatedAt, recruitmentPeriodStartAt]];
      }
      if (text.includes('update "community_posts"')) return [["opinion-1"]];
      if (text.includes('insert into "community_post_recruitment_opinions"')) return [[1]];
      return [];
    });

    await expect(
      updatePostgresContentOpinion(env, 10, "opinion-1", "edited", "public", {
        recruitmentPeriodStartAt,
        createClient: () => client,
      }),
    ).resolves.toBeNull();

    const updateQuery = query.mock.calls.find(([config]) => config.text.includes('update "community_posts"'));
    expect(updateQuery?.[0].text).not.toContain("recruitment_opinion_classification_status");
    const upsertQuery = query.mock.calls.find(([config]) =>
      config.text.includes('insert into "community_post_recruitment_opinions"'),
    );
    expect(upsertQuery?.[0].text).toContain("on conflict");
    expect(upsertQuery?.[1]).toContain(null);
  });

  it("queues a revisioned classifier job when an eligible root opinion is edited", async () => {
    const recruitmentPeriodStartAt = new Date("2026-09-01T00:00:00.000Z");
    const existingCreatedAt = new Date("2026-09-01T00:00:00.000Z");
    const { client, query } = createClient((text) => {
      if (text.includes('from "community_posts"') && text.includes('"created_at"')) {
        return [[existingCreatedAt, recruitmentPeriodStartAt]];
      }
      if (text.includes('update "community_posts"')) return [["opinion-1"]];
      if (text.includes('insert into "community_post_recruitment_opinions"')) return [[5]];
      return [];
    });

    await expect(
      updatePostgresContentOpinion(env, 10, "opinion-1", "edited", "public", {
        recruitmentPeriodStartAt,
        createClient: () => client,
      }),
    ).resolves.toEqual({ postUid: "opinion-1", body: "edited", revision: 5 });

    const upsertQuery = query.mock.calls.find(([config]) =>
      config.text.includes('insert into "community_post_recruitment_opinions"'),
    );
    expect(upsertQuery?.[0].text).toContain('"recruitment_opinion_classification_revision" = "community_post_recruitment_opinions"."recruitment_opinion_classification_revision" + 1');
  });

  it("creates content subcomments only for a parent in the requested content", async () => {
    setAuthors([1, "public"]);
    const valid = createClient((text) => {
      if (text.includes('from "community_posts"') && text.includes('"subject_content_uid"')) {
        return [["parent-1", "content-1"]];
      }
      if (text.includes('from "community_posts"')) return [postVisibilityRow({ userId: 1 })];
      return [];
    });

    await expect(
      createPostgresContentSubcomment(env, 2, "content-1", "parent-1", "reply", "public", {
        createClient: () => valid.client,
      }),
    ).resolves.toBeTruthy();
    const insert = valid.query.mock.calls.find(([config]) => config.text.includes('insert into "community_comments"'));
    expect(insert?.[1]).toEqual(expect.arrayContaining(["parent-1", 2, "reply", "public"]));

    const wrongContent = createClient((text) =>
      text.includes('from "community_posts"') ? [["parent-1", "content-2"]] : [],
    );
    await expect(
      createPostgresContentSubcomment(env, 2, "content-1", "parent-1", "reply", "public", {
        createClient: () => wrongContent.client,
      }),
    ).rejects.toThrow("Parent comment not found");
    expect(
      wrongContent.query.mock.calls.some(([config]) => config.text.includes('insert into "community_comments"')),
    ).toBe(false);
  });

  it("resolves content comment IDs from posts before falling back to subcomments", async () => {
    const post = createClient((text) => {
      if (text.includes('from "community_posts"')) return [[11]];
      if (text.includes('from "community_comments"')) return [[27]];
      return [];
    });
    await expect(
      getPostgresContentCommentIdByUid(env, "comment-1", 10, { createClient: () => post.client }),
    ).resolves.toBe(11);

    const subcomment = createClient((text) => {
      if (text.includes('from "community_comments"')) return [[27]];
      return [];
    });
    await expect(
      getPostgresContentCommentIdByUid(env, "comment-1", 10, { createClient: () => subcomment.client }),
    ).resolves.toBe(27);

    const missing = createClient(() => []);
    await expect(
      getPostgresContentCommentIdByUid(env, "missing", undefined, { createClient: () => missing.client }),
    ).resolves.toBeNull();
  });

  it("pins only an owned content comment and supports unpinning the content", async () => {
    const valid = createClient((text) => (text.includes('from "community_posts"') ? [["post-2", "content-1"]] : []));
    await expect(
      pinPostgresContentComment(env, 10, "content-1", "post-2", { createClient: () => valid.client }),
    ).resolves.toBeUndefined();
    const validUpdates = valid.query.mock.calls.filter(([config]) => config.text.includes('update "community_posts"'));
    expect(validUpdates).toHaveLength(2);
    expect(validUpdates[0]?.[1]).toEqual(expect.arrayContaining([false, 10, "event_opinion", "content-1", true]));
    expect(validUpdates[1]?.[1]).toEqual(expect.arrayContaining([true, "post-2"]));

    const invalid = createClient(() => []);
    await expect(
      pinPostgresContentComment(env, 10, "content-1", "someone-elses-post", {
        createClient: () => invalid.client,
      }),
    ).rejects.toThrow("Comment not found or does not belong to user");
    expect(
      invalid.query.mock.calls.filter(([config]) => config.text.includes('update "community_posts"')),
    ).toHaveLength(1);

    const unpin = createClient(() => []);
    await expect(
      unpinPostgresContentComment(env, 10, "content-1", { createClient: () => unpin.client }),
    ).resolves.toBeUndefined();
    expect(unpin.query.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([false, 10, "event_opinion", "content-1", true]),
    );
  });

  it("scopes content subcomment updates and root deletes to the owning user", async () => {
    const update = createClient(() => []);
    await expect(
      updatePostgresCommunityComment(env, 10, "comment-1", "updated", "private", {
        createClient: () => update.client,
      }),
    ).resolves.toBeUndefined();
    expect(update.query.mock.calls[0]?.[0].text).toContain('update "community_comments"');
    expect(update.query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["updated", "private", "comment-1", 10]));

    const rootDelete = createClient((text) =>
      text.includes('from "community_comments"') ? [commentRow({ uid: "comment-1", userId: 10 })] : [],
    );
    await expect(
      deletePostgresCommunityComment(env, 10, "comment-1", { createClient: () => rootDelete.client }),
    ).resolves.toBeUndefined();
    const deleteCall = rootDelete.query.mock.calls.find(([config]) =>
      config.text.includes('delete from "community_comments"'),
    );
    expect(deleteCall?.[1]).toEqual(expect.arrayContaining(["comment-1"]));
    expect(deleteCall?.[0].text).toContain('"parent_uid"');
  });

  it("deletes the recruitment-opinion extension row with the owning post", async () => {
    const { client, query } = createClient((text) =>
      text.includes('from "community_posts"') ? [["post-1"]] : [],
    );
    await expect(
      deletePostgresCommunityPostByUid(env, "post-1", 10, { createClient: () => client }),
    ).resolves.toBeUndefined();

    const texts = query.mock.calls.map(([config]) => config.text);
    const opinionDeleteIndex = texts.findIndex((text) =>
      text.includes('delete from "community_post_recruitment_opinions"'),
    );
    const postDeleteIndex = texts.findIndex((text) => text.includes('delete from "community_posts"'));
    expect(opinionDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(postDeleteIndex).toBeGreaterThan(opinionDeleteIndex);
    const opinionDelete = query.mock.calls[opinionDeleteIndex];
    expect(opinionDelete?.[1]).toEqual(expect.arrayContaining(["post-1"]));
    expect(texts.some((text) => text.includes('delete from "community_comments"'))).toBe(true);
    expect(texts.some((text) => text.includes('delete from "community_post_likes"'))).toBe(true);
    expect(texts.some((text) => text.includes('delete from "community_post_tags"'))).toBe(true);
  });

  it("uses PostgreSQL aggregation for summaries and keeps pinned preview separate", async () => {
    const { client, query } = createClient((text) => {
      if (text.includes("WITH visible_posts")) {
        return { rows: [{ content_uid: "content-1", count: "3", has_recent_comment: true }] };
      }
      return { rows: [{ content_uid: "content-1", blocks: [{ type: "plaintext", text: "pinned" }] }] };
    });
    await expect(
      getPostgresContentCommentSummaries(env, ["content-1"], 10, { createClient: () => client }),
    ).resolves.toEqual({
      "content-1": { count: 3, hasRecentComment: true, pinnedPreviewBody: "pinned" },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0].text).toContain("WITH visible_posts");
    expect(query.mock.calls[0][0].text).toContain("UNION ALL");
    expect(query.mock.calls[0][0].text).toContain("GROUP BY content_uid");
    expect(query.mock.calls[0][0].text.match(/community_author_mutes/g)).toHaveLength(2);
    expect(query.mock.calls[0][0].text.match(/NOT EXISTS/g)).toHaveLength(2);
    expect(query.mock.calls[0][0].text).toContain("cam.user_id = p.user_id");
    expect(query.mock.calls[0][0].text).toContain("cam.user_id = c.user_id");
    expect(query.mock.calls[1][0].text).toContain("p.pinned = TRUE");
    expect(query.mock.calls[1][0].text).not.toContain("WITH visible_posts");
  });

  it("generates the fail-open completed RESULT_RELATED predicate when filtering is enabled", async () => {
    const { client, query } = createClient((text) => {
      if (text.includes("WITH visible_posts")) return { rows: [] };
      return { rows: [] };
    });
    await getPostgresContentCommentSummaries(env, ["content-1"], 10, {
      hideRecruitmentOpinions: true,
      recruitmentPeriodStartAtByContentId: { "content-1": "2026-09-01T00:00:00.000Z" },
      createClient: () => client,
    });

    const summaryQuery = query.mock.calls[0]?.[0].text ?? "";
    expect(summaryQuery).toMatch(
      /recruitment_opinion_classification_status.*IS NOT DISTINCT FROM 'completed'/s,
    );
    expect(summaryQuery).toMatch(
      /recruitment_opinion_classification.*IS NOT DISTINCT FROM 'RESULT_RELATED'/s,
    );
    expect(summaryQuery).not.toContain("IS DISTINCT FROM 'completed'");
    expect(summaryQuery).not.toContain("IS DISTINCT FROM 'OTHER'");
  });

  it("joins feed authors in count/page queries and preserves curated rows", async () => {
    setAuthors([1, "public"], [2, "private"], [3, "public"]);
    const { client, query } = createClient(() => []);
    createPgClient.mockReturnValue(client);

    await expect(
      getPostgresCommunityFeedPage(env, { page: 99, pageSize: 1, includeEngagement: false }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 1,
      totalCount: 2,
      totalPages: 2,
      items: [{ uid: "curated-3" }],
    });

    const calls = query.mock.calls.map(([config, values]) => ({ text: config.text, values }));
    const countIndex = calls.findIndex(({ text }) => text.includes("count(*)"));
    const rowsIndex = calls.findIndex(
      ({ text }) => text.includes('from "community_posts"') && text.toLowerCase().includes("limit"),
    );
    expect(calls.some(({ text }) => text.includes("feed_author_ids"))).toBe(false);
    expect(calls.some(({ text }) => text.includes("select distinct"))).toBe(false);
    expect(countIndex).toBeGreaterThanOrEqual(0);
    expect(rowsIndex).toBeGreaterThan(countIndex);
    expect(calls[countIndex].text).toContain('left join "senseis"');
    expect(calls[rowsIndex].text).toContain('left join "senseis"');
    expect(calls[countIndex].text).toContain('"profile_visibility"');
    expect(calls[rowsIndex].text).toContain('"profile_visibility"');
    expect(calls[countIndex].text).toContain('"origin"');
    expect(calls[rowsIndex].text).toContain('"origin"');
    expect(calls[countIndex].text).toContain("community_author_mutes");
    expect(calls[countIndex].text).toContain("NOT EXISTS");
    expect(calls[countIndex].text).toContain('"origin"');
    expect(calls[rowsIndex].text.toLowerCase()).toContain("limit");
    expect(calls[rowsIndex].text.toLowerCase()).toContain("offset");
  });

  it("keeps a private author's own feed row visible through the JOIN", async () => {
    const privateAuthor = { id: 2, username: "user-2", profileStudentId: null, profileVisibility: "private" };
    const { client, query } = createClient(() => [], {
      feedCount: 1,
      feedPost: communityPostRow({ id: 2, uid: "private-2", userId: 2, visibility: "private" }),
      feedAuthor: privateAuthor,
    });
    createPgClient.mockReturnValue(client);

    await expect(
      getPostgresCommunityFeedPage(env, { currentUserId: 2, includeEngagement: false, pageSize: 1 }),
    ).resolves.toMatchObject({ items: [{ uid: "private-2", author: { username: "user-2" } }] });

    const feedCalls = query.mock.calls
      .map(([config, values]) => ({ text: config.text, values }))
      .filter(({ text }) => text.includes('left join "senseis"'));
    expect(feedCalls).toHaveLength(2);
    expect(feedCalls.every(({ text }) => text.includes('"profile_visibility"'))).toBe(true);
    expect(feedCalls.some(({ values }) => values?.includes(2))).toBe(true);
  });

  it("loads recent grading tags only after the PostgreSQL page query", async () => {
    setAuthors([1, "public"], [2, "public"], [3, "public"]);
    const { client, query } = createClient((text) => {
      if (text.includes("select distinct")) return [[1], [2], [3]];
      if (text.includes("count(*)")) return [[3]];
      if (text.includes('from "community_post_tags"')) {
        return [[1, "tag-1", "grading-2", "student-1", "helpful", new Date("2026-08-01T00:00:00.000Z")]];
      }
      if (text.includes('from "community_posts"')) {
        return [communityPostRow({ id: 2, uid: "grading-2", userId: 2 })];
      }
      return [];
    });

    await expect(
      getPostgresRecentStudentGradingsPage(env, 2, 1, true, undefined, { createClient: () => client }),
    ).resolves.toMatchObject({
      totalCount: 3,
      totalPages: 3,
      page: 2,
      items: [{ uid: "grading-2", tags: ["helpful"] }],
    });

    const calls = query.mock.calls.map(([config]) => config.text);
    const rowsIndex = calls.findIndex(
      (text) => text.includes('from "community_posts"') && text.toLowerCase().includes("limit"),
    );
    const tagsIndex = calls.findIndex((text) => text.includes('from "community_post_tags"'));
    expect(rowsIndex).toBeGreaterThanOrEqual(0);
    expect(tagsIndex).toBeGreaterThan(rowsIndex);
    expect(calls.filter((text) => text.includes('from "community_post_tags"'))).toHaveLength(1);
  });

  it("resolves a party username before querying PostgreSQL guides", async () => {
    setAuthors([42, "public"]);
    const { client, query } = createClient((text) => {
      if (text.includes('inner join "senseis"')) {
        return [
          {
            community_posts: communityPostObject({ id: 1, uid: "party-1", userId: 42 }),
            senseis: { id: 42, username: "sensei", profileStudentId: null, profileVisibility: "public" },
          },
        ] as unknown as unknown[][];
      }
      if (text.includes('from "community_posts"')) {
        return [
          communityPostRow({
            id: 1,
            uid: "party-1",
            userId: 42,
            postType: "guide",
            blocks: [{ type: "party_info", units: [["student-1"]], title: "party" }],
          }),
        ];
      }
      return [];
    });

    const parties = await getPostgresUserParties(env, "sensei", false, { createClient: () => client });
    expect(parties).toHaveLength(1);
    expect(parties[0]).not.toHaveProperty("sensei");
    const postQuery = query.mock.calls.find(([config]) => config.text.includes('from "community_posts"'))?.[0];
    expect(postQuery?.text).toContain('"user_id"');
    expect(query.mock.calls.some(([config]) => config.text.includes('inner join "senseis"'))).toBe(true);
  });
});
