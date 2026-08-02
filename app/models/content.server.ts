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
import type { ContentCommentSummary, ContentCommentWithSensei, NestedComment } from "./content";
import { nestComments } from "./content";
import type { ContentCommentVisibility } from "./content-comment";

export type { ContentCommentSummary, ContentCommentWithSensei, NestedComment } from "./content";
export { nestComments } from "./content";

export async function getContentComments(
  env: Env,
  contentId: string,
  userId?: number,
): Promise<ContentCommentWithSensei[]> {
  return (await getPostgresContentComments(env, [contentId], userId))[contentId] ?? [];
}

export async function getContentsComments(
  env: Env,
  contentIds: string[],
  userId?: number,
): Promise<Record<string, ContentCommentWithSensei[]>> {
  return getPostgresContentComments(env, contentIds, userId);
}

export async function getContentsCommentSummaries(
  env: Env,
  contentIds: string[],
  userId?: number,
  _concurrencyGate?: ConcurrencyGate,
): Promise<Record<string, ContentCommentSummary>> {
  return getPostgresContentCommentSummaries(env, contentIds, userId);
}

export async function createComment(
  env: Env,
  userId: number,
  contentId: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
): Promise<string> {
  return createPostgresContentComment(env, userId, contentId, body, visibility);
}

export async function createSubcomment(
  env: Env,
  userId: number,
  contentId: string,
  parentCommentUid: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
): Promise<string> {
  return createPostgresContentSubcomment(env, userId, contentId, parentCommentUid, body, visibility);
}

export async function updateComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: ContentCommentVisibility,
): Promise<void> {
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
  const post = await getPostgresCommunityPostByUid(env, commentUid, userId);
  if (post?.postType === "event_opinion" && post.author?.id === userId) {
    await deletePostgresCommunityPostByUid(env, commentUid, userId);
    return;
  }
  await deletePostgresCommunityComment(env, userId, commentUid);
}

export async function getCommentIdByUid(env: Env, commentUid: string, userId?: number): Promise<number | null> {
  return getPostgresContentCommentIdByUid(env, commentUid, userId);
}

export async function pinComment(env: Env, userId: number, contentId: string, commentUid: string): Promise<void> {
  return pinPostgresContentComment(env, userId, contentId, commentUid);
}

export async function unpinComment(env: Env, userId: number, contentId: string): Promise<void> {
  return unpinPostgresContentComment(env, userId, contentId);
}

export async function getNestedContentComments(
  env: Env,
  contentUid: string,
  currentUser: { id: number; username: string } | null,
): Promise<NestedComment[]> {
  const comments = await getPostgresContentComments(env, [contentUid], currentUser?.id);
  return nestComments(comments[contentUid] ?? [], currentUser);
}
