import { and, asc, count, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { type CommunityAuthor, getCommunityAuthorsByIds } from "~/db/postgres/community-authors";
import {
  pgCommunityCommentsTable,
  pgCommunityPostLikesTable,
  pgCommunityPostsTable,
  pgCommunityPostTagsTable,
} from "~/db/postgres/schema";
import type { WalkthroughTimelineRecord } from "~/domain/walkthrough-timeline";
import { normalizeInstant, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import type {
  CommunityCommentVisibility,
  CommunityFeedPageOptions,
  CommunityFeedPageResult,
  CommunityFeedPost,
  CommunityPostBlock,
  CommunityPostOrigin,
  CommunityPostType,
  CommunityVisibility,
  NestedCommunityComment,
  YoutubeVideoCommunityPostInput,
} from "~/models/community";
import type { ContentCommentSummary, ContentCommentWithSensei } from "~/models/content-comment";
import type { Party } from "~/models/party";
import type { StudentGrading, StudentGradingPageWithUser, StudentGradingWithUser } from "~/models/student-grading";
import type { StudentGradingTag, StudentGradingTagCount, StudentGradingTagValue } from "~/models/student-grading-tag";

export type PostgresCommunityOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

type CommunityDb = NodePgDatabase;
type CommunityPostRow = typeof pgCommunityPostsTable.$inferSelect;
type CommunityCommentRow = typeof pgCommunityCommentsTable.$inferSelect;

function toUtc(value: Date | string | null | undefined): UtcIsoString | null {
  if (value == null) return null;
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function requireUtc(value: Date | string | null | undefined, field: string): UtcIsoString {
  const normalized = toUtc(value);
  if (!normalized) throw new Error(`Missing required PostgreSQL timestamp: ${field}`);
  return normalized;
}

function toBlocks(value: unknown): CommunityPostBlock[] {
  return Array.isArray(value) ? (value as CommunityPostBlock[]) : [];
}

function toMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toNestedComment(
  row: CommunityCommentRow,
  author: CommunityAuthor,
  currentUserId?: number | null,
): NestedCommunityComment {
  return {
    uid: row.uid,
    body: row.body,
    visibility: row.visibility,
    createdAt: requireUtc(row.createdAt, "community_comments.created_at"),
    sensei: {
      me: row.userId === currentUserId,
      username: author.username,
      profileStudentId: author.profileStudentId,
    },
  };
}

function authorVisible(author: CommunityAuthor | undefined, currentUserId?: number | null): boolean {
  return Boolean(author && (author.profileVisibility === "public" || author.id === currentUserId));
}

function communityPostVisibleTo(row: Pick<CommunityPostRow, "visibility" | "userId">, userId: number): boolean {
  return row.visibility === "public" || row.userId === userId;
}

function communityPostAuthorVisibleTo(
  row: Pick<CommunityPostRow, "origin" | "userId">,
  author: CommunityAuthor | undefined,
  userId: number,
): boolean {
  return row.origin === "curated" || authorVisible(author, userId);
}

function communityCommentVisibleTo(row: Pick<CommunityCommentRow, "visibility" | "userId">, userId: number): boolean {
  return row.visibility === "public" || row.userId === userId;
}

function mapPost(
  row: CommunityPostRow,
  author: CommunityAuthor | undefined,
  currentUserId?: number | null,
): CommunityFeedPost {
  return {
    uid: row.uid,
    postType: row.postType as CommunityPostType,
    origin: row.origin as CommunityPostOrigin,
    title: row.title,
    visibility: row.visibility as CommunityVisibility,
    pinned: row.pinned,
    subjectStudentUid: row.subjectStudentUid,
    subjectContentUid: row.subjectContentUid,
    subjectRaidType: row.subjectRaidType,
    subjectSeasonIndex: row.subjectSeasonIndex,
    blocks: toBlocks(row.blocks),
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    sourceMetadata: toMetadata(row.sourceMetadata),
    displayAt: requireUtc(row.displayAt ?? row.createdAt, "community_posts.display_at"),
    createdAt: requireUtc(row.createdAt, "community_posts.created_at"),
    updatedAt: requireUtc(row.updatedAt, "community_posts.updated_at"),
    author:
      author && (row.origin === "curated" || authorVisible(author, currentUserId))
        ? { id: row.userId, username: author.username, profileStudentId: author.profileStudentId }
        : null,
    liked: false,
    likeCount: 0,
    comments: [],
  };
}

async function withCommunityDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: CommunityDb) => Promise<T>,
  options: PostgresCommunityOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "community_posts");
        span?.setAttribute("community.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.community.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

async function loadAuthors(env: Env, rows: readonly { userId: number }[]): Promise<Map<number, CommunityAuthor>> {
  return getCommunityAuthorsByIds(
    env,
    rows.map((row) => row.userId),
  );
}

async function loadEngagement(
  env: Env,
  postUids: string[],
  currentUserId: number | null | undefined,
  options: PostgresCommunityOptions,
): Promise<{ comments: Record<string, NestedCommunityComment[]>; likes: Record<string, number>; liked: Set<string> }> {
  const [comments, likes, liked] = await Promise.all([
    getPostgresNestedCommunityCommentsByPostUids(env, postUids, currentUserId, options),
    getPostgresCommunityLikeCountsByPostUids(env, postUids, options),
    currentUserId ? getPostgresLikedCommunityPostUids(env, currentUserId, postUids, options) : new Set<string>(),
  ]);
  return { comments, likes, liked };
}

export async function getPostgresCommunityFeedPage(
  env: Env,
  options: CommunityFeedPageOptions = {},
): Promise<CommunityFeedPageResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 20);
  const filters: SQL[] = [];
  const visible = options.currentUserId
    ? or(eq(pgCommunityPostsTable.visibility, "public"), eq(pgCommunityPostsTable.userId, options.currentUserId))
    : eq(pgCommunityPostsTable.visibility, "public");
  filters.push(visible ?? eq(pgCommunityPostsTable.visibility, "public"));
  filters.push(
    sql`(${pgCommunityPostsTable.postType} <> 'walkthrough_timeline' OR ${pgCommunityPostsTable.visibility} = 'public')`,
  );
  if (options.postTypes?.length) filters.push(inArray(pgCommunityPostsTable.postType, options.postTypes));
  else if (options.postType) filters.push(eq(pgCommunityPostsTable.postType, options.postType));
  if (options.authorUserId) filters.push(eq(pgCommunityPostsTable.userId, options.authorUserId));
  if (options.youtubeChannelKey) {
    filters.push(
      or(
        sql`${pgCommunityPostsTable.postType} <> 'youtube_video'`,
        sql`${pgCommunityPostsTable.sourceMetadata}->>'channelKey' = ${options.youtubeChannelKey}`,
      ) ?? sql`TRUE`,
    );
  }

  const rows = await withCommunityDatabase(env, "feed_rows", (db) =>
    db
      .select()
      .from(pgCommunityPostsTable)
      .where(and(...filters))
      .orderBy(
        desc(sql`coalesce(${pgCommunityPostsTable.displayAt}, ${pgCommunityPostsTable.createdAt})`),
        desc(pgCommunityPostsTable.id),
      ),
  );
  const authors = await loadAuthors(env, rows);
  const visibleRows = rows.filter(
    (row) => row.origin === "curated" || authorVisible(authors.get(row.userId), options.currentUserId),
  );
  const totalCount = visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const pageRows = visibleRows.slice(offset, offset + pageSize);
  const engagement =
    options.includeEngagement === false
      ? { comments: {}, likes: {}, liked: new Set<string>() }
      : await loadEngagement(
          env,
          pageRows.map((row) => row.uid),
          options.currentUserId,
          options,
        );
  return {
    items: pageRows.map((row) => {
      const post = mapPost(row, authors.get(row.userId), options.currentUserId);
      post.comments = engagement.comments[row.uid] ?? [];
      post.likeCount = engagement.likes[row.uid] ?? 0;
      post.liked = engagement.liked.has(row.uid);
      return post;
    }),
    page: currentPage,
    pageSize,
    totalCount,
    totalPages,
  };
}

