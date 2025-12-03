import dayjs from "dayjs";
import { and, eq, inArray, isNull, not, or, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Env } from "~/env.server";
import { nanoid } from "nanoid/non-secure";
import { senseisTable } from "./sensei";
import { graphql } from "~/graphql";
import { FutureContentsQuery, IndexQuery } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import { getFavoritedCounts } from "./favorite-students";


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

type ContentCommentVisibility = "private" | "public";

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

export async function getUserComments(env: Env, userId: number): Promise<ContentComment[]> {
  const db = drizzle(env.DB);
  const results = await db.select(SELECT_USER_COMMENTS_COLUMNS)
    .from(contentComments)
    .where(eq(contentComments.userId, userId))
    .all()

  return results.map(toModel);
}

const SELECT_CONTENT_COMMENTS_COLUMNS = {
  ...SELECT_USER_COMMENTS_COLUMNS,
  sensei: {
    username: senseisTable.username,
    profileStudentId: senseisTable.profileStudentId,
  },
};

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

function toModel<T extends { visibility: string; parentCommentId: number | null; pinned: number; createdAt: string; id: number }>(rows: T): (T & { visibility: ContentCommentVisibility; parentCommentId?: number | null; pinned: boolean }) {
  return { 
    ...rows, 
    visibility: rows.visibility as ContentCommentVisibility,
    pinned: rows.pinned === 1,
  };
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
      eq(contentComments.userId, userId)
    ));
}

export async function deleteComment(env: Env, userId: number, commentUid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.delete(contentComments)
    .where(and(
      eq(contentComments.uid, commentUid),
      eq(contentComments.userId, userId)
    ));
}

