import { type SQLWrapper, and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import { type UtcIsoString, normalizeUtcTimestamp, nowUtcIso } from "~/lib/date-time";
import { watchIo } from "~/lib/io-watchdog";
import { cacheKey, cacheQuery, fetchCached } from "~/lib/cache";
import { senseisTable } from "./sensei";

export type CommunityPostType = "student_review" | "event_opinion" | "guide" | "youtube_video" | "recruitment_result";
export type CommunityPostOrigin = "user" | "curated";
export type CommunityVisibility = "public" | "unlisted" | "private";
export type CommunityCommentVisibility = "public" | "private";

export type PlaintextCommunityPostBlock = {
  type: "plaintext";
  text: string;
};

export type MarkdownCommunityPostBlock = {
  type: "markdown";
  text: string;
};

export type YoutubeCommunityPostBlock = {
  type: "youtube";
  youtubeId: string;
  startAt?: number | null;
};

export type PartyInfoCommunityPostBlock = {
  type: "party_info";
  title?: string | null;
  memo?: string | null;
  raidType?: string | null;
  seasonIndex?: number | null;
  units: (string | null)[][];
};

export type CommunityPostBlock =
  | PlaintextCommunityPostBlock
  | MarkdownCommunityPostBlock
  | YoutubeCommunityPostBlock
  | PartyInfoCommunityPostBlock;

export type NestedCommunityComment = {
  uid: string;
  body: string;
  visibility: CommunityCommentVisibility;
  createdAt: UtcIsoString;
  sensei: {
    me: boolean;
    username: string;
    profileStudentId: string | null;
  };
  subcomments?: NestedCommunityComment[];
};

export type CommunityFeedPost = {
  uid: string;
  postType: CommunityPostType;
  origin: CommunityPostOrigin;
  title: string | null;
  visibility: CommunityVisibility;
  pinned: boolean;
  subjectStudentUid: string | null;
  subjectContentUid: string | null;
  subjectRaidType: string | null;
  subjectSeasonIndex: number | null;
  blocks: CommunityPostBlock[];
  sourceName: string | null;
  sourceUrl: string | null;
  sourceMetadata: Record<string, unknown>;
  displayAt: UtcIsoString;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
  author: {
    id: number;
    username: string;
    profileStudentId: string | null;
  } | null;
  liked: boolean;
  likeCount: number;
  comments: NestedCommunityComment[];
};

export const communityPostsTable = sqliteTable("community_posts", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  postType: text().notNull().$type<CommunityPostType>(),
  origin: text().notNull().$type<CommunityPostOrigin>().default("user"),
  title: text(),
  visibility: text().notNull().$type<CommunityVisibility>(),
  pinned: int().notNull().default(0),
  subjectStudentUid: text(),
  subjectContentUid: text(),
  subjectRaidType: text(),
  subjectSeasonIndex: int(),
  blocks: text().notNull(),
  sourceType: text(),
  sourceUid: text(),
  sourceId: int(),
  sourceName: text(),
  sourceUrl: text(),
  sourceMetadata: text().notNull().default("{}"),
  displayAt: text(),
  migratedAt: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export const communityCommentsTable = sqliteTable("community_comments", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  postUid: text().notNull(),
  userId: int().notNull(),
  parentUid: text().notNull(),
  body: text().notNull(),
  visibility: text().notNull().$type<CommunityCommentVisibility>().default("public"),
  sourceType: text(),
  sourceUid: text(),
  sourceId: int(),
  migratedAt: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export const communityPostLikesTable = sqliteTable("community_post_likes", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  postUid: text().notNull(),
  userId: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
});

export const communityPostTagsTable = sqliteTable("community_post_tags", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  postUid: text().notNull(),
  studentUid: text().notNull(),
  tagValue: text().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
});

type CommunityPostRow = {
  id: number;
  uid: string;
  userId: number;
  postType: CommunityPostType;
  origin: CommunityPostOrigin;
  title: string | null;
  visibility: CommunityVisibility;
  pinned: number;
  subjectStudentUid: string | null;
  subjectContentUid: string | null;
  subjectRaidType: string | null;
  subjectSeasonIndex: number | null;
  blocks: string;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceMetadata: string;
  displayAt: string | null;
  createdAt: string;
  updatedAt: string;
  username: string | null;
  profileStudentId: string | null;
};

type CommunityCommentRow = {
  id: number;
  uid: string;
  postUid: string;
  userId: number;
  parentUid: string;
  body: string;
  visibility: CommunityCommentVisibility;
  createdAt: string;
  username: string;
  profileStudentId: string | null;
};

export function serializeCommunityPostBlocks(blocks: CommunityPostBlock[]): string {
  return JSON.stringify(blocks);
}

export function parseCommunityPostBlocks(value: string): CommunityPostBlock[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as CommunityPostBlock[]) : [];
  } catch {
    return [];
  }
}

function parseCommunityPostSourceMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createPlaintextCommunityPostBlocks(textValue: string | null | undefined): CommunityPostBlock[] {
  if (!textValue || textValue.trim().length === 0) {
    return [];
  }

  return [{ type: "plaintext", text: textValue.trim() }];
}

export function getPrimaryPlaintextBlockText(blocks: CommunityPostBlock[]): string | null {
  for (const block of blocks) {
    if (block.type === "plaintext" || block.type === "markdown") {
      return block.text;
    }
  }

  return null;
}

export function normalizeCommunityTimestamp(value: string): UtcIsoString {
  return normalizeUtcTimestamp(value);
}

function communityPostVisibilityFilter(
  currentUserId?: number | null,
  {
    includeOwnHidden = true,
    includeUnlistedFromOthers = false,
  }: { includeOwnHidden?: boolean; includeUnlistedFromOthers?: boolean } = {},
): SQLWrapper {
  const publicCondition = eq(communityPostsTable.visibility, "public");
  const visibleConditions: SQLWrapper[] = [publicCondition];

  if (includeUnlistedFromOthers) {
    visibleConditions.push(eq(communityPostsTable.visibility, "unlisted"));
  }

  if (includeOwnHidden && currentUserId) {
    visibleConditions.push(eq(communityPostsTable.userId, currentUserId));
  }

  if (visibleConditions.length === 1) {
    return publicCondition;
  }

  return or(...visibleConditions) ?? publicCondition;
}

function communityCommentVisibilityFilter(currentUserId?: number | null): SQLWrapper {
  const publicCondition = eq(communityCommentsTable.visibility, "public");
  if (!currentUserId) {
    return publicCondition;
  }

  return or(publicCondition, eq(communityCommentsTable.userId, currentUserId)) ?? publicCondition;
}

function toNestedCommunityComment(
  comment: CommunityCommentRow,
  currentUserId?: number | null,
  subcomments?: NestedCommunityComment[],
): NestedCommunityComment {
  return {
    uid: comment.uid,
    body: comment.body,
    visibility: comment.visibility,
    createdAt: normalizeCommunityTimestamp(comment.createdAt),
    sensei: {
      me: comment.userId === currentUserId,
      username: comment.username,
      profileStudentId: comment.profileStudentId,
    },
    subcomments,
  };
}

export async function getCommunityLikeCountsByPostUids(env: Env, postUids: string[]): Promise<Record<string, number>> {
  if (postUids.length === 0) {
    return {};
  }

  const db = drizzle(env.DB);
  const rows = await db
    .select({
      postUid: communityPostLikesTable.postUid,
      count: sql<number>`count(*)`,
    })
    .from(communityPostLikesTable)
    .where(inArray(communityPostLikesTable.postUid, postUids))
    .groupBy(communityPostLikesTable.postUid);

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.postUid] = Number(row.count);
    return acc;
  }, {});
}

export async function getLikedCommunityPostUids(env: Env, userId: number, postUids: string[]): Promise<Set<string>> {
  if (postUids.length === 0) {
    return new Set();
  }

  const db = drizzle(env.DB);
  const rows = await db
    .select({ postUid: communityPostLikesTable.postUid })
    .from(communityPostLikesTable)
    .where(and(eq(communityPostLikesTable.userId, userId), inArray(communityPostLikesTable.postUid, postUids)));

  return new Set(rows.map((row) => row.postUid));
}