export async function getPostgresCommunityPostByUid(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
  options: PostgresCommunityOptions = {},
): Promise<CommunityFeedPost | null> {
  const [row] = await withCommunityDatabase(
    env,
    "post_by_uid",
    (db) => db.select().from(pgCommunityPostsTable).where(eq(pgCommunityPostsTable.uid, postUid)).limit(1),
    options,
  );
  if (!row) return null;
  const authors = await loadAuthors(env, [row]);
  if (row.origin !== "curated" && !authorVisible(authors.get(row.userId), currentUserId)) return null;
  if (row.visibility !== "public" && row.userId !== currentUserId) return null;
  const engagement = await loadEngagement(env, [postUid], currentUserId, options);
  const post = mapPost(row, authors.get(row.userId), currentUserId);
  post.comments = engagement.comments[postUid] ?? [];
  post.likeCount = engagement.likes[postUid] ?? 0;
  post.liked = engagement.liked.has(postUid);
  return post;
}

export async function getPostgresCommunityLikeCountsByPostUids(
  env: Env,
  postUids: string[],
  options: PostgresCommunityOptions = {},
): Promise<Record<string, number>> {
  if (!postUids.length) return {};
  const rows = await withCommunityDatabase(
    env,
    "like_counts",
    (db) =>
      db
        .select({ postUid: pgCommunityPostLikesTable.postUid, count: count() })
        .from(pgCommunityPostLikesTable)
        .where(inArray(pgCommunityPostLikesTable.postUid, [...new Set(postUids)]))
        .groupBy(pgCommunityPostLikesTable.postUid),
    options,
  );
  return Object.fromEntries(rows.map((row) => [row.postUid, Number(row.count)]));
}

export async function getPostgresLikedCommunityPostUids(
  env: Env,
  userId: number,
  postUids: string[],
  options: PostgresCommunityOptions = {},
): Promise<Set<string>> {
  if (!postUids.length) return new Set();
  const rows = await withCommunityDatabase(
    env,
    "liked_posts",
    (db) =>
      db
        .select({ postUid: pgCommunityPostLikesTable.postUid })
        .from(pgCommunityPostLikesTable)
        .where(
          and(
            eq(pgCommunityPostLikesTable.userId, userId),
            inArray(pgCommunityPostLikesTable.postUid, [...new Set(postUids)]),
          ),
        ),
    options,
  );
  return new Set(rows.map((row) => row.postUid));
}

export async function getPostgresNestedCommunityCommentsByPostUids(
  env: Env,
  postUids: string[],
  currentUserId?: number | null,
  options: PostgresCommunityOptions = {},
): Promise<Record<string, NestedCommunityComment[]>> {
  const result: Record<string, NestedCommunityComment[]> = Object.fromEntries(postUids.map((uid) => [uid, []]));
  if (!postUids.length) return result;
  const rows = await withCommunityDatabase(
    env,
    "nested_comments",
    (db) =>
      db
        .select()
        .from(pgCommunityCommentsTable)
        .where(
          and(
            inArray(pgCommunityCommentsTable.postUid, [...new Set(postUids)]),
            currentUserId
              ? or(
                  eq(pgCommunityCommentsTable.visibility, "public"),
                  eq(pgCommunityCommentsTable.userId, currentUserId),
                )
              : eq(pgCommunityCommentsTable.visibility, "public"),
          ),
        )
        .orderBy(asc(pgCommunityCommentsTable.createdAt), asc(pgCommunityCommentsTable.id)),
    options,
  );
  const authors = await loadAuthors(env, rows);
  const visibleRows = rows.filter((row) => authorVisible(authors.get(row.userId), currentUserId));
  const byPost = new Map<string, CommunityCommentRow[]>();
  for (const row of visibleRows) byPost.set(row.postUid, [...(byPost.get(row.postUid) ?? []), row]);
  for (const postUid of postUids) {
    const comments = byPost.get(postUid) ?? [];
    const top = comments.filter((comment) => comment.parentUid === postUid);
    result[postUid] = top
      .map((comment) => {
        const children = comments.filter((candidate) => candidate.parentUid === comment.uid);
        const author = authors.get(comment.userId);
        if (!author) return null;
        const nested = toNestedComment(comment, author, currentUserId);
        nested.subcomments = children.flatMap((child) => {
          const childAuthor = authors.get(child.userId);
          return childAuthor ? [toNestedComment(child, childAuthor, currentUserId)] : [];
        });
        return nested;
      })
      .filter((comment): comment is NestedCommunityComment => comment !== null);
  }
  return result;
}