export async function getCommentIdByUid(env: Env, commentUid: string): Promise<number | null> {
  const db = drizzle(env.DB);
  const comment = await db.select({ id: contentComments.id })
    .from(contentComments)
    .where(and(
      eq(contentComments.uid, commentUid),
      eq(contentComments.visibility, "public"),
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

  // Separate top-level comments and subcomments
  const topLevelComments = comments.filter((comment) => !comment.parentCommentId);
  const subcomments = comments.filter((comment) => comment.parentCommentId);

  // Build nested structure - match subcomments to parents by parent's database ID
  const nestedComments = topLevelComments.map((comment) => {
    const commentSubcomments = subcomments.filter((subComment) => subComment.parentCommentId === comment.id);
    return {
      uid: comment.uid,
      body: comment.body,
      visibility: comment.visibility,
      pinned: comment.pinned,
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

export function nestComments(flatComments: ContentCommentWithSensei[], currentUser: { id: number; username: string } | null): NestedComment[] {
  const topLevelComments = flatComments.filter((comment) => !comment.parentCommentId);
  const subcomments = flatComments.filter((comment) => comment.parentCommentId);
  const nestedComments = topLevelComments.map((comment) => {
    const commentSubcomments = subcomments.filter((subComment) => subComment.parentCommentId === comment.id);
    return {
      uid: comment.uid,
      body: comment.body,
      visibility: comment.visibility,
      pinned: comment.pinned,
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

function visibilityFilter(userId?: number): SQLWrapper[] {
  const filters: SQLWrapper[] = [eq(contentComments.visibility, "public")];
  if (userId) {
    filters.push(eq(contentComments.userId, userId));
  }
  return filters;
}

// Legacy exports for backward compatibility during migration
export const getUserMemos = getUserComments;
export const getContentMemos = getContentComments;
export const getContentsMemos = getContentsComments;
export async function setMemo(env: Env, userId: number, contentId: string, body: string, visibility: ContentCommentVisibility = "private"): Promise<void> {
  await createComment(env, userId, contentId, body, visibility);
}


/**
 * Index Contents
 */

const indexQuery = graphql(`
  query Index($now: ISO8601DateTime!) {
    events(untilAfter: $now, first: 20) {
      nodes {
        __typename name since until endless uid type rerun imageUrl
        pickups {
          type rerun since until
          student { uid name }
        }
      }
    }
    raids(untilAfter: $now, first: 3) {
      nodes {
        name since until uid type boss attackType terrain
        defenseTypes { defenseType difficulty }
      }
    }
  }
`);

export async function getIndexContents(env: Env, forceRefresh = false) {
  return fetchCached(env, "index-contents", async () => {
    const now = dayjs();
    const { data, error } = await runQuery<IndexQuery, { now: Date }>(indexQuery, { now: now.toDate() });
    if (error || !data) {
      throw error ?? "failed to fetch events";
    }

    // ========== Events ==========
    const mainEventTypes = ["event", "main_story", "collab", "fes", "immortal_event"];
    const mainEvents = data.events.nodes.filter((event) => mainEventTypes.includes(event.type));

    // Priority 1: Find currently ongoing events (since <= now <= until)
    const ongoingEvents = mainEvents.filter((event) => {
      const since = dayjs(event.since);
      const until = dayjs(event.until);
      return !since.isAfter(now) && until.isAfter(now);
    });

    let mainEvent = null;
    if (ongoingEvents.length > 0) {
      // If there are ongoing events, prioritize by event type order
      mainEvent = ongoingEvents.sort((a, b) => {
        const aTypeIndex = mainEventTypes.indexOf(a.type);
        const bTypeIndex = mainEventTypes.indexOf(b.type);
        return aTypeIndex - bTypeIndex;
      })[0];
    } else {
      // Priority 2: Find the nearest starting event
      const futureEvents = mainEvents.filter((event) => dayjs(event.since).isAfter(now));
      if (futureEvents.length > 0) {
        // Sort by start date, then by event type priority for same date
        mainEvent = futureEvents.sort((a, b) => {
          const aSince = dayjs(a.since);
          const bSince = dayjs(b.since);
          const dateDiff = aSince.diff(bSince, "day");
          if (dateDiff !== 0) {
            return dateDiff;
          }

          // If same date, prioritize by event type order
          const aTypeIndex = mainEventTypes.indexOf(a.type);
          const bTypeIndex = mainEventTypes.indexOf(b.type);
          return aTypeIndex - bTypeIndex;
        })[0];
      }
    }

    // ========== Pickups ==========
    const currentPickups: { eventUid: string, pickup: IndexQuery["events"]["nodes"][0]["pickups"][0] }[] = data.events.nodes
      .filter((event) => event.type !== "archive_pickup")
      .flatMap((event) => event.pickups.filter((pickup) => pickup.student !== null).map((pickup) => ({ eventUid: event.uid, pickup })))
      .filter(({ pickup }) => !dayjs(pickup.since).isAfter(now) && dayjs(pickup.until).isAfter(now));

    // Get favorite counts for all students in current pickups (not just user's favorites)
    const allStudentUids = currentPickups.map(({ pickup }) => pickup.student?.uid).filter((uid) => uid !== null) as string[];
    const favoritedCounts = (await getFavoritedCounts(env, allStudentUids)).filter((favorited) => currentPickups.some((pickup) => pickup.eventUid === favorited.contentId));

    return {
      mainEvent,
      currentRaids: data.raids.nodes,
      currentEvents: data.events.nodes.filter((event) => !dayjs(event.since).isAfter(now)),
      currentPickups,
      favoritedCounts,
    };
  }, 60 * 10, forceRefresh);
}


/**
 * Future Contents
 */
const futureContentsQuery = graphql(`
  query FutureContents($now: ISO8601DateTime!) {
    contents(untilAfter: $now, first: 9999) {
      nodes {
        __typename uid name since until confirmed
        ... on Event {
          eventType: type
          rerun endless
          shopResources { uid }
          pickups {
            type rerun since until studentName
            student { uid attackType defenseType role schaleDbId }
          }
        }
        ... on Raid {
          raidType: type
          rankVisible boss terrain attackType
          defenseTypes { defenseType difficulty }
        }
      }
    }
  }
`);

export async function getFutureContents(env: Env, forceRefresh = false): Promise<FutureContentsQuery["contents"]["nodes"]> {
  const truncatedNow = new Date();
  truncatedNow.setMinutes(0, 0, 0);

  return fetchCached(env, "future-contents", async () => {
    const { data, error } = await runQuery(futureContentsQuery, { now: truncatedNow });
    if (error || !data) {
      throw error ?? "failed to fetch events";
    }
    return data.contents.nodes;
  }, 60 * 10, forceRefresh);
}
