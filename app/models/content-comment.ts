import { and, eq, inArray, isNull, not, or, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import { senseisTable } from "./sensei";

// ============================================================
// Schema
// ============================================================

type ContentCommentVisibility = "private" | "public";

type ContentComment = {
  id: number;
  uid: string;
  contentId: string;
  body: string;
  visibility: ContentCommentVisibility;
  parentCommentId?: number | null;
  pinned: boolean;
  createdAt: string;
};

type ContentCommentWithSensei = ContentComment & {
  sensei: {
    username: string;
    profileStudentId: string | null;
  };
};

export const contentComments = sqliteTable("content_comments", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  contentId: text().notNull(),
  parentCommentId: int(),
  body: text().notNull(),
  visibility: text().notNull().default("private"),
  pinned: int().notNull().default(0),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

const SELECT_USER_COMMENTS_COLUMNS = {
  id: contentComments.id,
  uid: contentComments.uid,
  contentId: contentComments.contentId,
  body: contentComments.body,
  visibility: contentComments.visibility,
  parentCommentId: contentComments.parentCommentId,
  pinned: contentComments.pinned,
  createdAt: contentComments.createdAt,
};

const SELECT_CONTENT_COMMENTS_COLUMNS = {
  ...SELECT_USER_COMMENTS_COLUMNS,
  sensei: {
    username: senseisTable.username,
    profileStudentId: senseisTable.profileStudentId,
  },
};

function toModel<T extends { visibility: string; parentCommentId: number | null; pinned: number; createdAt: string; id: number }>(rows: T): (T & { visibility: ContentCommentVisibility; parentCommentId?: number | null; pinned: boolean }) {
  return {
    ...rows,
    visibility: rows.visibility as ContentCommentVisibility,
    pinned: rows.pinned === 1,
  };
}

function visibilityFilter(userId?: number): SQLWrapper[] {
  const filters: SQLWrapper[] = [eq(contentComments.visibility, "public")];
  if (userId) {
    filters.push(eq(contentComments.userId, userId));
  }
  return filters;
}

// ============================================================
// Queries
// ============================================================

export async function getUserComments(env: Env, userId: number): Promise<ContentComment[]> {
  const db = drizzle(env.DB);
  const results = await db.select(SELECT_USER_COMMENTS_COLUMNS)
    .from(contentComments)
    .where(eq(contentComments.userId, userId))
    .all();

  return results.map(toModel);
}

export async function getContentComments(env: Env, contentId: string, userId?: number): Promise<ContentCommentWithSensei[]> {
  return (await getContentsComments(env, [contentId], userId))[contentId] ?? [];
}

export async function getContentsComments(env: Env, contentIds: string[], userId?: number): Promise<Record<string, ContentCommentWithSensei[]>> {
  const db = drizzle(env.DB);
  const results = await db.select(SELECT_CONTENT_COMMENTS_COLUMNS)
    .from(contentComments)
    .where(and(
      not(eq(contentComments.body, "")),
      inArray(contentComments.contentId, contentIds),
      or(...visibilityFilter(userId)),
    ))
    .innerJoin(senseisTable, eq(contentComments.userId, senseisTable.id))
    .orderBy(contentComments.createdAt)
    .all();

  return results.reduce((acc, result) => {
    acc[result.contentId] = [...(acc[result.contentId] ?? []), toModel(result)];
    return acc;
  }, {} as Record<string, ContentCommentWithSensei[]>);
}

export async function createComment(env: Env, userId: number, contentId: string, body: string, visibility: ContentCommentVisibility = "private"): Promise<string> {
  const db = drizzle(env.DB);

  // Check if this is the user's first comment for this content
  const existingComment = await db.select({ id: contentComments.id })
    .from(contentComments)
    .where(and(
      eq(contentComments.userId, userId),
      eq(contentComments.contentId, contentId),
      isNull(contentComments.parentCommentId),
    ))
    .limit(1)
    .get();
  const isFirstComment = existingComment === undefined;

  const uid = nanoid(8);
  await db.insert(contentComments).values({ uid, userId, contentId, body, visibility, parentCommentId: null, pinned: isFirstComment ? 1 : 0 });
  return uid;
}

export async function createSubcomment(env: Env, userId: number, contentId: string, parentCommentId: number, body: string, visibility: ContentCommentVisibility = "private"): Promise<string> {
  const db = drizzle(env.DB);

  // Validate that parent comment exists and is a top-level comment (not a subcomment)
  const parent = await db.select({ parentCommentId: contentComments.parentCommentId })
    .from(contentComments)
    .where(eq(contentComments.id, parentCommentId))
    .get();

  if (!parent) {
    throw new Error("Parent comment not found");
  }
  if (parent.parentCommentId !== null) {
    throw new Error("Cannot reply to a subcomment (max depth is 1)");
  }

  const uid = nanoid(8);
  await db.insert(contentComments).values({ uid, userId, contentId, parentCommentId, body, visibility });
  return uid;
}

export async function updateComment(env: Env, userId: number, commentUid: string, body: string, visibility: ContentCommentVisibility): Promise<void> {
  const db = drizzle(env.DB);
  await db.update(contentComments)
    .set({ body, visibility, updatedAt: sql`current_timestamp` })
    .where(and(
      eq(contentComments.uid, commentUid),
      eq(contentComments.userId, userId),
    ));
}

export async function deleteComment(env: Env, userId: number, commentUid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.delete(contentComments)
    .where(and(
      eq(contentComments.uid, commentUid),
      eq(contentComments.userId, userId),
    ));
}

export async function getCommentIdByUid(env: Env, commentUid: string, userId?: number): Promise<number | null> {
  const db = drizzle(env.DB);
  const comment = await db.select({ id: contentComments.id })
    .from(contentComments)
    .where(and(
      eq(contentComments.uid, commentUid),
      or(...visibilityFilter(userId)),
    ))
    .get();

  return comment?.id ?? null;
}

export async function pinComment(env: Env, userId: number, contentId: string, commentUid: string): Promise<void> {
  const db = drizzle(env.DB);

  // First, unpin any existing pinned comment for this user/content
  await db.update(contentComments)
    .set({ pinned: 0, updatedAt: sql`current_timestamp` })
    .where(and(
      eq(contentComments.userId, userId),
      eq(contentComments.contentId, contentId),
      eq(contentComments.pinned, 1),
    ));

  // Then, pin the specified comment (only if it belongs to the user and is a top-level comment)
  const comment = await db.select({ id: contentComments.id, parentCommentId: contentComments.parentCommentId })
    .from(contentComments)
    .where(and(
      eq(contentComments.uid, commentUid),
      eq(contentComments.userId, userId),
      eq(contentComments.contentId, contentId),
    ))
    .get();

  if (!comment) {
    throw new Error("Comment not found or does not belong to user");
  }
  if (comment.parentCommentId !== null) {
    throw new Error("Cannot pin subcomments");
  }

  await db.update(contentComments)
    .set({ pinned: 1, updatedAt: sql`current_timestamp` })
    .where(eq(contentComments.uid, commentUid));
}

export async function unpinComment(env: Env, userId: number, contentId: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.update(contentComments)
    .set({ pinned: 0, updatedAt: sql`current_timestamp` })
    .where(and(
      eq(contentComments.userId, userId),
      eq(contentComments.contentId, contentId),
      eq(contentComments.pinned, 1),
    ));
}

export async function getPinnedComment(env: Env, contentId: string, userId: number): Promise<ContentCommentWithSensei | null> {
  const db = drizzle(env.DB);
  const result = await db.select(SELECT_CONTENT_COMMENTS_COLUMNS)
    .from(contentComments)
    .where(and(
      eq(contentComments.contentId, contentId),
      eq(contentComments.userId, userId),
      eq(contentComments.pinned, 1),
      isNull(contentComments.parentCommentId),
    ))
    .innerJoin(senseisTable, eq(contentComments.userId, senseisTable.id))
    .get();

  return result ? toModel(result) : null;
}

// ============================================================
// Nested comments
// ============================================================

export type NestedComment = {
  uid: string;
  body: string;
  visibility: "private" | "public";
  pinned: boolean;
  createdAt: string;
  sensei: {
    me: boolean;
    username: string;
    profileStudentId: string | null;
  };
  subcomments?: NestedComment[];
};

export async function getNestedContentComments(env: Env, contentUid: string, currentUser: { id: number; username: string } | null): Promise<NestedComment[]> {
  const comments = await getContentComments(env, contentUid, currentUser?.id);
  return nestComments(comments, currentUser);
}

export function nestComments(flatComments: ContentCommentWithSensei[], currentUser: { id: number; username: string } | null): NestedComment[] {
  const topLevelComments = flatComments.filter((comment) => !comment.parentCommentId);
  const subcomments = flatComments.filter((comment) => comment.parentCommentId);
  const nestedComments = topLevelComments.map((comment) => {
    const commentSubcomments = subcomments.filter((subComment) => subComment.parentCommentId === comment.id);
    return {
      uid: comment.uid,
      body: comment.body,
      visibility: comment.visibility,
      pinned: comment.pinned && comment.sensei.username === currentUser?.username,
      createdAt: comment.createdAt,
      sensei: {
        me: currentUser?.username === comment.sensei.username,
        username: comment.sensei.username,
        profileStudentId: comment.sensei.profileStudentId,
      },
      subcomments: commentSubcomments.map((subComment) => ({
        uid: subComment.uid,
        body: subComment.body,
        visibility: subComment.visibility,
        pinned: false,
        createdAt: subComment.createdAt,
        sensei: {
          me: currentUser?.username === subComment.sensei.username,
          username: subComment.sensei.username,
          profileStudentId: subComment.sensei.profileStudentId,
        },
      })),
    };
  });
  return nestedComments;
}
