import { and, eq, inArray, or, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid/non-secure";
import { type ConcurrencyGate, mapWithConcurrencyLimit } from "~/lib/concurrency";
import { nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import {
  communityCommentsTable,
  communityPostsTable,
  createCommunityComment,
  deleteCommunityComment,
  deleteCommunityPostByUid,
  getPrimaryPlaintextBlockText,
  normalizeCommunityTimestamp,
  parseCommunityPostBlocks,
  serializeCommunityPostBlocks,
} from "./community";
import { senseiProfileVisibilityFilter, senseisTable } from "./sensei";

type ContentCommentVisibility = "private" | "public";
const IN_QUERY_BATCH_SIZE = 90;
const COMMENT_SUMMARY_QUERY_CONCURRENCY = 4;

type ContentComment = {
  id: number;
  uid: string;
  contentId: string;
  body: string;
  visibility: ContentCommentVisibility;
  parentCommentId?: number | null;
  pinned: boolean;
  createdAt: UtcIsoString;
};

type ContentCommentWithSensei = ContentComment & {
  sensei: {
    username: string;
    profileStudentId: string | null;
  };
};

export type ContentCommentSummary = {
  count: number;
  hasRecentComment: boolean;
  pinnedPreviewBody: string | null;
};

export const contentComments = communityPostsTable;

function splitIntoBatches<T>(values: T[], batchSize = IN_QUERY_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < values.length; start += batchSize) {
    batches.push(values.slice(start, start + batchSize));
  }
  return batches;
}

function toContentCommentFromPost(row: {
  id: number;
  uid: string;
  subjectContentUid: string | null;
  blocks: string;
  visibility: "public" | "private" | "unlisted";
  pinned: number;
  createdAt: string;
}): ContentComment {
  return {
    id: row.id,
    uid: row.uid,
    contentId: row.subjectContentUid ?? "",
    body: getPrimaryPlaintextBlockText(parseCommunityPostBlocks(row.blocks)) ?? "",
    visibility: row.visibility === "private" ? "private" : "public",
    parentCommentId: null,
    pinned: row.pinned === 1,
    createdAt: normalizeCommunityTimestamp(row.createdAt),
  };
}

function visibilityFilter(userId?: number): SQLWrapper {
  const publicCondition = eq(communityPostsTable.visibility, "public");
  if (!userId) {
    return publicCondition;
  }

  return or(publicCondition, eq(communityPostsTable.userId, userId)) ?? publicCondition;
}

function commentVisibilityFilter(userId?: number): SQLWrapper {
  const publicCondition = eq(communityCommentsTable.visibility, "public");
  if (!userId) {
    return publicCondition;
  }

  return (
    or(
      publicCondition,
      and(eq(communityCommentsTable.visibility, "private"), eq(communityCommentsTable.userId, userId)),
    ) ?? publicCondition
  );
}

function postAuthorProfileVisibilityFilter(userId?: number): SQLWrapper {
  return senseiProfileVisibilityFilter(userId, communityPostsTable.userId);
}

function commentAuthorProfileVisibilityFilter(userId?: number): SQLWrapper {
  return senseiProfileVisibilityFilter(userId, communityCommentsTable.userId);
}

export async function getUserComments(env: Env, userId: number): Promise<ContentComment[]> {
  const db = drizzle(env.DB);
  const rows = await db
    .select({
      id: communityPostsTable.id,
      uid: communityPostsTable.uid,
      subjectContentUid: communityPostsTable.subjectContentUid,
      blocks: communityPostsTable.blocks,
      visibility: communityPostsTable.visibility,
      pinned: communityPostsTable.pinned,
      createdAt: communityPostsTable.createdAt,
    })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.userId, userId), eq(communityPostsTable.postType, "event_opinion")));

  return rows.map((row) => toContentCommentFromPost(row));
}