export async function getPostgresNestedCommunityComments(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
  options: PostgresCommunityOptions = {},
) {
  return (await getPostgresNestedCommunityCommentsByPostUids(env, [postUid], currentUserId, options))[postUid] ?? [];
}

export async function setPostgresCommunityPostLike(
  env: Env,
  userId: number,
  postUid: string,
  liked: boolean,
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "set_like",
    async (db) => {
      const [post] = await db
        .select({
          postType: pgCommunityPostsTable.postType,
          userId: pgCommunityPostsTable.userId,
          origin: pgCommunityPostsTable.origin,
          visibility: pgCommunityPostsTable.visibility,
        })
        .from(pgCommunityPostsTable)
        .where(eq(pgCommunityPostsTable.uid, postUid))
        .limit(1);
      if (!post || post.postType === "walkthrough_timeline") return;
      const authors = await getCommunityAuthorsByIds(env, [post.userId]);
      if (
        !communityPostVisibleTo(post, userId) ||
        !communityPostAuthorVisibleTo(post, authors.get(post.userId), userId)
      ) {
        return;
      }
      if (liked) {
        await db
          .insert(pgCommunityPostLikesTable)
          .values({ uid: nanoid(8), postUid, userId, createdAt: new Date() })
          .onConflictDoNothing({ target: [pgCommunityPostLikesTable.postUid, pgCommunityPostLikesTable.userId] });
      } else {
        await db
          .delete(pgCommunityPostLikesTable)
          .where(and(eq(pgCommunityPostLikesTable.postUid, postUid), eq(pgCommunityPostLikesTable.userId, userId)));
      }
    },
    options,
  );
}

export async function createPostgresCommunityComment(
  env: Env,
  userId: number,
  postUid: string,
  body: string,
  visibility: CommunityCommentVisibility,
  parentUid?: string | null,
  options: PostgresCommunityOptions = {},
): Promise<string> {
  const uid = nanoid(8);
  await withCommunityDatabase(
    env,
    "create_comment",
    async (db) => {
      const [post] = await db
        .select({
          uid: pgCommunityPostsTable.uid,
          userId: pgCommunityPostsTable.userId,
          origin: pgCommunityPostsTable.origin,
          visibility: pgCommunityPostsTable.visibility,
        })
        .from(pgCommunityPostsTable)
        .where(eq(pgCommunityPostsTable.uid, postUid))
        .limit(1);
      let parent: Pick<CommunityCommentRow, "uid" | "postUid" | "parentUid" | "userId" | "visibility"> | undefined;
      const targetParent = parentUid ?? postUid;
      if (targetParent !== postUid) {
        [parent] = await db
          .select({
            uid: pgCommunityCommentsTable.uid,
            postUid: pgCommunityCommentsTable.postUid,
            parentUid: pgCommunityCommentsTable.parentUid,
            userId: pgCommunityCommentsTable.userId,
            visibility: pgCommunityCommentsTable.visibility,
          })
          .from(pgCommunityCommentsTable)
          .where(eq(pgCommunityCommentsTable.uid, targetParent))
          .limit(1);
      }
      const authors = await getCommunityAuthorsByIds(env, [post?.userId ?? -1, ...(parent ? [parent.userId] : [])]);
      if (
        !post ||
        !communityPostVisibleTo(post, userId) ||
        !communityPostAuthorVisibleTo(post, authors.get(post.userId), userId)
      ) {
        throw new Error("Post not found");
      }
      if (targetParent !== postUid) {
        if (
          !parent ||
          parent.postUid !== postUid ||
          !communityCommentVisibleTo(parent, userId) ||
          !authorVisible(authors.get(parent.userId), userId)
        ) {
          throw new Error("Parent comment not found");
        }
        if (parent.parentUid !== postUid) throw new Error("Cannot reply to a subcomment");
      }
      const now = new Date();
      await db
        .insert(pgCommunityCommentsTable)
        .values({ uid, postUid, userId, parentUid: targetParent, body, visibility, createdAt: now, updatedAt: now });
    },
    options,
  );
  return uid;
}

export async function updatePostgresCommunityComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: CommunityCommentVisibility,
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "update_comment",
    (db) =>
      db
        .update(pgCommunityCommentsTable)
        .set({ body, visibility, updatedAt: new Date() })
        .where(and(eq(pgCommunityCommentsTable.uid, commentUid), eq(pgCommunityCommentsTable.userId, userId))),
    options,
  );
}

export async function deletePostgresCommunityComment(
  env: Env,
  userId: number,
  commentUid: string,
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "delete_comment",
    async (db) => {
      const [comment] = await db
        .select()
        .from(pgCommunityCommentsTable)
        .where(and(eq(pgCommunityCommentsTable.uid, commentUid), eq(pgCommunityCommentsTable.userId, userId)))
        .limit(1);
      if (!comment) return;
      if (comment.parentUid === comment.postUid) {
        await db
          .delete(pgCommunityCommentsTable)
          .where(or(eq(pgCommunityCommentsTable.uid, commentUid), eq(pgCommunityCommentsTable.parentUid, commentUid)));
      } else {
        await db.delete(pgCommunityCommentsTable).where(eq(pgCommunityCommentsTable.uid, commentUid));
      }
    },
    options,
  );
}