export async function getNestedCommunityCommentsByPostUids(
  env: Env,
  postUids: string[],
  currentUserId?: number | null,
): Promise<Record<string, NestedCommunityComment[]>> {
  if (postUids.length === 0) {
    return {};
  }

  const db = drizzle(env.DB);
  const rows = await db
    .select({
      id: communityCommentsTable.id,
      uid: communityCommentsTable.uid,
      postUid: communityCommentsTable.postUid,
      userId: communityCommentsTable.userId,
      parentUid: communityCommentsTable.parentUid,
      body: communityCommentsTable.body,
      visibility: communityCommentsTable.visibility,
      createdAt: communityCommentsTable.createdAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityCommentsTable)
    .innerJoin(senseisTable, eq(communityCommentsTable.userId, senseisTable.id))
    .where(and(inArray(communityCommentsTable.postUid, postUids), communityCommentVisibilityFilter(currentUserId)))
    .orderBy(sql`unixepoch(${communityCommentsTable.createdAt})`, communityCommentsTable.id);

  const result = postUids.reduce<Record<string, NestedCommunityComment[]>>((acc, postUid) => {
    acc[postUid] = [];
    return acc;
  }, {});

  const commentsByPost = rows.reduce<Record<string, CommunityCommentRow[]>>((acc, row) => {
    acc[row.postUid] = [...(acc[row.postUid] ?? []), row];
    return acc;
  }, {});

  for (const postUid of postUids) {
    const comments = commentsByPost[postUid] ?? [];
    const topLevelComments = comments.filter((comment) => comment.parentUid === postUid);
    const subcomments = comments.filter((comment) => comment.parentUid !== postUid);

    result[postUid] = topLevelComments.map((comment) =>
      toNestedCommunityComment(
        comment,
        currentUserId,
        subcomments
          .filter((subcomment) => subcomment.parentUid === comment.uid)
          .map((subcomment) => toNestedCommunityComment(subcomment, currentUserId)),
      ),
    );
  }

  return result;
}

export async function getNestedCommunityComments(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
): Promise<NestedCommunityComment[]> {
  return (await getNestedCommunityCommentsByPostUids(env, [postUid], currentUserId))[postUid] ?? [];
}

export type CommunityFeedPageOptions = {
  currentUserId?: number | null;
  page?: number;
  pageSize?: number;
  postType?: CommunityPostType;
  postTypes?: CommunityPostType[];
  authorUserId?: number;
  youtubeChannelKey?: "jp" | "kr";
  includeEngagement?: boolean;
  /** Lets the cached-feed path background-refresh via `ctx.waitUntil` instead of firing-and-forgetting past the response. */
  ctx?: ExecutionContext;
};

export type CommunityFeedPageResult = {
  items: CommunityFeedPost[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

/** Cache version for the anonymous community feed; bump to invalidate stored entries. */
const COMMUNITY_FEED_CACHE_VERSION = "v1";

/**
 * Freshness window for the cached anonymous community feed. Within this window a
 * request gets the cached page as-is. Past it, the cache is served stale
 * (bounded by COMMUNITY_FEED_CACHE_MAX_STALE_TTL) while a single background
 * request refreshes it, so no request ever blocks on regeneration and a new
 * public post still surfaces within roughly this window. Signed-in users bypass
 * this cache, so a poster always sees their own post immediately.
 */
const COMMUNITY_FEED_CACHE_FRESH_TTL = 12;
/** Safety net so low-traffic filter combinations don't serve arbitrarily old data between visits. */
const COMMUNITY_FEED_CACHE_MAX_STALE_TTL = 3 * 60;
const COMMUNITY_FEED_SLOW_WARN_MS = 1000;

export async function getCommunityFeedPage(
  env: Env,
  options: CommunityFeedPageOptions = {},
): Promise<CommunityFeedPageResult> {
  const page = Math.max(1, options.page ?? 1);

  // Cache only anonymous, first-page results. Anonymous keeps the query
  // non-personalized (public visibility, empty liked state) so the result is
  // shared across users. Restricting to page 1 avoids OFFSET pagination drift:
  // deeper pages stay uncached, so adjacent pages never come from snapshots taken
  // up to a full TTL apart. Page 1 carries nearly all feed traffic anyway.
  if (options.currentUserId || page > 1) {
    return loadCommunityFeedPage(env, options);
  }

  const { postType, postTypes, authorUserId, youtubeChannelKey, includeEngagement = true } = options;
  const types = postTypes && postTypes.length > 0 ? [...postTypes].sort() : postType ? [postType] : [];
  const feedCacheKey = cacheKey(
    "cache",
    "community-feed",
    Number(COMMUNITY_FEED_CACHE_VERSION.replace("v", "")),
    cacheQuery({
      author: authorUserId ?? "",
      eng: includeEngagement ? 1 : 0,
      size: Math.max(1, options.pageSize ?? 20),
      types: types.join(","),
      yt: youtubeChannelKey ?? "",
    }),
  );

  return fetchCached(
    env,
    feedCacheKey,
    () => loadCommunityFeedPage(env, options),
    COMMUNITY_FEED_CACHE_FRESH_TTL,
    false,
    {
      ctx: options.ctx,
      maxStaleTtl: COMMUNITY_FEED_CACHE_MAX_STALE_TTL,
      mode: "route",
      swr: true,
    },
  );
}

async function loadCommunityFeedPage(
  env: Env,
  {
    currentUserId,
    page = 1,
    pageSize = 20,
    postType,
    postTypes,
    authorUserId,
    youtubeChannelKey,
    includeEngagement = true,
  }: CommunityFeedPageOptions = {},
): Promise<CommunityFeedPageResult> {
  const db = drizzle(env.DB);
  const filters: SQLWrapper[] = [communityPostVisibilityFilter(currentUserId)];

  if (postTypes && postTypes.length > 0) {
    filters.push(inArray(communityPostsTable.postType, postTypes));
  } else if (postType) {
    filters.push(eq(communityPostsTable.postType, postType));
  }

  if (authorUserId) {
    filters.push(eq(communityPostsTable.userId, authorUserId));
  }

  if (youtubeChannelKey) {
    filters.push(sql`(
      ${communityPostsTable.postType} <> 'youtube_video'
      or json_extract(${communityPostsTable.sourceMetadata}, '$.channelKey') = ${youtubeChannelKey}
    )`);
  }

  const where = and(...filters);
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const traceContext = {
    label: "community.feed",
    currentUser: Boolean(currentUserId),
    postTypes: postTypes?.join(",") ?? postType ?? "",
    authorUserId,
    youtubeChannelKey,
    includeEngagement,
    page: safePage,
    pageSize: safePageSize,
  };

  const [{ count }] = await watchIo(
    "community.feed.count",
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(communityPostsTable).where(where)),
    traceContext,
    COMMUNITY_FEED_SLOW_WARN_MS,
  );

  const totalCount = Number(count);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const rows = await watchIo(
    "community.feed.rows",
    Promise.resolve(
      db
        .select({
          id: communityPostsTable.id,
          uid: communityPostsTable.uid,
          userId: communityPostsTable.userId,
          postType: communityPostsTable.postType,
          origin: communityPostsTable.origin,
          title: communityPostsTable.title,
          visibility: communityPostsTable.visibility,
          pinned: communityPostsTable.pinned,
          subjectStudentUid: communityPostsTable.subjectStudentUid,
          subjectContentUid: communityPostsTable.subjectContentUid,
          subjectRaidType: communityPostsTable.subjectRaidType,
          subjectSeasonIndex: communityPostsTable.subjectSeasonIndex,
          blocks: communityPostsTable.blocks,
          sourceName: communityPostsTable.sourceName,
          sourceUrl: communityPostsTable.sourceUrl,
          sourceMetadata: communityPostsTable.sourceMetadata,
          displayAt: communityPostsTable.displayAt,
          createdAt: communityPostsTable.createdAt,
          updatedAt: communityPostsTable.updatedAt,
          username: senseisTable.username,
          profileStudentId: senseisTable.profileStudentId,
        })
        .from(communityPostsTable)
        .leftJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
        .where(where)
        .orderBy(
          desc(sql`unixepoch(coalesce(${communityPostsTable.displayAt}, ${communityPostsTable.createdAt}))`),
          desc(communityPostsTable.id),
        )
        .limit(safePageSize)
        .offset(offset),
    ),
    traceContext,
    COMMUNITY_FEED_SLOW_WARN_MS,
  );

  const postUids = rows.map((row) => row.uid);
  const [commentsByPostUid, likeCounts, likedPostUids]: [
    Record<string, NestedCommunityComment[]>,
    Record<string, number>,
    Set<string>,
  ] = includeEngagement
    ? await watchIo(
        "community.feed.engagement",
        Promise.all([
          getNestedCommunityCommentsByPostUids(env, postUids, currentUserId),
          getCommunityLikeCountsByPostUids(env, postUids),
          currentUserId ? getLikedCommunityPostUids(env, currentUserId, postUids) : new Set<string>(),
        ]),
        traceContext,
        COMMUNITY_FEED_SLOW_WARN_MS,
      )
    : [{}, {}, new Set<string>()];

  return {
    items: rows.map((row) => ({
      uid: row.uid,
      postType: row.postType,
      origin: row.origin,
      title: row.title,
      visibility: row.visibility,
      pinned: row.pinned === 1,
      subjectStudentUid: row.subjectStudentUid,
      subjectContentUid: row.subjectContentUid,
      subjectRaidType: row.subjectRaidType,
      subjectSeasonIndex: row.subjectSeasonIndex,
      blocks: parseCommunityPostBlocks(row.blocks),
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      sourceMetadata: parseCommunityPostSourceMetadata(row.sourceMetadata),
      displayAt: normalizeCommunityTimestamp(row.displayAt ?? row.createdAt),
      createdAt: normalizeCommunityTimestamp(row.createdAt),
      updatedAt: normalizeCommunityTimestamp(row.updatedAt),
      author: row.username
        ? {
            id: row.userId,
            username: row.username,
            profileStudentId: row.profileStudentId,
          }
        : null,
      liked: likedPostUids.has(row.uid),
      likeCount: likeCounts[row.uid] ?? 0,
      comments: commentsByPostUid[row.uid] ?? [],
    })),
    page: currentPage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
  };
}

export async function getCommunityPostByUid(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
): Promise<CommunityFeedPost | null> {
  const db = drizzle(env.DB);
  const row = await db
    .select({
      id: communityPostsTable.id,
      uid: communityPostsTable.uid,
      userId: communityPostsTable.userId,
      postType: communityPostsTable.postType,
      origin: communityPostsTable.origin,
      title: communityPostsTable.title,
      visibility: communityPostsTable.visibility,
      pinned: communityPostsTable.pinned,
      subjectStudentUid: communityPostsTable.subjectStudentUid,
      subjectContentUid: communityPostsTable.subjectContentUid,
      subjectRaidType: communityPostsTable.subjectRaidType,
      subjectSeasonIndex: communityPostsTable.subjectSeasonIndex,
      blocks: communityPostsTable.blocks,
      sourceName: communityPostsTable.sourceName,
      sourceUrl: communityPostsTable.sourceUrl,
      sourceMetadata: communityPostsTable.sourceMetadata,
      displayAt: communityPostsTable.displayAt,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityPostsTable)
    .leftJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(and(eq(communityPostsTable.uid, postUid), communityPostVisibilityFilter(currentUserId)))
    .get();

  if (!row) {
    return null;
  }

  const [comments, likeCounts, likedPostUids] = await Promise.all([
    getNestedCommunityComments(env, postUid, currentUserId),
    getCommunityLikeCountsByPostUids(env, [postUid]),
    currentUserId ? getLikedCommunityPostUids(env, currentUserId, [postUid]) : new Set<string>(),
  ]);

  return {
    uid: row.uid,
    postType: row.postType,
    origin: row.origin,
    title: row.title,
    visibility: row.visibility,
    pinned: row.pinned === 1,
    subjectStudentUid: row.subjectStudentUid,
    subjectContentUid: row.subjectContentUid,
    subjectRaidType: row.subjectRaidType,
    subjectSeasonIndex: row.subjectSeasonIndex,
    blocks: parseCommunityPostBlocks(row.blocks),
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    sourceMetadata: parseCommunityPostSourceMetadata(row.sourceMetadata),
    displayAt: normalizeCommunityTimestamp(row.displayAt ?? row.createdAt),
    createdAt: normalizeCommunityTimestamp(row.createdAt),
    updatedAt: normalizeCommunityTimestamp(row.updatedAt),
    author: row.username
      ? {
          id: row.userId,
          username: row.username,
          profileStudentId: row.profileStudentId,
        }
      : null,
    liked: likedPostUids.has(postUid),
    likeCount: likeCounts[postUid] ?? 0,
    comments,
  };
}

export async function createCommunityComment(
  env: Env,
  userId: number,
  postUid: string,
  body: string,
  visibility: CommunityCommentVisibility = "public",
  parentUid?: string | null,
): Promise<string> {
  const db = drizzle(env.DB);
  const targetParentUid = parentUid ?? postUid;
  const post = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.uid, postUid), communityPostVisibilityFilter(userId)))
    .get();

  if (!post) {
    throw new Error("Post not found");
  }

  if (targetParentUid !== postUid) {
    const parentComment = await db
      .select({
        uid: communityCommentsTable.uid,
        postUid: communityCommentsTable.postUid,
        parentUid: communityCommentsTable.parentUid,
      })
      .from(communityCommentsTable)
      .where(and(eq(communityCommentsTable.uid, targetParentUid), communityCommentVisibilityFilter(userId)))
      .get();

    if (!parentComment || parentComment.postUid !== postUid) {
      throw new Error("Parent comment not found");
    }

    if (parentComment.parentUid !== postUid) {
      throw new Error("Cannot reply to a subcomment");
    }
  }

  const uid = nanoid(8);
  const now = nowUtcIso();
  await db.insert(communityCommentsTable).values({
    uid,
    postUid,
    userId,
    parentUid: targetParentUid,
    body,
    visibility,
    createdAt: now,
    updatedAt: now,
  });

  return uid;
}

