import { describe, expect, it, jest } from "@jest/globals";
import {
  getCommunityFeedPage,
  setCommunityPostLike,
  upsertYoutubeVideoCommunityPost,
} from "~/models/community";

type PreparedStatement = {
  sql: string;
  params: unknown[];
};

type FakeSenseiRow = {
  id: number;
  username: string;
  profileStudentId: string | null;
};

type FakeCommunityPostRow = {
  id: number;
  uid: string;
  userId: number;
  postType: string;
  origin: "user" | "curated";
  title: string | null;
  visibility: "public" | "unlisted" | "private";
  pinned: number;
  subjectStudentUid: string | null;
  subjectContentUid: string | null;
  subjectRaidType: string | null;
  subjectSeasonIndex: number | null;
  blocks: string;
  sourceType: string | null;
  sourceUid: string | null;
  sourceId: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceMetadata: string;
  displayAt: string | null;
  migratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

class FakeD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeCommunityD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): FakeD1Statement {
    this.params = params;
    return this;
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params);
  }

  async all(): Promise<{ results: unknown[][] }> {
    return { results: this.db.selectRows(this.sql, this.params) };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    return { success: true, meta: { changes: this.db.execute({ sql: this.sql, params: this.params }) } };
  }
}

class FakeCommunityD1Database {
  posts: FakeCommunityPostRow[] = [];
  senseis: FakeSenseiRow[] = [];
  likes = new Set<string>();

  readonly preparedSql: string[] = [];
  readonly executedStatements: PreparedStatement[] = [];

  prepare(sql: string): FakeD1Statement {
    this.preparedSql.push(sql);
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): unknown[][] {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.includes("count(*)") && normalizedSql.includes("from community_posts")) {
      return [[this.filterPosts(normalizedSql, params).length]];
    }

    if (normalizedSql.includes("from community_posts") && normalizedSql.includes("left join senseis")) {
      return this.filterPosts(normalizedSql, params)
        .sort((a, b) => {
          const aDisplayAt = a.displayAt ?? a.updatedAt;
          const bDisplayAt = b.displayAt ?? b.updatedAt;
          const byDate = bDisplayAt.localeCompare(aDisplayAt);
          return byDate !== 0 ? byDate : b.id - a.id;
        })
        .map((post) => {
          const sensei = this.senseis.find((candidate) => candidate.id === post.userId);
          return [
            post.id,
            post.uid,
            post.userId,
            post.postType,
            post.origin,
            post.title,
            post.visibility,
            post.pinned,
            post.subjectStudentUid,
            post.subjectContentUid,
            post.subjectRaidType,
            post.subjectSeasonIndex,
            post.blocks,
            post.sourceName,
            post.sourceUrl,
            post.sourceMetadata,
            post.displayAt,
            post.createdAt,
            post.updatedAt,
            sensei?.username ?? null,
            sensei?.profileStudentId ?? null,
          ];
        });
    }

    if (normalizedSql.includes("select") && normalizedSql.includes("from community_posts")) {
      const post = this.findPostForSelect(normalizedSql, params);
      if (!post) return [];
      if (normalizedSql.includes("select community_posts.id") || normalizedSql.includes("select id")) return [[post.id]];
      return [[post.uid]];
    }

    if (normalizedSql.includes("select") && normalizedSql.includes("from community_post_likes")) {
      const userId = Number(params[0]);
      return [...this.likes]
        .filter((like) => like.startsWith(`${userId}:`))
        .map((like) => [like.split(":")[1]]);
    }

    if (normalizedSql.includes("count(*)") && normalizedSql.includes("from community_post_likes")) {
      const postUid = String(params[0]);
      return [[this.likeCount(postUid)]];
    }

    if (normalizedSql.includes("from community_comments")) {
      return [];
    }