export async function getContentComments(
  env: Env,
  contentId: string,
  userId?: number,
): Promise<ContentCommentWithSensei[]> {
  return (await getContentsComments(env, [contentId], userId))[contentId] ?? [];
}

export async function getContentsComments(
  env: Env,
  contentIds: string[],
  userId?: number,
): Promise<Record<string, ContentCommentWithSensei[]>> {
  if (contentIds.length === 0) {
    return {};
  }

  const db = drizzle(env.DB);
  const uniqueContentIds = [...new Set(contentIds)];
  const postBatches = splitIntoBatches(uniqueContentIds);
  const postBatchResults = await Promise.all(
    postBatches.map((batch) =>
      db
        .select({
          id: communityPostsTable.id,
          uid: communityPostsTable.uid,
          subjectContentUid: communityPostsTable.subjectContentUid,
          blocks: communityPostsTable.blocks,
          visibility: communityPostsTable.visibility,
          pinned: communityPostsTable.pinned,
          createdAt: communityPostsTable.createdAt,
          username: senseisTable.username,
          profileStudentId: senseisTable.profileStudentId,
        })
        .from(communityPostsTable)
        .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
        .where(
          and(
            eq(communityPostsTable.postType, "event_opinion"),
            inArray(communityPostsTable.subjectContentUid, batch),
            visibilityFilter(userId),
            postAuthorProfileVisibilityFilter(userId),
          ),
        ),
    ),
  );
  const posts = postBatchResults.flat();

  const result = uniqueContentIds.reduce<Record<string, ContentCommentWithSensei[]>>((acc, contentUid) => {
    acc[contentUid] = [];
    return acc;
  }, {});

  const postMap = new Map(
    posts.map((post) => [
      post.uid,
      {
        id: post.id,
        contentId: post.subjectContentUid ?? "",
      },
    ]),
  );

  for (const post of posts) {
    const contentUid = post.subjectContentUid ?? "";
    result[contentUid] = [
      ...(result[contentUid] ?? []),
      {
        ...toContentCommentFromPost(post),
        sensei: {
          username: post.username,
          profileStudentId: post.profileStudentId,
        },
      },
    ];
  }

  const comments =
    posts.length === 0
      ? []
      : (
          await Promise.all(
            splitIntoBatches(posts.map((post) => post.uid)).map((batch) =>
              db
                .select({
                  id: communityCommentsTable.id,
                  uid: communityCommentsTable.uid,
                  postUid: communityCommentsTable.postUid,
                  parentUid: communityCommentsTable.parentUid,
                  body: communityCommentsTable.body,
                  visibility: communityCommentsTable.visibility,
                  createdAt: communityCommentsTable.createdAt,
                  username: senseisTable.username,
                  profileStudentId: senseisTable.profileStudentId,
                })
                .from(communityCommentsTable)
                .innerJoin(senseisTable, eq(communityCommentsTable.userId, senseisTable.id))
                .where(
                  and(
                    inArray(communityCommentsTable.postUid, batch),
                    commentVisibilityFilter(userId),
                    commentAuthorProfileVisibilityFilter(userId),
                  ),
                ),
            ),
          )
        ).flat();

  for (const comment of comments) {
    const post = postMap.get(comment.postUid);
    if (!post) {
      continue;
    }

    result[post.contentId] = [
      ...(result[post.contentId] ?? []),
      {
        id: comment.id,
        uid: comment.uid,
        contentId: post.contentId,
        body: comment.body,
        visibility: comment.visibility,
        parentCommentId: post.id,
        pinned: false,
        createdAt: normalizeCommunityTimestamp(comment.createdAt),
        sensei: {
          username: comment.username,
          profileStudentId: comment.profileStudentId,
        },
      },
    ];
  }

  return result;
}