export async function deletePostgresCommunityPostByUid(
  env: Env,
  postUid: string,
  userId?: number,
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "delete_post",
    async (db) => {
      const filters = [eq(pgCommunityPostsTable.uid, postUid)];
      if (userId !== undefined) filters.push(eq(pgCommunityPostsTable.userId, userId));
      const [post] = await db
        .select({ uid: pgCommunityPostsTable.uid })
        .from(pgCommunityPostsTable)
        .where(and(...filters))
        .limit(1);
      if (!post) return;
      await db.delete(pgCommunityCommentsTable).where(eq(pgCommunityCommentsTable.postUid, postUid));
      await db.delete(pgCommunityPostLikesTable).where(eq(pgCommunityPostLikesTable.postUid, postUid));
      await db.delete(pgCommunityPostTagsTable).where(eq(pgCommunityPostTagsTable.postUid, postUid));
      await db.delete(pgCommunityPostsTable).where(eq(pgCommunityPostsTable.uid, postUid));
    },
    options,
  );
}

export async function syncPostgresWalkthroughTimelineCommunityPost(
  env: Env,
  timeline: WalkthroughTimelineRecord,
  blocks: CommunityPostBlock[],
  options: PostgresCommunityOptions = {},
): Promise<string | null> {
  return withCommunityDatabase(
    env,
    "sync_walkthrough",
    async (db) => {
      const [existing] = await db
        .select({ uid: pgCommunityPostsTable.uid })
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.sourceType, "raid_walkthrough"),
            eq(pgCommunityPostsTable.sourceUid, timeline.uid),
          ),
        )
        .limit(1);
      if (!existing && timeline.visibility !== "public") return null;
      const now = new Date();
      const values = {
        userId: timeline.userId,
        postType: "walkthrough_timeline" as const,
        origin: "user" as const,
        title: timeline.title,
        visibility: timeline.visibility,
        pinned: false,
        blocks,
        sourceType: "raid_walkthrough",
        sourceUid: timeline.uid,
        sourceMetadata: {},
        updatedAt: timeline.updatedAt,
      };
      if (existing) {
        await db.update(pgCommunityPostsTable).set(values).where(eq(pgCommunityPostsTable.uid, existing.uid));
        return existing.uid;
      }
      await db.insert(pgCommunityPostsTable).values({ ...values, uid: timeline.uid, displayAt: now, createdAt: now });
      return timeline.uid;
    },
    options,
  );
}

export async function upsertPostgresYoutubeCommunityPost(
  env: Env,
  video: YoutubeVideoCommunityPostInput,
  blocks: CommunityPostBlock[],
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "upsert_youtube",
    async (db) => {
      const now = new Date();
      const [existing] = await db
        .select({ id: pgCommunityPostsTable.id })
        .from(pgCommunityPostsTable)
        .where(and(eq(pgCommunityPostsTable.sourceType, "youtube"), eq(pgCommunityPostsTable.sourceUid, video.id)))
        .limit(1);
      const values = {
        userId: 0,
        postType: "youtube_video" as const,
        origin: "curated" as const,
        title: video.title,
        visibility: "public" as const,
        pinned: false,
        blocks,
        sourceType: "youtube",
        sourceUid: video.id,
        sourceName: video.channelName,
        sourceUrl: video.url,
        sourceMetadata: { channelKey: video.channelKey, thumbnailUrl: video.thumbnailUrl, isShorts: video.isShorts },
        displayAt: new Date(video.publishedAt),
        updatedAt: now,
      };
      if (existing) await db.update(pgCommunityPostsTable).set(values).where(eq(pgCommunityPostsTable.id, existing.id));
      else
        await db
          .insert(pgCommunityPostsTable)
          .values({ ...values, uid: `youtube-${video.id}`, createdAt: new Date(video.publishedAt) });
    },
    options,
  );
}

export async function createPostgresCommunityPost(
  env: Env,
  values: {
    uid?: string;
    userId: number;
    postType: CommunityPostType;
    origin?: CommunityPostOrigin;
    title?: string | null;
    visibility: CommunityVisibility;
    pinned?: boolean;
    subjectStudentUid?: string | null;
    subjectContentUid?: string | null;
    subjectRaidType?: string | null;
    subjectSeasonIndex?: number | null;
    blocks: CommunityPostBlock[];
    sourceType?: string | null;
    sourceUid?: string | null;
    sourceName?: string | null;
    sourceUrl?: string | null;
    sourceMetadata?: Record<string, unknown>;
  },
  options: PostgresCommunityOptions = {},
): Promise<string> {
  const uid = values.uid ?? nanoid(8);
  await withCommunityDatabase(
    env,
    "create_post",
    (db) => {
      const now = new Date();
      return db.insert(pgCommunityPostsTable).values({
        ...values,
        uid,
        origin: values.origin ?? "user",
        title: values.title ?? null,
        pinned: values.pinned ?? false,
        subjectStudentUid: values.subjectStudentUid ?? null,
        subjectContentUid: values.subjectContentUid ?? null,
        subjectRaidType: values.subjectRaidType ?? null,
        subjectSeasonIndex: values.subjectSeasonIndex ?? null,
        sourceType: values.sourceType ?? null,
        sourceUid: values.sourceUid ?? null,
        sourceName: values.sourceName ?? null,
        sourceUrl: values.sourceUrl ?? null,
        sourceMetadata: values.sourceMetadata ?? {},
        displayAt: now,
        createdAt: now,
        updatedAt: now,
      });
    },
    options,
  );
  return uid;
}

export async function upsertPostgresCommunityPost(
  env: Env,
  postUid: string,
  values: Parameters<typeof createPostgresCommunityPost>[1],
  options: PostgresCommunityOptions = {},
): Promise<string> {
  const existing = await getPostgresCommunityPostByUid(env, postUid, values.userId, options);
  if (!existing) return createPostgresCommunityPost(env, { ...values, uid: postUid }, options);
  await withCommunityDatabase(
    env,
    "update_post",
    (db) =>
      db
        .update(pgCommunityPostsTable)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(pgCommunityPostsTable.uid, postUid), eq(pgCommunityPostsTable.userId, values.userId))),
    options,
  );
  return postUid;
}