    throw new Error(`Unexpected SELECT SQL: ${sql}\nparams: ${JSON.stringify(params)}`);
  }

  execute(statement: PreparedStatement): number {
    this.executedStatements.push(statement);
    const normalizedSql = normalizeSql(statement.sql);
    if (normalizedSql.startsWith("insert into community_post_likes")) {
      const [, postUid, userId] = statement.params;
      const before = this.likes.size;
      this.likes.add(`${userId}:${postUid}`);
      return this.likes.size > before ? 1 : 0;
    }

    if (normalizedSql.startsWith("delete from community_post_likes")) {
      const [postUid, userId] = statement.params;
      return this.likes.delete(`${userId}:${postUid}`) ? 1 : 0;
    }

    if (normalizedSql.startsWith("insert into community_posts")) {
      this.posts.push(rowFromInsertParams(statement.params, this.posts.length + 1));
      return 1;
    }

    if (normalizedSql.startsWith("update community_posts")) {
      const id = Number(statement.params.at(-1));
      const target = this.posts.find((post) => post.id === id);
      if (!target) return 0;

      const updated = rowPatchFromUpdateParams(statement.params);
      Object.assign(target, updated);
      return 1;
    }

    throw new Error(`Unexpected write SQL: ${statement.sql}\nparams: ${JSON.stringify(statement.params)}`);
  }

  private filterPosts(sql: string, params: unknown[]): FakeCommunityPostRow[] {
    let rows = this.posts.filter((post) => post.visibility === "public");
    const stringParams = params.filter((param): param is string => typeof param === "string");
    const postTypes = stringParams.filter((param) =>
      ["student_review", "event_opinion", "guide", "youtube_video"].includes(param),
    );
    if (sql.includes("community_posts.posttype in") && postTypes.length > 0) {
      rows = rows.filter((post) => postTypes.includes(post.postType));
    } else if (sql.includes("community_posts.posttype = ?") && postTypes.length > 0) {
      rows = rows.filter((post) => post.postType === postTypes[0]);
    }
    return rows;
  }

  private findPostForSelect(sql: string, params: unknown[]): FakeCommunityPostRow | undefined {
    if (sql.includes("community_posts.sourcetype = ?") && sql.includes("community_posts.sourceuid = ?")) {
      const [sourceType, sourceUid] = params;
      return this.posts.find((post) => post.sourceType === sourceType && post.sourceUid === sourceUid);
    }

    const uid = params.find((param): param is string => typeof param === "string" && param.startsWith("post-"));
    if (uid) return this.posts.find((post) => post.uid === uid);

    const youtubeUid = params.find((param): param is string => typeof param === "string" && param.startsWith("youtube-"));
    if (youtubeUid) return this.posts.find((post) => post.uid === youtubeUid);

    const anyString = params.find((param): param is string => typeof param === "string");
    return anyString ? this.posts.find((post) => post.uid === anyString) : undefined;
  }

  private likeCount(postUid: string): number {
    return [...this.likes].filter((like) => like.endsWith(`:${postUid}`)).length;
  }
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
}

function createUserPost(overrides: Partial<FakeCommunityPostRow> = {}): FakeCommunityPostRow {
  return {
    id: 1,
    uid: "post-user-review",
    userId: 1,
    postType: "student_review",
    origin: "user",
    title: null,
    visibility: "public",
    pinned: 0,
    subjectStudentUid: "student-a",
    subjectContentUid: null,
    subjectRaidType: null,
    subjectSeasonIndex: null,
    blocks: JSON.stringify([{ type: "plaintext", text: "기존 학생 평가" }]),
    sourceType: null,
    sourceUid: null,
    sourceId: null,
    sourceName: null,
    sourceUrl: null,
    sourceMetadata: "{}",
    displayAt: null,
    migratedAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
    ...overrides,
  };
}

function createYoutubePost(overrides: Partial<FakeCommunityPostRow> = {}): FakeCommunityPostRow {
  return createUserPost({
    id: 2,
    uid: "youtube-video-1",
    userId: 0,
    postType: "youtube_video",
    origin: "curated",
    title: "공식 영상",
    subjectStudentUid: null,
    blocks: JSON.stringify([{ type: "youtube", youtubeId: "video-1" }]),
    sourceType: "youtube",
    sourceUid: "video-1",
    sourceName: "한국 서버",
    sourceUrl: "https://www.youtube.com/watch?v=video-1",
    sourceMetadata: JSON.stringify({
      channelKey: "kr",
      thumbnailUrl: "https://i.ytimg.com/vi/video-1/hqdefault.jpg",
      isShorts: false,
    }),
    displayAt: "2026-05-10T00:00:00.000Z",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  });
}