export async function getContentsCommentSummaries(
  env: Env,
  contentIds: string[],
  userId?: number,
  concurrencyGate?: ConcurrencyGate,
): Promise<Record<string, ContentCommentSummary>> {
  if (contentIds.length === 0) {
    return {};
  }

  const db = drizzle(env.DB);
  const runQuery: ConcurrencyGate = concurrencyGate ?? ((task) => task());
  const uniqueContentIds = [...new Set(contentIds)];
  const result = uniqueContentIds.reduce<Record<string, ContentCommentSummary>>((acc, contentUid) => {
    acc[contentUid] = {
      count: 0,
      hasRecentComment: false,
      pinnedPreviewBody: null,
    };
    return acc;
  }, {});
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const isRecent = (createdAt: string) => new Date(normalizeCommunityTimestamp(createdAt)) >= threeDaysAgo;

  const posts = (
    await mapWithConcurrencyLimit(splitIntoBatches(uniqueContentIds), COMMENT_SUMMARY_QUERY_CONCURRENCY, (batch) =>
      runQuery(() =>
        db
          .select({
            id: communityPostsTable.id,
            uid: communityPostsTable.uid,
            userId: communityPostsTable.userId,
            subjectContentUid: communityPostsTable.subjectContentUid,
            pinned: communityPostsTable.pinned,
            createdAt: communityPostsTable.createdAt,
          })
          .from(communityPostsTable)
          .where(
            and(
              eq(communityPostsTable.postType, "event_opinion"),
              inArray(communityPostsTable.subjectContentUid, batch),
              visibilityFilter(userId),
            ),
          ),
      ),
    )
  ).flat();

  // Keep phases sequential so signed-in post and pinned-preview batches share
  // one effective concurrency ceiling instead of creating independent pools.
  const pinnedPosts: { subjectContentUid: string | null; blocks: string }[] = userId
    ? (
        await mapWithConcurrencyLimit(splitIntoBatches(uniqueContentIds), COMMENT_SUMMARY_QUERY_CONCURRENCY, (batch) =>
          runQuery(() =>
            db
              .select({
                subjectContentUid: communityPostsTable.subjectContentUid,
                blocks: communityPostsTable.blocks,
              })
              .from(communityPostsTable)
              .where(
                and(
                  eq(communityPostsTable.userId, userId),
                  eq(communityPostsTable.postType, "event_opinion"),
                  eq(communityPostsTable.pinned, 1),
                  inArray(communityPostsTable.subjectContentUid, batch),
                  visibilityFilter(userId),
                ),
              ),
          ),
        )
      ).flat()
    : [];
  const postMap = new Map(
    posts.map((post) => [
      post.uid,
      {
        contentId: post.subjectContentUid ?? "",
      },
    ]),
  );

  for (const post of posts) {
    const contentUid = post.subjectContentUid ?? "";
    const summary = result[contentUid];
    if (!summary) {
      continue;
    }
    summary.count += 1;
    summary.hasRecentComment = summary.hasRecentComment || isRecent(post.createdAt);
  }

  const comments =
    posts.length === 0
      ? []
      : (
          await mapWithConcurrencyLimit(
            splitIntoBatches(posts.map((post) => post.uid)),
            COMMENT_SUMMARY_QUERY_CONCURRENCY,
            (batch) =>
              runQuery(() =>
                db
                  .select({
                    postUid: communityCommentsTable.postUid,
                    createdAt: communityCommentsTable.createdAt,
                  })
                  .from(communityCommentsTable)
                  .where(and(inArray(communityCommentsTable.postUid, batch), commentVisibilityFilter(userId))),
              ),
          )
        ).flat();

  for (const comment of comments) {
    const post = postMap.get(comment.postUid);
    if (!post) {
      continue;
    }

    const summary = result[post.contentId];
    if (!summary) {
      continue;
    }
    summary.count += 1;
    summary.hasRecentComment = summary.hasRecentComment || isRecent(comment.createdAt);
  }

  for (const post of pinnedPosts) {
    const contentUid = post.subjectContentUid ?? "";
    const summary = result[contentUid];
    if (!summary || summary.pinnedPreviewBody !== null) {
      continue;
    }
    summary.pinnedPreviewBody = getPrimaryPlaintextBlockText(parseCommunityPostBlocks(post.blocks)) ?? null;
  }

  return result;
}

