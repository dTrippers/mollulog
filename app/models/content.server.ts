import {
  createPostgresContentComment,
  createPostgresContentSubcomment,
  deletePostgresCommunityComment,
  deletePostgresCommunityPostByUid,
  getPostgresCommunityPostByUid,
  getPostgresContentCommentIdByUid,
  getPostgresContentCommentSummaries,
  getPostgresContentComments,
  pinPostgresContentComment,
  unpinPostgresContentComment,
  updatePostgresCommunityComment,
  upsertPostgresCommunityPost,
} from "~/db/postgres/community";
import type { ConcurrencyGate } from "~/lib/concurrency";
import { createPlaintextCommunityPostBlocks } from "./community";
import { resolveCommunitySourceMode } from "./community.server";
import type { ContentCommentSummary, ContentCommentWithSensei, NestedComment } from "./content";
import { nestComments } from "./content";
import type { ContentCommentVisibility } from "./content-comment";
import {
  createComment as createD1Comment,
  createSubcomment as createD1Subcomment,
  deleteComment as deleteD1Comment,
  getCommentIdByUid as getD1CommentIdByUid,
  getContentComments as getD1ContentComments,
  getContentsCommentSummaries as getD1ContentsCommentSummaries,
  getContentsComments as getD1ContentsComments,
  getNestedContentComments as getD1NestedContentComments,
  pinComment as pinD1Comment,
  unpinComment as unpinD1Comment,
  updateComment as updateD1Comment,
} from "./content-comment";

export type { ContentCommentSummary, ContentCommentWithSensei, NestedComment } from "./content";
export { nestComments } from "./content";

function isPostgresCommunityMode(env: Pick<Env, "COMMUNITY_SOURCE_MODE">): boolean {
  return resolveCommunitySourceMode(env.COMMUNITY_SOURCE_MODE) === "hyperdrive";
}

export async function getContentComments(
  env: Env,
  contentId: string,
  userId?: number,
): Promise<ContentCommentWithSensei[]> {
  return isPostgresCommunityMode(env)
    ? ((await getPostgresContentComments(env, [contentId], userId))[contentId] ?? [])
    : getD1ContentComments(env, contentId, userId);
}

export async function getContentsComments(
  env: Env,
  contentIds: string[],
  userId?: number,
): Promise<Record<string, ContentCommentWithSensei[]>> {
  return isPostgresCommunityMode(env)
    ? getPostgresContentComments(env, contentIds, userId)
    : getD1ContentsComments(env, contentIds, userId);
}

export async function getContentsCommentSummaries(
  env: Env,
  contentIds: string[],
  userId?: number,
  concurrencyGate?: ConcurrencyGate,
): Promise<Record<string, ContentCommentSummary>> {
  return isPostgresCommunityMode(env)
    ? getPostgresContentCommentSummaries(env, contentIds, userId)
    : getD1ContentsCommentSummaries(env, contentIds, userId, concurrencyGate);
}

export async function createComment(
  env: Env,
  userId: number,
  contentId: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
): Promise<string> {
  return isPostgresCommunityMode(env)
    ? createPostgresContentComment(env, userId, contentId, body, visibility)
    : createD1Comment(env, userId, contentId, body, visibility);
}

export async function createSubcomment(
  env: Env,
  userId: number,
  contentId: string,
  parentCommentUid: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
): Promise<string> {
  return isPostgresCommunityMode(env)
    ? createPostgresContentSubcomment(env, userId, contentId, parentCommentUid, body, visibility)
    : createD1Subcomment(env, userId, contentId, parentCommentUid, body, visibility);
}

export async function updateComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: ContentCommentVisibility,
): Promise<void> {
  if (!isPostgresCommunityMode(env)) {
    return updateD1Comment(env, userId, commentUid, body, visibility);
  }

  const post = await getPostgresCommunityPostByUid(env, commentUid, userId);
  if (post?.postType === "event_opinion" && post.author?.id === userId) {
    await upsertPostgresCommunityPost(env, commentUid, {
      uid: commentUid,
      userId,
      postType: "event_opinion",
      visibility,
      blocks: createPlaintextCommunityPostBlocks(body),
    });
    return;
  }
  await updatePostgresCommunityComment(env, userId, commentUid, body, visibility);
}

export async function deleteComment(env: Env, userId: number, commentUid: string): Promise<void> {
  if (!isPostgresCommunityMode(env)) {
    return deleteD1Comment(env, userId, commentUid);
  }

  const post = await getPostgresCommunityPostByUid(env, commentUid, userId);
  if (post?.postType === "event_opinion" && post.author?.id === userId) {
    await deletePostgresCommunityPostByUid(env, commentUid, userId);
    return;
  }
  await deletePostgresCommunityComment(env, userId, commentUid);
}

export async function getCommentIdByUid(env: Env, commentUid: string, userId?: number): Promise<number | null> {
  return isPostgresCommunityMode(env)
    ? getPostgresContentCommentIdByUid(env, commentUid, userId)
    : getD1CommentIdByUid(env, commentUid, userId);
}

export async function pinComment(env: Env, userId: number, contentId: string, commentUid: string): Promise<void> {
  return isPostgresCommunityMode(env)
    ? pinPostgresContentComment(env, userId, contentId, commentUid)
    : pinD1Comment(env, userId, contentId, commentUid);
}

export async function unpinComment(env: Env, userId: number, contentId: string): Promise<void> {
  return isPostgresCommunityMode(env)
    ? unpinPostgresContentComment(env, userId, contentId)
    : unpinD1Comment(env, userId, contentId);
}

export async function getNestedContentComments(
  env: Env,
  contentUid: string,
  currentUser: { id: number; username: string } | null,
): Promise<NestedComment[]> {
  if (!isPostgresCommunityMode(env)) {
    return getD1NestedContentComments(env, contentUid, currentUser);
  }
  const comments = await getPostgresContentComments(env, [contentUid], currentUser?.id);
  return nestComments(comments[contentUid] ?? [], currentUser);
}