function rowFromInsertParams(params: unknown[], nextId: number): FakeCommunityPostRow {
  const [
    uid,
    userId,
    postType,
    origin,
    title,
    visibility,
    pinned,
    blocks,
    sourceType,
    sourceUid,
    sourceName,
    sourceUrl,
    sourceMetadata,
    displayAt,
    createdAt,
    updatedAt,
  ] = params;

  return createYoutubePost({
    id: nextId,
    uid: String(uid),
    userId: Number(userId),
    postType: String(postType),
    origin: origin as "user" | "curated",
    title: title as string | null,
    visibility: visibility as "public",
    pinned: Number(pinned),
    blocks: String(blocks),
    sourceType: sourceType as string | null,
    sourceUid: sourceUid as string | null,
    sourceName: sourceName as string | null,
    sourceUrl: sourceUrl as string | null,
    sourceMetadata: String(sourceMetadata),
    displayAt: String(displayAt),
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),
  });
}

function rowPatchFromUpdateParams(params: unknown[]): Partial<FakeCommunityPostRow> {
  const [
    userId,
    postType,
    origin,
    title,
    visibility,
    pinned,
    blocks,
    sourceType,
    sourceUid,
    sourceName,
    sourceUrl,
    sourceMetadata,
    displayAt,
    updatedAt,
  ] = params;

  return {
    userId: Number(userId),
    postType: String(postType),
    origin: origin as "user" | "curated",
    title: title as string | null,
    visibility: visibility as "public",
    pinned: Number(pinned),
    blocks: String(blocks),
    sourceType: sourceType as string | null,
    sourceUid: sourceUid as string | null,
    sourceName: sourceName as string | null,
    sourceUrl: sourceUrl as string | null,
    sourceMetadata: String(sourceMetadata),
    displayAt: String(displayAt),
    updatedAt: String(updatedAt),
  };
}

function createEnv(db: FakeCommunityD1Database): Env {
  return { DB: db } as unknown as Env;
}

describe("community model feed queries", () => {
  it("keeps existing user-authored posts visible with author data and updated-at fallback displayAt", async () => {
    const db = new FakeCommunityD1Database();
    db.senseis.push({ id: 1, username: "sensei", profileStudentId: "student-profile" });
    db.posts.push(createUserPost());

    const page = await getCommunityFeedPage(createEnv(db), {
      postTypes: ["student_review", "event_opinion"],
      pageSize: 20,
      includeEngagement: false,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      uid: "post-user-review",
      postType: "student_review",
      origin: "user",
      displayAt: "2026-05-03T00:00:00.000Z",
      author: {
        id: 1,
        username: "sensei",
        profileStudentId: "student-profile",
      },
      sourceMetadata: {},
    });
  });

  it("orders curated YouTube posts by displayAt while existing user posts fall back to updatedAt", async () => {
    const db = new FakeCommunityD1Database();
    db.senseis.push({ id: 1, username: "sensei", profileStudentId: null });
    db.posts.push(
      createUserPost({ updatedAt: "2026-05-09T00:00:00.000Z" }),
      createYoutubePost({ displayAt: "2026-05-10T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" }),
    );

    const page = await getCommunityFeedPage(createEnv(db), {
      postTypes: ["student_review", "youtube_video"],
      pageSize: 20,
      includeEngagement: false,
    });

    expect(page.items.map((item) => item.uid)).toEqual(["youtube-video-1", "post-user-review"]);
    expect(page.items[0]).toMatchObject({
      origin: "curated",
      author: null,
      sourceName: "한국 서버",
      sourceUrl: "https://www.youtube.com/watch?v=video-1",
      sourceMetadata: {
        channelKey: "kr",
        thumbnailUrl: "https://i.ytimg.com/vi/video-1/hqdefault.jpg",
        isShorts: false,
      },
    });
  });
});