export async function getPostgresContentComments(
  env: Env,
  contentIds: string[],
  userId?: number,
  options: PostgresCommunityOptions = {},
): Promise<Record<string, ContentCommentWithSensei[]>> {
  const unique = [...new Set(contentIds)];
  const result: Record<string, ContentCommentWithSensei[]> = Object.fromEntries(unique.map((id) => [id, []]));
  if (!unique.length) return result;
  const posts = await withCommunityDatabase(
    env,
    "content_comments",
    (db) =>
      db
        .select()
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.postType, "event_opinion"),
            inArray(pgCommunityPostsTable.subjectContentUid, unique),
            userId
              ? or(eq(pgCommunityPostsTable.visibility, "public"), eq(pgCommunityPostsTable.userId, userId))
              : eq(pgCommunityPostsTable.visibility, "public"),
          ),
        ),
    options,
  );
  const authors = await loadAuthors(env, posts);
  const visiblePosts = posts.filter((post) => authorVisible(authors.get(post.userId), userId));
  const postMap = new Map(visiblePosts.map((post) => [post.uid, post]));
  const comments = visiblePosts.length
    ? await withCommunityDatabase(
        env,
        "content_subcomments",
        (db) =>
          db
            .select()
            .from(pgCommunityCommentsTable)
            .where(
              and(
                inArray(
                  pgCommunityCommentsTable.postUid,
                  visiblePosts.map((post) => post.uid),
                ),
                userId
                  ? or(eq(pgCommunityCommentsTable.visibility, "public"), eq(pgCommunityCommentsTable.userId, userId))
                  : eq(pgCommunityCommentsTable.visibility, "public"),
              ),
            ),
        options,
      )
    : [];
  const commentAuthors = await loadAuthors(env, comments);
  for (const post of visiblePosts) {
    const author = authors.get(post.userId);
    if (!author) continue;
    const body =
      toBlocks(post.blocks).find((block) => block.type === "plaintext" || block.type === "markdown")?.text ?? "";
    const contentId = post.subjectContentUid ?? "";
    result[contentId].push({
      id: post.id,
      uid: post.uid,
      contentId,
      body,
      visibility: post.visibility === "private" ? "private" : "public",
      parentCommentId: null,
      pinned: post.pinned,
      createdAt: requireUtc(post.createdAt, "community_posts.created_at"),
      sensei: { username: author.username, profileStudentId: author.profileStudentId },
    });
  }
  for (const comment of comments) {
    const post = postMap.get(comment.postUid);
    const author = commentAuthors.get(comment.userId);
    if (!post || !author || !authorVisible(author, userId)) continue;
    const contentId = post.subjectContentUid ?? "";
    result[contentId].push({
      id: comment.id,
      uid: comment.uid,
      contentId,
      body: comment.body,
      visibility: comment.visibility,
      parentCommentId: post.id,
      pinned: false,
      createdAt: requireUtc(comment.createdAt, "community_comments.created_at"),
      sensei: { username: author.username, profileStudentId: author.profileStudentId },
    });
  }
  return result;
}

export async function createPostgresContentComment(
  env: Env,
  userId: number,
  contentId: string,
  body: string,
  visibility: CommunityCommentVisibility,
  options: PostgresCommunityOptions = {},
): Promise<string> {
  const uid = nanoid(8);
  await withCommunityDatabase(
    env,
    "create_content_comment",
    async (db) => {
      const [existing] = await db
        .select({ uid: pgCommunityPostsTable.uid })
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.userId, userId),
            eq(pgCommunityPostsTable.postType, "event_opinion"),
            eq(pgCommunityPostsTable.subjectContentUid, contentId),
          ),
        )
        .limit(1);
      const now = new Date();
      await db.insert(pgCommunityPostsTable).values({
        uid,
        userId,
        postType: "event_opinion",
        origin: "user",
        visibility: visibility === "private" ? "private" : "public",
        pinned: !existing,
        subjectContentUid: contentId,
        blocks: [{ type: "plaintext", text: body }],
        displayAt: now,
        createdAt: now,
        updatedAt: now,
      });
    },
    options,
  );
  return uid;
}

export async function createPostgresContentSubcomment(
  env: Env,
  userId: number,
  contentId: string,
  parentCommentUid: string,
  body: string,
  visibility: CommunityCommentVisibility,
  options: PostgresCommunityOptions = {},
): Promise<string> {
  const [parent] = await withCommunityDatabase(
    env,
    "content_comment_parent",
    (db) =>
      db
        .select({ uid: pgCommunityPostsTable.uid, subjectContentUid: pgCommunityPostsTable.subjectContentUid })
        .from(pgCommunityPostsTable)
        .where(
          and(eq(pgCommunityPostsTable.uid, parentCommentUid), eq(pgCommunityPostsTable.postType, "event_opinion")),
        )
        .limit(1),
    options,
  );
  if (!parent || parent.subjectContentUid !== contentId) throw new Error("Parent comment not found");
  return createPostgresCommunityComment(env, userId, parentCommentUid, body, visibility, parentCommentUid, options);
}

export async function getPostgresContentCommentIdByUid(
  env: Env,
  commentUid: string,
  userId?: number,
  options: PostgresCommunityOptions = {},
): Promise<number | null> {
  const [post, comment] = await withCommunityDatabase(
    env,
    "content_comment_id",
    async (db) => {
      const [post] = await db
        .select({ id: pgCommunityPostsTable.id })
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.uid, commentUid),
            eq(pgCommunityPostsTable.postType, "event_opinion"),
            userId
              ? or(eq(pgCommunityPostsTable.visibility, "public"), eq(pgCommunityPostsTable.userId, userId))
              : eq(pgCommunityPostsTable.visibility, "public"),
          ),
        )
        .limit(1);
      const [comment] = await db
        .select({ id: pgCommunityCommentsTable.id })
        .from(pgCommunityCommentsTable)
        .where(
          and(
            eq(pgCommunityCommentsTable.uid, commentUid),
            userId
              ? or(eq(pgCommunityCommentsTable.visibility, "public"), eq(pgCommunityCommentsTable.userId, userId))
              : eq(pgCommunityCommentsTable.visibility, "public"),
          ),
        )
        .limit(1);
      return [post, comment] as const;
    },
    options,
  );
  return post?.id ?? comment?.id ?? null;
}

