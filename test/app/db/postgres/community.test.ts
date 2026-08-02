import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";

jest.mock("~/db/postgres/community-authors", () => ({
  getCommunityAuthorsByIds: jest.fn(),
}));

import {
  createPostgresCommunityComment,
  getPostgresContentCommentSummaries,
  getPostgresNestedCommunityComments,
  setPostgresCommunityPostLike,
} from "~/db/postgres/community";
import { getCommunityAuthorsByIds } from "~/db/postgres/community-authors";

const getAuthors = getCommunityAuthorsByIds as jest.MockedFunction<typeof getCommunityAuthorsByIds>;
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
});
