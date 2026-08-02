import { describe, expect, it, jest } from "@jest/globals";
import { serializeCommunityPostBlocks } from "~/models/community";
import { getContentsCommentSummaries, getContentsComments } from "~/models/content-comment";

type SenseiRow = {
  id: number;
  username: string;
  profileStudentId: string | null;
  profileVisibility: "public" | "private";
};

type CommunityPostRow = {
  id: number;
  uid: string;
  userId: number;
  postType: "event_opinion" | "student_review";
  visibility: "public" | "private" | "unlisted";
  pinned: number;
  subjectContentUid: string | null;
  blocks: string;
  createdAt: string;
};

type CommunityCommentRow = {
  id?: number;
  uid?: string;
  postUid: string;
  userId: number;
  parentUid?: string | null;
  body?: string;
  visibility: "public" | "private";
  createdAt: string;
};

class FakeD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeContentCommentD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): FakeD1Statement {
    this.params = params;
    return this;
  }

  async raw(): Promise<unknown[][]> {
    return this.db.executeSelect(this.sql, this.params);
  }

  async all(): Promise<{ results: unknown[][] }> {
    return { results: await this.raw() };
  }
}

class FakeContentCommentD1Database {
  readonly posts: CommunityPostRow[] = [];
  readonly comments: CommunityCommentRow[] = [];
  readonly senseis: SenseiRow[] = [];
  activeQueries = 0;
  maxConcurrentQueries = 0;
  queryDelayMs = 0;

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  async executeSelect(sql: string, params: unknown[]): Promise<unknown[][]> {
    this.activeQueries += 1;
    this.maxConcurrentQueries = Math.max(this.maxConcurrentQueries, this.activeQueries);
    try {
      if (this.queryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.queryDelayMs));
      }
      return this.selectRows(sql, params);
    } finally {
      this.activeQueries -= 1;
    }
  }

  selectRows(sql: string, params: unknown[]): unknown[][] {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.includes("from community_posts") && normalizedSql.includes("inner join senseis")) {
      return this.filterPosts(params)
        .filter((post) => this.isAuthorProfileVisible(post.userId, normalizedSql, params, "community_posts"))
        .flatMap((post) => {
          const sensei = this.senseis.find((candidate) => candidate.id === post.userId);
          if (!sensei) {
            return [];
          }
          return [
            [
              post.id,
              post.uid,
              post.subjectContentUid,
              post.blocks,
              post.visibility,
              post.pinned,
              post.createdAt,
              sensei.username,
              sensei.profileStudentId,
            ],
          ];
        });
    }

    if (normalizedSql.includes("from community_posts")) {
      const posts = this.filterPosts(params);
      if (normalizedSql.includes("blocks")) {
        return posts.filter((post) => post.pinned === 1).map((post) => [post.subjectContentUid, post.blocks]);
      }
      return posts.map((post) => [post.id, post.uid, post.userId, post.subjectContentUid, post.pinned, post.createdAt]);
    }

    if (normalizedSql.includes("from community_comments") && normalizedSql.includes("inner join senseis")) {
      return this.filterComments(params)
        .filter((comment) => this.isAuthorProfileVisible(comment.userId, normalizedSql, params, "community_comments"))
        .flatMap((comment) => {
          const sensei = this.senseis.find((candidate) => candidate.id === comment.userId);
          if (!sensei) {
            return [];
          }
          return [
            [
              comment.id ?? 0,
              comment.uid ?? "",
              comment.postUid,
              comment.parentUid ?? null,
              comment.body ?? "",
              comment.visibility,
              comment.createdAt,
              sensei.username,
              sensei.profileStudentId,
            ],
          ];
        });
    }

    if (normalizedSql.includes("from community_comments")) {
      return this.filterComments(params).map((comment) => [comment.postUid, comment.createdAt]);
    }

    throw new Error(`Unexpected SELECT SQL: ${sql}\nparams: ${JSON.stringify(params)}`);
  }

  private filterPosts(params: unknown[]): CommunityPostRow[] {
    const userId = params.find((param): param is number => typeof param === "number" && param > 1);
    const contentIds = params.filter(
      (param): param is string => typeof param === "string" && param.startsWith("content-"),
    );
    const requiresPinned = params.includes(1);
    const requiresCurrentUser = userId && params[0] === userId;

    return this.posts.filter((post) => {
      if (post.postType !== "event_opinion") {
        return false;
      }
      if (!post.subjectContentUid || !contentIds.includes(post.subjectContentUid)) {
        return false;
      }
      if (requiresPinned && post.pinned !== 1) {
        return false;
      }
      if (requiresCurrentUser && post.userId !== userId) {
        return false;
      }
      return post.visibility === "public" || post.userId === userId;
    });
  }

  private filterComments(params: unknown[]): CommunityCommentRow[] {
    const userId = params.find((param): param is number => typeof param === "number" && param > 1);
    const postUids = params.filter((param): param is string => typeof param === "string" && param.startsWith("post-"));
    return this.comments.filter((comment) => {
      if (!postUids.includes(comment.postUid)) {
        return false;
      }
      return comment.visibility === "public" || (comment.visibility === "private" && comment.userId === userId);
    });
  }

  private isAuthorProfileVisible(
    authorUserId: number,
    sql: string,
    params: unknown[],
    authorTable: "community_posts" | "community_comments",
  ): boolean {
    if (!sql.includes("senseis.profilevisibility")) {
      return true;
    }

    const sensei = this.senseis.find((candidate) => candidate.id === authorUserId);
    const hasOwnerException = sql.includes(`${authorTable}.userid = ?`);
    return (
      sensei?.profileVisibility === "public" || (hasOwnerException && params.some((param) => param === authorUserId))
    );
  }
}