export async function pinPostgresContentComment(
  env: Env,
  userId: number,
  contentId: string,
  commentUid: string,
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "pin_content_comment",
    async (db) => {
      const now = new Date();
      await db
        .update(pgCommunityPostsTable)
        .set({ pinned: false, updatedAt: now })
        .where(
          and(
            eq(pgCommunityPostsTable.userId, userId),
            eq(pgCommunityPostsTable.postType, "event_opinion"),
            eq(pgCommunityPostsTable.subjectContentUid, contentId),
            eq(pgCommunityPostsTable.pinned, true),
          ),
        );
      const [post] = await db
        .select({ uid: pgCommunityPostsTable.uid, subjectContentUid: pgCommunityPostsTable.subjectContentUid })
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.uid, commentUid),
            eq(pgCommunityPostsTable.userId, userId),
            eq(pgCommunityPostsTable.postType, "event_opinion"),
          ),
        )
        .limit(1);
      if (!post || post.subjectContentUid !== contentId)
        throw new Error("Comment not found or does not belong to user");
      await db
        .update(pgCommunityPostsTable)
        .set({ pinned: true, updatedAt: new Date() })
        .where(eq(pgCommunityPostsTable.uid, commentUid));
    },
    options,
  );
}

export async function unpinPostgresContentComment(
  env: Env,
  userId: number,
  contentId: string,
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "unpin_content_comment",
    (db) =>
      db
        .update(pgCommunityPostsTable)
        .set({ pinned: false, updatedAt: new Date() })
        .where(
          and(
            eq(pgCommunityPostsTable.userId, userId),
            eq(pgCommunityPostsTable.postType, "event_opinion"),
            eq(pgCommunityPostsTable.subjectContentUid, contentId),
            eq(pgCommunityPostsTable.pinned, true),
          ),
        ),
    options,
  );
}

export async function getPostgresContentCommentSummaries(
  env: Env,
  contentIds: string[],
  userId?: number,
  options: PostgresCommunityOptions = {},
): Promise<Record<string, ContentCommentSummary>> {
  const unique = [...new Set(contentIds)];
  const result: Record<string, ContentCommentSummary> = Object.fromEntries(
    unique.map((id) => [id, { count: 0, hasRecentComment: false, pinnedPreviewBody: null }]),
  );
  if (!unique.length) return result;
  const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  await withCommunityDatabase(
    env,
    "content_comment_summaries",
    async (db) => {
      const contentValues = sql.join(
        unique.map((contentId) => sql`${contentId}`),
        sql`, `,
      );
      const postVisibility =
        userId === undefined ? sql`p.visibility = 'public'` : sql`(p.visibility = 'public' OR p.user_id = ${userId})`;
      const commentVisibility =
        userId === undefined ? sql`c.visibility = 'public'` : sql`(c.visibility = 'public' OR c.user_id = ${userId})`;
      const summaryQuery = await db.execute(sql`
        WITH visible_posts AS (
          SELECT p.uid, p.subject_content_uid AS content_uid, p.created_at
          FROM community_posts p
          WHERE p.post_type = 'event_opinion'
            AND p.subject_content_uid IN (${contentValues})
            AND ${postVisibility}
        ), visible_items AS (
          SELECT content_uid, created_at
          FROM visible_posts
          UNION ALL
          SELECT p.content_uid, c.created_at
          FROM visible_posts p
          INNER JOIN community_comments c ON c.post_uid = p.uid
          WHERE ${commentVisibility}
        )
        SELECT content_uid, COUNT(*)::integer AS count,
          BOOL_OR(created_at >= ${recent}) AS has_recent_comment
        FROM visible_items
        GROUP BY content_uid
      `);
      const summaryRows = summaryQuery.rows as Array<{
        content_uid: string | null;
        count: number | string;
        has_recent_comment: boolean | null;
      }>;
      for (const row of summaryRows) {
        if (!row.content_uid || !result[row.content_uid]) continue;
        result[row.content_uid].count = Number(row.count);
        result[row.content_uid].hasRecentComment = Boolean(row.has_recent_comment);
      }

      if (userId === undefined) return;
      const pinnedQuery = await db.execute(sql`
        SELECT p.subject_content_uid AS content_uid, p.blocks
        FROM community_posts p
        WHERE p.user_id = ${userId}
          AND p.post_type = 'event_opinion'
          AND p.pinned = TRUE
          AND p.subject_content_uid IN (${contentValues})
          AND (p.visibility = 'public' OR p.user_id = ${userId})
        ORDER BY p.id ASC
      `);
      const pinnedRows = pinnedQuery.rows as Array<{ content_uid: string | null; blocks: unknown }>;
      for (const row of pinnedRows) {
        if (!row.content_uid || !result[row.content_uid] || result[row.content_uid].pinnedPreviewBody !== null)
          continue;
        result[row.content_uid].pinnedPreviewBody =
          toBlocks(row.blocks).find((block) => block.type === "plaintext" || block.type === "markdown")?.text ?? null;
      }
    },
    options,
  );
  return result;
}

export async function getPostgresPartiesByRaidReference(
  env: Env,
  raidType: string,
  seasonIndex: number,
  includeSensei = false,
  options: PostgresCommunityOptions = {},
): Promise<Party[]> {
  const rows = await withCommunityDatabase(
    env,
    "parties_by_raid",
    (db) =>
      db
        .select()
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.postType, "guide"),
            eq(pgCommunityPostsTable.visibility, "public"),
            eq(pgCommunityPostsTable.subjectRaidType, raidType),
            eq(pgCommunityPostsTable.subjectSeasonIndex, seasonIndex),
          ),
        ),
    options,
  );
  const authors = await loadAuthors(env, rows);
  return rows
    .filter((row) => authorVisible(authors.get(row.userId)))
    .map((row) => toParty(row, includeSensei ? authors.get(row.userId) : undefined));
}