export async function createComment(
  env: Env,
  userId: number,
  contentId: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
): Promise<string> {
  const db = drizzle(env.DB);
  const existingPost = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(
      and(
        eq(communityPostsTable.userId, userId),
        eq(communityPostsTable.postType, "event_opinion"),
        eq(communityPostsTable.subjectContentUid, contentId),
      ),
    )
    .limit(1)
    .get();

  const isFirstComment = existingPost === undefined;
  const uid = nanoid(8);
  const now = nowUtcIso();
  await db.insert(communityPostsTable).values({
    uid,
    userId,
    postType: "event_opinion",
    visibility,
    pinned: isFirstComment ? 1 : 0,
    subjectContentUid: contentId,
    blocks: serializeCommunityPostBlocks([{ type: "plaintext", text: body }]),
    displayAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return uid;
}

export async function createSubcomment(
  env: Env,
  userId: number,
  contentId: string,
  parentCommentUid: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
): Promise<string> {
  const db = drizzle(env.DB);
  const parentPost = await db
    .select({
      uid: communityPostsTable.uid,
      subjectContentUid: communityPostsTable.subjectContentUid,
    })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.uid, parentCommentUid), eq(communityPostsTable.postType, "event_opinion")))
    .get();

  if (!parentPost || parentPost.subjectContentUid !== contentId) {
    throw new Error("Parent comment not found");
  }

  return createCommunityComment(env, userId, parentPost.uid, body, visibility, parentPost.uid);
}

export async function updateComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: ContentCommentVisibility,
): Promise<void> {
  const db = drizzle(env.DB);
  const post = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(
      and(
        eq(communityPostsTable.uid, commentUid),
        eq(communityPostsTable.userId, userId),
        eq(communityPostsTable.postType, "event_opinion"),
      ),
    )
    .get();

  if (post) {
    const now = nowUtcIso();
    await db
      .update(communityPostsTable)
      .set({
        visibility,
        blocks: serializeCommunityPostBlocks([{ type: "plaintext", text: body }]),
        updatedAt: now,
      })
      .where(eq(communityPostsTable.uid, commentUid));
    return;
  }

  await db
    .update(communityCommentsTable)
    .set({
      body,
      visibility,
      updatedAt: nowUtcIso(),
    })
    .where(and(eq(communityCommentsTable.uid, commentUid), eq(communityCommentsTable.userId, userId)));
}

export async function deleteComment(env: Env, userId: number, commentUid: string): Promise<void> {
  const db = drizzle(env.DB);
  const post = await db
    .select({ uid: communityPostsTable.uid })
    .from(communityPostsTable)
    .where(
      and(
        eq(communityPostsTable.uid, commentUid),
        eq(communityPostsTable.userId, userId),
        eq(communityPostsTable.postType, "event_opinion"),
      ),
    )
    .get();

  if (post) {
    await deleteCommunityPostByUid(env, commentUid, userId);
    return;
  }

  await deleteCommunityComment(env, userId, commentUid);
}

export async function getCommentIdByUid(env: Env, commentUid: string, userId?: number): Promise<number | null> {
  const db = drizzle(env.DB);
  const post = await db
    .select({ id: communityPostsTable.id })
    .from(communityPostsTable)
    .where(
      and(
        eq(communityPostsTable.uid, commentUid),
        eq(communityPostsTable.postType, "event_opinion"),
        visibilityFilter(userId),
      ),
    )
    .get();

  if (post) {
    return post.id;
  }

  const comment = await db
    .select({ id: communityCommentsTable.id })
    .from(communityCommentsTable)
    .where(and(eq(communityCommentsTable.uid, commentUid), commentVisibilityFilter(userId)))
    .get();

  return comment?.id ?? null;
}