function createEnv(db = new FakeContentCommentD1Database()): { db: FakeContentCommentD1Database; env: Env } {
  return {
    db,
    env: { DB: db, COMMUNITY_SOURCE_MODE: "d1" } as unknown as Env,
  };
}

function post(overrides: Partial<CommunityPostRow> & Pick<CommunityPostRow, "uid" | "subjectContentUid">) {
  return {
    id: Number(overrides.uid.replace("post-", "")),
    userId: 10,
    postType: "event_opinion",
    visibility: "public",
    pinned: 0,
    blocks: serializeCommunityPostBlocks([{ type: "plaintext", text: `${overrides.uid} body` }]),
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  } satisfies CommunityPostRow;
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("getContentsComments profile visibility", () => {
  it("hides a private profile's posts and subcomments from others while keeping them visible to the owner", async () => {
    const { db, env } = createEnv();
    db.senseis.push(
      {
        id: 10,
        username: "private-sensei",
        profileStudentId: null,
        profileVisibility: "private",
      },
      {
        id: 20,
        username: "public-sensei",
        profileStudentId: "student-20",
        profileVisibility: "public",
      },
    );
    db.posts.push(
      post({ uid: "post-1", userId: 10, subjectContentUid: "content-a" }),
      post({ uid: "post-2", userId: 20, subjectContentUid: "content-a" }),
    );
    db.comments.push({
      id: 101,
      uid: "comment-1",
      postUid: "post-2",
      userId: 10,
      body: "private profile subcomment",
      visibility: "public",
      createdAt: "2026-06-02T00:00:00.000Z",
    });

    const anonymousComments = await getContentsComments(env, ["content-a"]);
    const otherUserComments = await getContentsComments(env, ["content-a"], 20);
    const ownerComments = await getContentsComments(env, ["content-a"], 10);

    expect(anonymousComments["content-a"].map((comment) => comment.sensei.username)).toEqual(["public-sensei"]);
    expect(otherUserComments["content-a"].map((comment) => comment.sensei.username)).toEqual(["public-sensei"]);
    expect(ownerComments["content-a"].map((comment) => comment.sensei.username)).toEqual([
      "private-sensei",
      "public-sensei",
      "private-sensei",
    ]);
  });
});

describe("getContentsCommentSummaries", () => {
  it("counts visible comments and subcomments, detects recent activity, and returns pinned preview", async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-06-24T00:00:00.000Z").getTime());
      const { db, env } = createEnv();
      db.posts.push(
        post({
          uid: "post-1",
          userId: 10,
          subjectContentUid: "content-a",
          pinned: 1,
          blocks: serializeCommunityPostBlocks([{ type: "plaintext", text: "Pinned preview body" }]),
          createdAt: "2026-06-10T00:00:00.000Z",
        }),
        post({
          uid: "post-2",
          userId: 20,
          subjectContentUid: "content-a",
          createdAt: "2026-06-22T00:00:00.000Z",
        }),
        post({
          uid: "post-3",
          userId: 20,
          subjectContentUid: "content-a",
          visibility: "private",
        }),
        post({
          uid: "post-4",
          userId: 10,
          subjectContentUid: "content-b",
          visibility: "private",
        }),
        post({
          uid: "post-5",
          userId: 10,
          postType: "student_review",
          subjectContentUid: "content-a",
        }),
      );
      db.comments.push(
        { postUid: "post-1", userId: 20, visibility: "public", createdAt: "2026-06-02T00:00:00.000Z" },
        { postUid: "post-2", userId: 20, visibility: "private", createdAt: "2026-06-23T00:00:00.000Z" },
        { postUid: "post-2", userId: 10, visibility: "private", createdAt: "2026-06-23T00:00:00.000Z" },
      );

      await expect(getContentsCommentSummaries(env, ["content-a", "content-b"], 10)).resolves.toEqual({
        "content-a": {
          count: 4,
          hasRecentComment: true,
          pinnedPreviewBody: "Pinned preview body",
        },
        "content-b": {
          count: 1,
          hasRecentComment: false,
          pinnedPreviewBody: null,
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("excludes private posts and subcomments for anonymous users", async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-06-24T00:00:00.000Z").getTime());
      const { db, env } = createEnv();
      db.posts.push(
        post({
          uid: "post-1",
          userId: 10,
          subjectContentUid: "content-a",
          pinned: 1,
          blocks: serializeCommunityPostBlocks([{ type: "plaintext", text: "Hidden pinned body" }]),
        }),
        post({
          uid: "post-2",
          userId: 10,
          subjectContentUid: "content-a",
          visibility: "private",
          createdAt: "2026-06-23T00:00:00.000Z",
        }),
      );
      db.comments.push(
        { postUid: "post-1", userId: 20, visibility: "public", createdAt: "2026-06-01T00:00:00.000Z" },
        { postUid: "post-1", userId: 20, visibility: "private", createdAt: "2026-06-23T00:00:00.000Z" },
      );

      await expect(getContentsCommentSummaries(env, ["content-a"])).resolves.toEqual({
        "content-a": {
          count: 2,
          hasRecentComment: false,
          pinnedPreviewBody: null,
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("limits concurrent summary batch reads", async () => {
    const { db, env } = createEnv();
    db.queryDelayMs = 5;
    const contentIds = Array.from({ length: 451 }, (_, index) => `content-${index}`);

    await getContentsCommentSummaries(env, contentIds, 10);

    expect(db.maxConcurrentQueries).toBe(4);
  });
});
