import { and, desc, eq, inArray, or, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import { senseisTable } from "./sensei";

export type CommunityPostType = "student_review" | "event_opinion" | "guide";
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
  createdAt: string;
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
  title: string | null;
  visibility: CommunityVisibility;
  pinned: boolean;
  subjectStudentUid: string | null;
  subjectContentUid: string | null;
  subjectRaidType: string | null;
  subjectSeasonIndex: number | null;
  blocks: CommunityPostBlock[];
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    username: string;
    profileStudentId: string | null;
  };
  liked: boolean;
  likeCount: number;
  comments: NestedCommunityComment[];
};

export const communityPostsTable = sqliteTable("community_posts", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  postType: text().notNull().$type<CommunityPostType>(),
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
  title: string | null;
  visibility: CommunityVisibility;
  pinned: number;
  subjectStudentUid: string | null;
  subjectContentUid: string | null;
  subjectRaidType: string | null;
  subjectSeasonIndex: number | null;
  blocks: string;
  createdAt: string;
  updatedAt: string;
  username: string;
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
    const hiddenCondition = and(
      eq(communityPostsTable.userId, currentUserId),
      inArray(communityPostsTable.visibility, ["private", "unlisted"]),
    );
    if (hiddenCondition) {
      visibleConditions.push(hiddenCondition);
    }
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
    createdAt: comment.createdAt,
    sensei: {
      me: comment.userId === currentUserId,
      username: comment.username,
      profileStudentId: comment.profileStudentId,
    },
    subcomments,
  };
}

export async function getCommunityLikeCountsByPostUids(
  env: Env,
  postUids: string[],
): Promise<Record<string, number>> {
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

export async function getLikedCommunityPostUids(
  env: Env,
  userId: number,
  postUids: string[],
): Promise<Set<string>> {
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
    .orderBy(communityCommentsTable.createdAt);

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

export async function getCommunityFeedPage(
  env: Env,
  {
    currentUserId,
    page = 1,
    pageSize = 20,
    postType,
    postTypes,
  }: {
    currentUserId?: number | null;
    page?: number;
    pageSize?: number;
    postType?: CommunityPostType;
    postTypes?: CommunityPostType[];
  } = {},
): Promise<{
  items: CommunityFeedPost[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}> {
  const db = drizzle(env.DB);
  const filters: SQLWrapper[] = [communityPostVisibilityFilter(currentUserId)];

  if (postTypes && postTypes.length > 0) {
    filters.push(inArray(communityPostsTable.postType, postTypes));
  } else if (postType) {
    filters.push(eq(communityPostsTable.postType, postType));
  }

  const where = and(...filters);
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(communityPostsTable)
    .where(where);

  const totalCount = Number(count);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const rows = await db
    .select({
      id: communityPostsTable.id,
      uid: communityPostsTable.uid,
      userId: communityPostsTable.userId,
      postType: communityPostsTable.postType,
      title: communityPostsTable.title,
      visibility: communityPostsTable.visibility,
      pinned: communityPostsTable.pinned,
      subjectStudentUid: communityPostsTable.subjectStudentUid,
      subjectContentUid: communityPostsTable.subjectContentUid,
      subjectRaidType: communityPostsTable.subjectRaidType,
      subjectSeasonIndex: communityPostsTable.subjectSeasonIndex,
      blocks: communityPostsTable.blocks,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(where)
    .orderBy(desc(communityPostsTable.updatedAt), desc(communityPostsTable.createdAt))
    .limit(safePageSize)
    .offset(offset);

  const postUids = rows.map((row) => row.uid);
  const [commentsByPostUid, likeCounts, likedPostUids] = await Promise.all([
    getNestedCommunityCommentsByPostUids(env, postUids, currentUserId),
    getCommunityLikeCountsByPostUids(env, postUids),
    currentUserId ? getLikedCommunityPostUids(env, currentUserId, postUids) : new Set<string>(),
  ]);

  return {
    items: rows.map((row) => ({
      uid: row.uid,
      postType: row.postType,
      title: row.title,
      visibility: row.visibility,
      pinned: row.pinned === 1,
      subjectStudentUid: row.subjectStudentUid,
      subjectContentUid: row.subjectContentUid,
      subjectRaidType: row.subjectRaidType,
      subjectSeasonIndex: row.subjectSeasonIndex,
      blocks: parseCommunityPostBlocks(row.blocks),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      author: {
        id: row.userId,
        username: row.username,
        profileStudentId: row.profileStudentId,
      },
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
      title: communityPostsTable.title,
      visibility: communityPostsTable.visibility,
      pinned: communityPostsTable.pinned,
      subjectStudentUid: communityPostsTable.subjectStudentUid,
      subjectContentUid: communityPostsTable.subjectContentUid,
      subjectRaidType: communityPostsTable.subjectRaidType,
      subjectSeasonIndex: communityPostsTable.subjectSeasonIndex,
      blocks: communityPostsTable.blocks,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
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
    title: row.title,
    visibility: row.visibility,
    pinned: row.pinned === 1,
    subjectStudentUid: row.subjectStudentUid,
    subjectContentUid: row.subjectContentUid,
    subjectRaidType: row.subjectRaidType,
    subjectSeasonIndex: row.subjectSeasonIndex,
    blocks: parseCommunityPostBlocks(row.blocks),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      id: row.userId,
      username: row.username,
      profileStudentId: row.profileStudentId,
    },
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
  await db.insert(communityCommentsTable).values({
    uid,
    postUid,
    userId,
    parentUid: targetParentUid,
    body,
    visibility,
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
    .set({ body, visibility, updatedAt: sql`current_timestamp` })
    .where(and(eq(communityCommentsTable.uid, commentUid), eq(communityCommentsTable.userId, userId)));
}

export async function deleteCommunityComment(
  env: Env,
  userId: number,
  commentUid: string,
): Promise<void> {
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

  await db
    .delete(communityCommentsTable)
    .where(eq(communityCommentsTable.uid, commentUid));
}

export async function setCommunityPostLike(
  env: Env,
  userId: number,
  postUid: string,
  liked: boolean,
): Promise<void> {
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
      })
      .onConflictDoNothing();
    return;
  }

  await db
    .delete(communityPostLikesTable)
    .where(and(eq(communityPostLikesTable.postUid, postUid), eq(communityPostLikesTable.userId, userId)));
}

export async function deleteCommunityPostByUid(
  env: Env,
  postUid: string,
  userId?: number,
): Promise<void> {
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