export async function updateCommunityComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: CommunityCommentVisibility,
): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .update(communityCommentsTable)
    .set({ body, visibility, updatedAt: nowUtcIso() })
    .where(and(eq(communityCommentsTable.uid, commentUid), eq(communityCommentsTable.userId, userId)));
}

export async function deleteCommunityComment(env: Env, userId: number, commentUid: string): Promise<void> {
  const db = drizzle(env.DB);
  const targetComment = await db
    .select({
      uid: communityCommentsTable.uid,
      postUid: communityCommentsTable.postUid,
      parentUid: communityCommentsTable.parentUid,
    })
    .from(communityCommentsTable)
    .where(and(eq(communityCommentsTable.uid, commentUid), eq(communityCommentsTable.userId, userId)))
    .get();

  if (!targetComment) {
    return;
  }

  if (targetComment.parentUid === targetComment.postUid) {
    await db
      .delete(communityCommentsTable)
      .where(or(eq(communityCommentsTable.uid, commentUid), eq(communityCommentsTable.parentUid, commentUid)));
    return;
  }

  await db.delete(communityCommentsTable).where(eq(communityCommentsTable.uid, commentUid));
}

export async function setCommunityPostLike(env: Env, userId: number, postUid: string, liked: boolean): Promise<void> {
  const db = drizzle(env.DB);
  const post = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.uid, postUid), communityPostVisibilityFilter(userId)))
    .get();

  if (!post) {
    return;
  }

  if (liked) {
    await db
      .insert(communityPostLikesTable)
      .values({
        uid: nanoid(8),
        postUid,
        userId,
        createdAt: nowUtcIso(),
      })
      .onConflictDoNothing();
    return;
  }

  await db
    .delete(communityPostLikesTable)
    .where(and(eq(communityPostLikesTable.postUid, postUid), eq(communityPostLikesTable.userId, userId)));
}