export async function pinComment(env: Env, userId: number, contentId: string, commentUid: string): Promise<void> {
  const db = drizzle(env.DB);
  const now = nowUtcIso();
  await db
    .update(communityPostsTable)
    .set({ pinned: 0, updatedAt: now })
    .where(
      and(
        eq(communityPostsTable.userId, userId),
        eq(communityPostsTable.postType, "event_opinion"),
        eq(communityPostsTable.subjectContentUid, contentId),
        eq(communityPostsTable.pinned, 1),
      ),
    );

  const post = await db
    .select({
      uid: communityPostsTable.uid,
      subjectContentUid: communityPostsTable.subjectContentUid,
    })
    .from(communityPostsTable)
    .where(
      and(
        eq(communityPostsTable.uid, commentUid),
        eq(communityPostsTable.userId, userId),
        eq(communityPostsTable.postType, "event_opinion"),
      ),
    )
    .get();

  if (!post || post.subjectContentUid !== contentId) {
    throw new Error("Comment not found or does not belong to user");
  }

  await db
    .update(communityPostsTable)
    .set({ pinned: 1, updatedAt: nowUtcIso() })
    .where(eq(communityPostsTable.uid, commentUid));
}

export async function unpinComment(env: Env, userId: number, contentId: string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .update(communityPostsTable)
    .set({ pinned: 0, updatedAt: nowUtcIso() })
    .where(
      and(
        eq(communityPostsTable.userId, userId),
        eq(communityPostsTable.postType, "event_opinion"),
        eq(communityPostsTable.subjectContentUid, contentId),
        eq(communityPostsTable.pinned, 1),
      ),
    );
}

export async function getPinnedComment(
  env: Env,
  contentId: string,
  userId: number,
): Promise<ContentCommentWithSensei | null> {
  const db = drizzle(env.DB);
  const result = await db
    .select({
      id: communityPostsTable.id,
      uid: communityPostsTable.uid,
      subjectContentUid: communityPostsTable.subjectContentUid,
      blocks: communityPostsTable.blocks,
      visibility: communityPostsTable.visibility,
      pinned: communityPostsTable.pinned,
      createdAt: communityPostsTable.createdAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(
      and(
        eq(communityPostsTable.subjectContentUid, contentId),
        eq(communityPostsTable.userId, userId),
        eq(communityPostsTable.postType, "event_opinion"),
        eq(communityPostsTable.pinned, 1),
      ),
    )
    .get();

  if (!result) {
    return null;
  }

  return {
    ...toContentCommentFromPost(result),
    sensei: {
      username: result.username,
      profileStudentId: result.profileStudentId,
    },
  };
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

export async function getNestedContentComments(
  env: Env,
  contentUid: string,
  currentUser: { id: number; username: string } | null,
): Promise<NestedComment[]> {
  const comments = await getContentComments(env, contentUid, currentUser?.id);
  return nestComments(comments, currentUser);
}

export function nestComments(
  flatComments: ContentCommentWithSensei[],
  currentUser: { id: number; username: string } | null,
): NestedComment[] {
  const topLevelComments = flatComments.filter((comment) => !comment.parentCommentId);
  const subcomments = flatComments.filter((comment) => comment.parentCommentId);

  return topLevelComments.map((comment) => {
    const commentSubcomments = subcomments.filter((subComment) => subComment.parentCommentId === comment.id);
    return {
      uid: comment.uid,
      body: comment.body,
      visibility: comment.visibility,
      pinned: comment.pinned && comment.sensei.username === currentUser?.username,
      createdAt: normalizeCommunityTimestamp(comment.createdAt),
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
        createdAt: normalizeCommunityTimestamp(subComment.createdAt),
        sensei: {
          me: currentUser?.username === subComment.sensei.username,
          username: subComment.sensei.username,
          profileStudentId: subComment.sensei.profileStudentId,
        },
      })),
    };
  });
}