export async function getPostgresUserParties(
  env: Env,
  username: string,
  includePrivate = false,
  options: PostgresCommunityOptions = {},
): Promise<Party[]> {
  const rows = await withCommunityDatabase(
    env,
    "user_parties",
    (db) =>
      db
        .select()
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.postType, "guide"),
            includePrivate
              ? undefined
              : inArray(pgCommunityPostsTable.visibility, ["public", "unlisted"] as CommunityVisibility[]),
          ),
        ),
    options,
  );
  const authors = await loadAuthors(env, rows);
  return rows.filter((row) => authors.get(row.userId)?.username === username).map((row) => toParty(row));
}

function toParty(row: CommunityPostRow, author?: CommunityAuthor): Party {
  const blocks = toBlocks(row.blocks);
  const info = blocks.find((block) => block.type === "party_info") as
    | Extract<CommunityPostBlock, { type: "party_info" }>
    | undefined;
  const memo =
    info?.memo?.trim() || blocks.find((block) => block.type === "plaintext" || block.type === "markdown")?.text || null;
  return {
    uid: row.uid,
    sensei: author ? { username: author.username, profileStudentId: author.profileStudentId } : undefined,
    name: row.title ?? info?.title ?? "이름 없는 공략",
    studentIds: info?.units ?? [],
    raidType: row.subjectRaidType ?? info?.raidType ?? null,
    seasonIndex: row.subjectSeasonIndex ?? info?.seasonIndex ?? null,
    memo,
    showAsRaidTip: row.visibility === "public",
  };
}

export async function getPostgresGradingTags(
  env: Env,
  gradingUid: string,
  options: PostgresCommunityOptions = {},
): Promise<StudentGradingTag[]> {
  const rows = await withCommunityDatabase(
    env,
    "grading_tags",
    (db) => db.select().from(pgCommunityPostTagsTable).where(eq(pgCommunityPostTagsTable.postUid, gradingUid)),
    options,
  );
  return rows.map((row) => ({
    uid: row.uid,
    gradingUid: row.postUid,
    studentUid: row.studentUid,
    tagValue: row.tagValue as StudentGradingTagValue,
  }));
}

export async function getPostgresGradingTagsByUids(
  env: Env,
  gradingUids: string[],
  options: PostgresCommunityOptions = {},
): Promise<Record<string, StudentGradingTag[]>> {
  const result: Record<string, StudentGradingTag[]> = Object.fromEntries(gradingUids.map((uid) => [uid, []]));
  if (!gradingUids.length) return result;
  const rows = await withCommunityDatabase(
    env,
    "grading_tags_batch",
    (db) =>
      db
        .select()
        .from(pgCommunityPostTagsTable)
        .where(inArray(pgCommunityPostTagsTable.postUid, [...new Set(gradingUids)])),
    options,
  );
  for (const row of rows)
    result[row.postUid]?.push({
      uid: row.uid,
      gradingUid: row.postUid,
      studentUid: row.studentUid,
      tagValue: row.tagValue as StudentGradingTagValue,
    });
  return result;
}

export async function setPostgresGradingTags(
  env: Env,
  gradingUid: string,
  studentUid: string,
  tagValues: StudentGradingTagValue[],
  options: PostgresCommunityOptions = {},
): Promise<void> {
  await withCommunityDatabase(
    env,
    "set_grading_tags",
    async (db) => {
      await db.delete(pgCommunityPostTagsTable).where(eq(pgCommunityPostTagsTable.postUid, gradingUid));
      if (!tagValues.length) return;
      await db.insert(pgCommunityPostTagsTable).values(
        tagValues.map((tagValue) => ({
          uid: nanoid(8),
          postUid: gradingUid,
          studentUid,
          tagValue,
          createdAt: new Date(),
        })),
      );
    },
    options,
  );
}

export async function getPostgresTagCountsByStudent(
  env: Env,
  studentUid: string,
  values: readonly StudentGradingTagValue[],
  options: PostgresCommunityOptions = {},
): Promise<StudentGradingTagCount[]> {
  const rows = await withCommunityDatabase(
    env,
    "grading_tag_counts",
    (db) =>
      db
        .select({ tag: pgCommunityPostTagsTable.tagValue, count: count() })
        .from(pgCommunityPostTagsTable)
        .where(eq(pgCommunityPostTagsTable.studentUid, studentUid))
        .groupBy(pgCommunityPostTagsTable.tagValue),
    options,
  );
  const counts = new Map(rows.map((row) => [row.tag, Number(row.count)]));
  return values.map((tag) => ({ tag, displayName: tag, count: counts.get(tag) ?? 0 }));
}

export async function getPostgresStudentGradingsByStudent(
  env: Env,
  studentUid: string,
  viewerUserId?: number,
  includeTags = false,
  options: PostgresCommunityOptions = {},
): Promise<StudentGradingWithUser[]> {
  const rows = await withCommunityDatabase(
    env,
    "gradings_by_student",
    (db) =>
      db
        .select()
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.postType, "student_review"),
            eq(pgCommunityPostsTable.subjectStudentUid, studentUid),
          ),
        ),
    options,
  );
  const authors = await loadAuthors(env, rows);
  const tags = includeTags
    ? await getPostgresGradingTagsByUids(
        env,
        rows.map((row) => row.uid),
        options,
      )
    : {};
  return rows
    .filter((row) => authorVisible(authors.get(row.userId), viewerUserId))
    .flatMap((row) => {
      const author = authors.get(row.userId);
      if (!author) return [];
      return [
        {
          uid: row.uid,
          studentUid: row.subjectStudentUid ?? studentUid,
          comment:
            toBlocks(row.blocks).find((block) => block.type === "plaintext" || block.type === "markdown")?.text ?? null,
          createdAt: requireUtc(row.createdAt, "community_posts.created_at"),
          updatedAt: requireUtc(row.updatedAt, "community_posts.updated_at"),
          user: { username: author.username, profileStudentId: author.profileStudentId },
          ...(includeTags ? { tags: (tags[row.uid] ?? []).map((tag) => tag.tagValue) } : {}),
        },
      ];
    });
}