export type YoutubeVideoCommunityPostInput = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  isShorts: boolean;
  channelKey: "jp" | "kr";
  channelName: string;
  channelUrl: string;
};

export async function upsertYoutubeVideoCommunityPost(env: Env, video: YoutubeVideoCommunityPostInput): Promise<void> {
  const db = drizzle(env.DB);
  const now = nowUtcIso();
  const metadata = JSON.stringify({
    channelKey: video.channelKey,
    thumbnailUrl: video.thumbnailUrl,
    isShorts: video.isShorts,
  });
  const blocks = serializeCommunityPostBlocks([{ type: "youtube", youtubeId: video.id }]);
  const existing = await db
    .select({ id: communityPostsTable.id })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.sourceType, "youtube"), eq(communityPostsTable.sourceUid, video.id)))
    .get();
  const values = {
    userId: 0,
    postType: "youtube_video" as const,
    origin: "curated" as const,
    title: video.title,
    visibility: "public" as const,
    pinned: 0,
    blocks,
    sourceType: "youtube",
    sourceUid: video.id,
    sourceName: video.channelName,
    sourceUrl: video.url,
    sourceMetadata: metadata,
    displayAt: video.publishedAt,
  };

  if (existing) {
    await db.update(communityPostsTable).set(values).where(eq(communityPostsTable.id, existing.id));
    return;
  }

  await db.insert(communityPostsTable).values({
    ...values,
    uid: `youtube-${video.id}`,
    createdAt: video.publishedAt,
    updatedAt: now,
  });
}

