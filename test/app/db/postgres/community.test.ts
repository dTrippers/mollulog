import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";

jest.mock("~/db/postgres/community-authors", () => ({
  getCommunityAuthorsByIds: jest.fn(),
  getCommunityAuthorIdByUsername: jest.fn(),
}));
jest.mock("~/lib/postgres.server", () => {
  const actual = jest.requireActual<typeof import("~/lib/postgres.server")>("~/lib/postgres.server");
  return { ...actual, createPostgresClient: jest.fn() };
});

import {
  createPostgresCommunityComment,
  createPostgresContentComment,
  createPostgresContentSubcomment,
  deletePostgresCommunityComment,
  getPostgresCommunityFeedPage,
  getPostgresContentCommentIdByUid,
  getPostgresContentCommentSummaries,
  getPostgresNestedCommunityComments,
  getPostgresRecentStudentGradingsPage,
  getPostgresUserParties,
  pinPostgresContentComment,
  setPostgresCommunityPostLike,
  unpinPostgresContentComment,
  updatePostgresCommunityComment,
} from "~/db/postgres/community";
import { getCommunityAuthorIdByUsername, getCommunityAuthorsByIds } from "~/db/postgres/community-authors";
import { createPostgresClient } from "~/lib/postgres.server";

const getAuthors = getCommunityAuthorsByIds as jest.MockedFunction<typeof getCommunityAuthorsByIds>;
const getAuthorIdByUsername = getCommunityAuthorIdByUsername as jest.MockedFunction<
  typeof getCommunityAuthorIdByUsername
>;
const createPgClient = createPostgresClient as jest.MockedFunction<typeof createPostgresClient>;
const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function createClient(rowsFor: (text: string, values: unknown[]) => unknown[][] | { rows: unknown[] }) {
  const query = jest.fn(async (config: { text: string }, values: unknown[] = []) => {
    const result = rowsFor(config.text, values);
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

function authors(...values: Array<[number, "public" | "private"]>) {
  return new Map(
    values.map(([id, profileVisibility]) => [
      id,
      { id, username: `user-${id}`, profileStudentId: null, profileVisibility },
    ]),
  );
}

describe("PostgreSQL community repository", () => {
  it("returns every visible direct subcomment in stable query order", async () => {
    getAuthors.mockResolvedValue(authors([2, "public"], [3, "public"], [4, "public"]));
    const { client } = createClient((text) => {
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
  });

  it("applies post and author visibility to comments and likes while allowing the owner", async () => {
    getAuthors.mockResolvedValue(authors([1, "private"]));
    const blocked = createClient((text) =>
      text.includes('from "community_posts"') ? [postVisibilityRow({ userId: 1 })] : [],
    );
    await expect(
      createPostgresCommunityComment(env, 2, "post-1", "blocked", "public", null, {
        createClient: () => blocked.client,
      }),
    ).rejects.toThrow("Post not found");
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
    expect(
      ownLike.query.mock.calls.some(([config]) => config.text.includes('insert into "community_post_likes"')),
    ).toBe(true);
  });

  it("rejects invisible or nested parents without changing the error contracts", async () => {
    getAuthors.mockResolvedValue(authors([1, "public"], [2, "private"]));
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

    getAuthors.mockResolvedValue(authors([1, "public"], [2, "public"]));
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

  it("creates content subcomments only for a parent in the requested content", async () => {
    getAuthors.mockResolvedValue(authors([1, "public"]));
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
    expect(query.mock.calls[1][0].text).toContain("p.pinned = TRUE");
    expect(query.mock.calls[1][0].text).not.toContain("WITH visible_posts");
  });

  it("resolves feed authors before PostgreSQL count/page queries and preserves curated rows", async () => {
    getAuthors.mockReset();
    getAuthors.mockResolvedValue(authors([1, "public"], [2, "private"]));
    const { client, query } = createClient((text) => {
      if (text.includes("select distinct")) return [[1], [2], [3]];
      if (text.includes("count(*)")) return [[2]];
      if (text.includes('from "community_posts"')) {
        return [communityPostRow({ id: 3, uid: "curated-3", userId: 3, origin: "curated" })];
      }
      return [];
    });
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
    const candidateIndex = calls.findIndex(({ text }) => text.includes("select distinct"));
    const countIndex = calls.findIndex(({ text }) => text.includes("count(*)"));
    const rowsIndex = calls.findIndex(
      ({ text }) => text.includes('from "community_posts"') && text.toLowerCase().includes("limit"),
    );
    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(countIndex).toBeGreaterThan(candidateIndex);
    expect(rowsIndex).toBeGreaterThan(countIndex);
    expect(calls[candidateIndex].text).toContain('"user_id"');
    expect(calls[candidateIndex].text).not.toContain('"blocks"');
    expect(calls[countIndex].text).toContain('"origin"');
    expect(calls[countIndex].values).toContain(1);
    expect(calls[countIndex].values).not.toContain(2);
    expect(calls[countIndex].values).not.toContain(3);
    expect(calls[rowsIndex].text.toLowerCase()).toContain("limit");
    expect(calls[rowsIndex].text.toLowerCase()).toContain("offset");
    expect(getAuthors).toHaveBeenCalledWith(env, [1, 2, 3]);
  });

  it("loads recent grading tags only after the PostgreSQL page query", async () => {
    getAuthors.mockResolvedValue(authors([1, "public"], [2, "public"], [3, "public"]));
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
    getAuthors.mockClear();
    getAuthorIdByUsername.mockResolvedValue(42);
    const { client, query } = createClient((text) => {
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

    await expect(getPostgresUserParties(env, "sensei", false, { createClient: () => client })).resolves.toHaveLength(1);
    expect(getAuthorIdByUsername).toHaveBeenCalledWith(env, "sensei");
    const postQuery = query.mock.calls.find(([config]) => config.text.includes('from "community_posts"'))?.[0];
    expect(postQuery?.text).toContain('"user_id"');
    expect(getAuthors).not.toHaveBeenCalled();
  });
});
