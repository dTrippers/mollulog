import type { RecruitmentOpinionClassificationJob } from "~/db/postgres/community";
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
  updatePostgresContentOpinion,
} from "~/db/postgres/community";
import type { ConcurrencyGate } from "~/lib/concurrency";
import { getRecruitmentGroupByUid, normalizeRecruitmentGroupPeriod } from "~/models/recruitment";
import { getTimelineContent } from "~/models/timeline-content.server";
import type { ContentCommentSummary, ContentCommentWithSensei, NestedComment } from "./content";
import { nestComments } from "./content";
import type { ContentCommentVisibility } from "./content-comment";

export type { ContentCommentSummary, ContentCommentWithSensei, NestedComment } from "./content";
export { nestComments } from "./content";

export type ContentCommentReadOptions = {
  hideRecruitmentOpinions?: boolean;
  recruitmentPeriodStartAtByContentId?: Readonly<Record<string, string | null>>;
  ctx?: ExecutionContext;
};

export async function getContentRecruitmentPeriod(
  env: Env,
  contentId: string,
  options: { ctx?: ExecutionContext } = {},
) {
  const content = await getTimelineContent(env, contentId, options);
  if (!content?.recruitmentGroupUid) return null;
  const recruitmentGroup = await getRecruitmentGroupByUid(env, content.recruitmentGroupUid);
  return recruitmentGroup ? normalizeRecruitmentGroupPeriod(recruitmentGroup) : null;
}

export async function getContentComments(
  env: Env,
  contentId: string,
  userId?: number,
  options: ContentCommentReadOptions = {},
): Promise<ContentCommentWithSensei[]> {
  return (await getPostgresContentComments(env, [contentId], userId, options))[contentId] ?? [];
}

export async function getContentsComments(
  env: Env,
  contentIds: string[],
  userId?: number,
  options: ContentCommentReadOptions = {},
): Promise<Record<string, ContentCommentWithSensei[]>> {
  return getPostgresContentComments(env, contentIds, userId, options);
}

export async function getContentsCommentSummaries(
  env: Env,
  contentIds: string[],
  userId?: number,
  _concurrencyGate?: ConcurrencyGate,
  options: ContentCommentReadOptions = {},
): Promise<Record<string, ContentCommentSummary>> {
  return getPostgresContentCommentSummaries(env, contentIds, userId, options);
}

export async function createComment(
  env: Env,
  userId: number,
  contentId: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
  options: { recruitmentPeriodStartAt?: string | null; ctx?: ExecutionContext } = {},
): Promise<string> {
  return createPostgresContentComment(env, userId, contentId, body, visibility, options);
}

export async function createSubcomment(
  env: Env,
  userId: number,
  contentId: string,
  parentCommentUid: string,
  body: string,
  visibility: ContentCommentVisibility = "private",
  options: { recruitmentPeriodStartAt?: string | null; ctx?: ExecutionContext } = {},
): Promise<string> {
  return createPostgresContentSubcomment(env, userId, contentId, parentCommentUid, body, visibility, options);
}

export async function updateComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: ContentCommentVisibility,
  options: { recruitmentPeriodStartAt?: string | null; ctx?: ExecutionContext } = {},
): Promise<RecruitmentOpinionClassificationJob | null> {
  const post = await getPostgresCommunityPostByUid(env, commentUid, userId);
  if (post?.postType === "event_opinion" && post.author?.id === userId) {
    const job = await updatePostgresContentOpinion(env, userId, commentUid, body, visibility, options);
    return job ?? null;
  }
  await updatePostgresCommunityComment(env, userId, commentUid, body, visibility);
  return null;
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
  options: ContentCommentReadOptions = {},
): Promise<NestedComment[]> {
  const comments = await getPostgresContentComments(env, [contentUid], currentUser?.id, options);
  return nestComments(comments[contentUid] ?? [], currentUser);
}