export async function createRecruitmentResultCommunityPost(
  env: Env,
  {
    userId,
    recruitmentResultUid,
    body,
    subjectContentUid,
    subjectStudentUid,
  }: {
    userId: number;
    recruitmentResultUid: string;
    body: string;
    subjectContentUid: string;
    subjectStudentUid?: string | null;
  },
): Promise<string> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);
  const now = nowUtcIso();
  await db.insert(communityPostsTable).values({
    uid,
    userId,
    postType: "recruitment_result",
    origin: "user",
    title: null,
    visibility: "public",
    pinned: 0,
    subjectStudentUid: subjectStudentUid ?? null,
    subjectContentUid,
    blocks: serializeCommunityPostBlocks(createPlaintextCommunityPostBlocks(body)),
    sourceType: "recruitment_result",
    sourceUid: recruitmentResultUid,
    displayAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return uid;
}

export async function upsertRecruitmentResultCommunityPost(
  env: Env,
  {
    postUid,
    userId,
    recruitmentResultUid,
    body,
    subjectContentUid,
    subjectStudentUid,
  }: {
    postUid: string;
    userId: number;
    recruitmentResultUid: string;
    body: string;
    subjectContentUid: string;
    subjectStudentUid?: string | null;
  },
): Promise<string> {
  const db = drizzle(env.DB);
  const now = nowUtcIso();
  const values = {
    userId,
    postType: "recruitment_result" as const,
    origin: "user" as const,
    title: null,
    visibility: "public" as const,
    pinned: 0,
    subjectStudentUid: subjectStudentUid ?? null,
    subjectContentUid,
    blocks: serializeCommunityPostBlocks(createPlaintextCommunityPostBlocks(body)),
    sourceType: "recruitment_result",
    sourceUid: recruitmentResultUid,
    updatedAt: now,
  };

  const existing = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.uid, postUid), eq(communityPostsTable.userId, userId)))
    .get();

  if (existing) {
    await db.update(communityPostsTable).set(values).where(eq(communityPostsTable.uid, postUid));
    return postUid;
  }

  return createRecruitmentResultCommunityPost(env, {
    userId,
    recruitmentResultUid,
    body,
    subjectContentUid,
    subjectStudentUid,
  });
}

export async function deleteCommunityPostByUid(env: Env, postUid: string, userId?: number): Promise<void> {
  const db = drizzle(env.DB);
  const conditions: SQLWrapper[] = [eq(communityPostsTable.uid, postUid)];

  if (userId !== undefined) {
    conditions.push(eq(communityPostsTable.userId, userId));
  }

  const post = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(and(...conditions))
    .get();

  if (!post) {
    return;
  }

  await db.delete(communityCommentsTable).where(eq(communityCommentsTable.postUid, postUid));
  await db.delete(communityPostLikesTable).where(eq(communityPostLikesTable.postUid, postUid));
  await db.delete(communityPostTagsTable).where(eq(communityPostTagsTable.postUid, postUid));
  await db.delete(communityPostsTable).where(eq(communityPostsTable.uid, postUid));
}