describe("community model likes", () => {
  it("keeps existing post likes idempotent", async () => {
    const db = new FakeCommunityD1Database();
    db.posts.push(createUserPost());

    await setCommunityPostLike(createEnv(db), 10, "post-user-review", true);
    await setCommunityPostLike(createEnv(db), 10, "post-user-review", true);
    await setCommunityPostLike(createEnv(db), 11, "post-user-review", true);

    expect(db.likes).toEqual(new Set(["10:post-user-review", "11:post-user-review"]));

    await setCommunityPostLike(createEnv(db), 10, "post-user-review", false);
    await setCommunityPostLike(createEnv(db), 10, "post-user-review", false);

    expect(db.likes).toEqual(new Set(["11:post-user-review"]));
  });

  it("uses the same like model for curated YouTube posts", async () => {
    const db = new FakeCommunityD1Database();
    db.posts.push(createYoutubePost());

    await setCommunityPostLike(createEnv(db), 10, "youtube-video-1", true);

    expect(db.likes).toEqual(new Set(["10:youtube-video-1"]));
  });
});

describe("community model YouTube upsert", () => {
  it("inserts a YouTube video as a curated community post keyed by source", async () => {
    const db = new FakeCommunityD1Database();

    await upsertYoutubeVideoCommunityPost(createEnv(db), {
      id: "new-video",
      title: "새 공식 영상",
      url: "https://www.youtube.com/watch?v=new-video",
      thumbnailUrl: "https://i.ytimg.com/vi/new-video/hqdefault.jpg",
      publishedAt: "2026-05-11T00:00:00+00:00",
      isShorts: false,
      channelKey: "kr",
      channelName: "한국 서버",
      channelUrl: "https://www.youtube.com/@bluearchive_kr",
    });

    expect(db.posts).toHaveLength(1);
    expect(db.posts[0]).toMatchObject({
      uid: "youtube-new-video",
      userId: 0,
      postType: "youtube_video",
      origin: "curated",
      title: "새 공식 영상",
      visibility: "public",
      sourceType: "youtube",
      sourceUid: "new-video",
      sourceName: "한국 서버",
      sourceUrl: "https://www.youtube.com/watch?v=new-video",
      displayAt: "2026-05-11T00:00:00+00:00",
      createdAt: "2026-05-11T00:00:00+00:00",
    });
    expect(JSON.parse(db.posts[0].blocks)).toEqual([{ type: "youtube", youtubeId: "new-video" }]);
    expect(JSON.parse(db.posts[0].sourceMetadata)).toEqual({
      channelKey: "kr",
      thumbnailUrl: "https://i.ytimg.com/vi/new-video/hqdefault.jpg",
      isShorts: false,
    });
  });

  it("updates an existing YouTube post without duplicating it", async () => {
    const db = new FakeCommunityD1Database();
    db.posts.push(createYoutubePost({ id: 7, sourceUid: "video-1", title: "이전 제목" }));

    await upsertYoutubeVideoCommunityPost(createEnv(db), {
      id: "video-1",
      title: "수정된 제목",
      url: "https://www.youtube.com/watch?v=video-1",
      thumbnailUrl: "https://i.ytimg.com/vi/video-1/hqdefault.jpg",
      publishedAt: "2026-05-12T00:00:00+00:00",
      isShorts: true,
      channelKey: "jp",
      channelName: "일본 서버",
      channelUrl: "https://www.youtube.com/@BlueArchive_JP",
    });

    expect(db.posts).toHaveLength(1);
    expect(db.posts[0]).toMatchObject({
      id: 7,
      uid: "youtube-video-1",
      title: "수정된 제목",
      sourceName: "일본 서버",
      displayAt: "2026-05-12T00:00:00+00:00",
    });
    expect(JSON.parse(db.posts[0].sourceMetadata)).toMatchObject({
      channelKey: "jp",
      isShorts: true,
    });
  });
});
