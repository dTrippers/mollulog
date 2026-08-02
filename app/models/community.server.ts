import {
  createPostgresCommunityComment,
  createPostgresCommunityPost,
  deletePostgresCommunityComment,
  deletePostgresCommunityPostByUid,
  getPostgresCommunityFeedPage,
  getPostgresCommunityLikeCountsByPostUids,
  getPostgresCommunityPostByUid,
  getPostgresLikedCommunityPostUids,
  getPostgresNestedCommunityComments,
  getPostgresNestedCommunityCommentsByPostUids,
  setPostgresCommunityPostLike,
  syncPostgresWalkthroughTimelineCommunityPost,
  updatePostgresCommunityComment,
  upsertPostgresCommunityPost,
  upsertPostgresYoutubeCommunityPost,
} from "~/db/postgres/community";
import type { WalkthroughTimelineRecord } from "~/domain/walkthrough-timeline";
import type {
  CommunityCommentVisibility,
  CommunityFeedPageOptions,
  CommunityFeedPageResult,
  CommunityFeedPost,
  NestedCommunityComment,
  YoutubeVideoCommunityPostInput,
} from "./community";
import {
  createPlaintextCommunityPostBlocks,
  createWalkthroughTimelineCommunityPostBlocks,
  getCommunityFeedPageWithCache,
} from "./community";

export type {
  CommunityCommentVisibility,
  CommunityFeedPageOptions,
  CommunityFeedPageResult,
  CommunityFeedPost,
  CommunityFeedPost as CommunityPost,
  CommunityPostBlock,
  CommunityPostOrigin,
  CommunityPostType,
  CommunityVisibility,
  MarkdownCommunityPostBlock,
  NestedCommunityComment,
  PartyInfoCommunityPostBlock,
  PlaintextCommunityPostBlock,
  WalkthroughTimelineCommunityPostBlock,
  YoutubeCommunityPostBlock,
  YoutubeVideoCommunityPostInput,
} from "./community";
export {
  createPlaintextCommunityPostBlocks,
  createWalkthroughTimelineCommunityPostBlocks,
  getPrimaryPlaintextBlockText,
  normalizeCommunityTimestamp,
  parseCommunityPostBlocks,
  serializeCommunityPostBlocks,
} from "./community";

export async function getCommunityLikeCountsByPostUids(env: Env, postUids: string[]): Promise<Record<string, number>> {
  return getPostgresCommunityLikeCountsByPostUids(env, postUids);
}

export async function getLikedCommunityPostUids(env: Env, userId: number, postUids: string[]): Promise<Set<string>> {
  return getPostgresLikedCommunityPostUids(env, userId, postUids);
}

export async function getNestedCommunityCommentsByPostUids(
  env: Env,
  postUids: string[],
  currentUserId?: number | null,
): Promise<Record<string, NestedCommunityComment[]>> {
  return getPostgresNestedCommunityCommentsByPostUids(env, postUids, currentUserId);
}

export async function getNestedCommunityComments(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
): Promise<NestedCommunityComment[]> {
  return getPostgresNestedCommunityComments(env, postUid, currentUserId);
}

export async function getCommunityFeedPage(
  env: Env,
  options: CommunityFeedPageOptions = {},
): Promise<CommunityFeedPageResult> {
  return getCommunityFeedPageWithCache(env, options, getPostgresCommunityFeedPage);
}

export async function getCommunityPostByUid(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
): Promise<CommunityFeedPost | null> {
  return getPostgresCommunityPostByUid(env, postUid, currentUserId);
}

export async function createCommunityComment(
  env: Env,
  userId: number,
  postUid: string,
  body: string,
  visibility: CommunityCommentVisibility = "public",
  parentUid?: string | null,
): Promise<string> {
  return createPostgresCommunityComment(env, userId, postUid, body, visibility, parentUid);
}

export async function updateCommunityComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: CommunityCommentVisibility,
): Promise<void> {
  return updatePostgresCommunityComment(env, userId, commentUid, body, visibility);
}

export async function deleteCommunityComment(env: Env, userId: number, commentUid: string): Promise<void> {
  return deletePostgresCommunityComment(env, userId, commentUid);
}

export async function setCommunityPostLike(env: Env, userId: number, postUid: string, liked: boolean): Promise<void> {
  return setPostgresCommunityPostLike(env, userId, postUid, liked);
}

export async function syncWalkthroughTimelineCommunityPost(
  env: Env,
  timeline: WalkthroughTimelineRecord,
): Promise<string | null> {
  return syncPostgresWalkthroughTimelineCommunityPost(
    env,
    timeline,
    createWalkthroughTimelineCommunityPostBlocks(timeline),
  );
}

export async function upsertYoutubeVideoCommunityPost(env: Env, video: YoutubeVideoCommunityPostInput): Promise<void> {
  return upsertPostgresYoutubeCommunityPost(env, video, [{ type: "youtube", youtubeId: video.id }]);
}

export async function createRecruitmentResultCommunityPost(
  env: Env,
  input: {
    userId: number;
    recruitmentResultUid: string;
    body: string;
    subjectContentUid: string;
    subjectStudentUid?: string | null;
  },
): Promise<string> {
  return createPostgresCommunityPost(env, {
    userId: input.userId,
    postType: "recruitment_result",
    origin: "user",
    visibility: "public",
    subjectStudentUid: input.subjectStudentUid ?? null,
    subjectContentUid: input.subjectContentUid,
    blocks: createPlaintextCommunityPostBlocks(input.body),
    sourceType: "recruitment_result",
    sourceUid: input.recruitmentResultUid,
  });
}

export async function upsertRecruitmentResultCommunityPost(
  env: Env,
  input: {
    postUid: string;
    userId: number;
    recruitmentResultUid: string;
    body: string;
    subjectContentUid: string;
    subjectStudentUid?: string | null;
  },
): Promise<string> {
  return upsertPostgresCommunityPost(env, input.postUid, {
    uid: input.postUid,
    userId: input.userId,
    postType: "recruitment_result",
    origin: "user",
    visibility: "public",
    subjectStudentUid: input.subjectStudentUid ?? null,
    subjectContentUid: input.subjectContentUid,
    blocks: createPlaintextCommunityPostBlocks(input.body),
    sourceType: "recruitment_result",
    sourceUid: input.recruitmentResultUid,
  });
}

export async function deleteCommunityPostByUid(env: Env, postUid: string, userId?: number): Promise<void> {
  return deletePostgresCommunityPostByUid(env, postUid, userId);
}