export async function getPostgresRecentStudentGradingsPage(
  env: Env,
  page: number,
  pageSize: number,
  includeTags: boolean,
  viewerUserId?: number,
  options: PostgresCommunityOptions = {},
): Promise<StudentGradingPageWithUser> {
  const rows = await withCommunityDatabase(
    env,
    "recent_gradings",
    (db) =>
      db
        .select()
        .from(pgCommunityPostsTable)
        .where(eq(pgCommunityPostsTable.postType, "student_review"))
        .orderBy(
          desc(pgCommunityPostsTable.updatedAt),
          desc(pgCommunityPostsTable.createdAt),
          desc(pgCommunityPostsTable.id),
        ),
    options,
  );
  const authors = await loadAuthors(env, rows);
  const visible = rows.filter((row) => authorVisible(authors.get(row.userId), viewerUserId));
  const totalCount = visible.length;
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const tags = includeTags
    ? await getPostgresGradingTagsByUids(
        env,
        visible.map((row) => row.uid),
        options,
      )
    : {};
  const items: StudentGradingWithUser[] = visible
    .slice((currentPage - 1) * safePageSize, currentPage * safePageSize)
    .flatMap((row) => {
      const author = authors.get(row.userId);
      if (!author) return [];
      return [
        {
          uid: row.uid,
          studentUid: row.subjectStudentUid ?? "",
          comment:
            toBlocks(row.blocks).find((block) => block.type === "plaintext" || block.type === "markdown")?.text ?? null,
          createdAt: requireUtc(row.createdAt, "community_posts.created_at"),
          updatedAt: requireUtc(row.updatedAt, "community_posts.updated_at"),
          user: { username: author.username, profileStudentId: author.profileStudentId },
          ...(includeTags ? { tags: (tags[row.uid] ?? []).map((tag) => tag.tagValue) } : {}),
        },
      ];
    });
  return { items, page: currentPage, pageSize: safePageSize, totalCount, totalPages };
}

export async function getPostgresStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  options: PostgresCommunityOptions = {},
) {
  const [row] = await withCommunityDatabase(
    env,
    "grading_by_user",
    (db) =>
      db
        .select()
        .from(pgCommunityPostsTable)
        .where(
          and(
            eq(pgCommunityPostsTable.postType, "student_review"),
            eq(pgCommunityPostsTable.userId, senseiId),
            eq(pgCommunityPostsTable.subjectStudentUid, studentUid),
          ),
        )
        .limit(1),
    options,
  );
  if (!row) return null;
  const grading: StudentGrading = {
    uid: row.uid,
    studentUid: row.subjectStudentUid ?? "",
    comment:
      toBlocks(row.blocks).find((block) => block.type === "plaintext" || block.type === "markdown")?.text ?? null,
    createdAt: requireUtc(row.createdAt, "community_posts.created_at"),
    updatedAt: requireUtc(row.updatedAt, "community_posts.updated_at"),
  };
  return grading;
}

export async function getPostgresStudentGradingsByUser(
  env: Env,
  userId: number,
  includeTags = true,
  options: PostgresCommunityOptions = {},
): Promise<StudentGrading[]> {
  const rows = await withCommunityDatabase(
    env,
    "gradings_by_user",
    (db) =>
      db
        .select()
        .from(pgCommunityPostsTable)
        .where(and(eq(pgCommunityPostsTable.postType, "student_review"), eq(pgCommunityPostsTable.userId, userId)))
        .orderBy(
          desc(pgCommunityPostsTable.updatedAt),
          desc(pgCommunityPostsTable.createdAt),
          desc(pgCommunityPostsTable.id),
        ),
    options,
  );
  const tags = includeTags
    ? await getPostgresGradingTagsByUids(
        env,
        rows.map((row) => row.uid),
        options,
      )
    : {};
  return rows.map((row) => ({
    uid: row.uid,
    studentUid: row.subjectStudentUid ?? "",
    comment:
      toBlocks(row.blocks).find((block) => block.type === "plaintext" || block.type === "markdown")?.text ?? null,
    createdAt: requireUtc(row.createdAt, "community_posts.created_at"),
    updatedAt: requireUtc(row.updatedAt, "community_posts.updated_at"),
    ...(includeTags ? { tags: (tags[row.uid] ?? []).map((tag) => tag.tagValue) } : {}),
  }));
}

export async function upsertPostgresStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  blocks: CommunityPostBlock[],
  options: PostgresCommunityOptions = {},
): Promise<string> {
  const existing = await getPostgresStudentGrading(env, senseiId, studentUid, options);
  if (existing) {
    await withCommunityDatabase(
      env,
      "update_grading",
      (db) =>
        db
          .update(pgCommunityPostsTable)
          .set({ blocks, visibility: "public", updatedAt: new Date() })
          .where(eq(pgCommunityPostsTable.uid, existing.uid)),
      options,
    );
    return existing.uid;
  }
  return createPostgresCommunityPost(
    env,
    { userId: senseiId, postType: "student_review", visibility: "public", subjectStudentUid: studentUid, blocks },
    options,
  );
}

export async function getPostgresRecruitmentStatsRows(
  env: Env,
  postUids: string[],
  options: PostgresCommunityOptions = {},
) {
  if (!postUids.length) return [];
  const { pgRecruitmentResultsTable } = await import("~/db/postgres/schema");
  return withCommunityDatabase(
    env,
    "recruitment_stats",
    (db) =>
      db
        .select({
          userId: pgRecruitmentResultsTable.userId,
          recruitedStudents: pgRecruitmentResultsTable.recruitedStudents,
          tier3Count: pgRecruitmentResultsTable.tier3Count,
          trial: pgRecruitmentResultsTable.trial,
          commentPostUid: pgRecruitmentResultsTable.commentPostUid,
        })
        .from(pgRecruitmentResultsTable)
        .where(inArray(pgRecruitmentResultsTable.commentPostUid, [...new Set(postUids)])),
    options,
  );
}
