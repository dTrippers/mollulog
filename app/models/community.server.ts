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
  createCommunityComment as createD1CommunityComment,
  createRecruitmentResultCommunityPost as createD1RecruitmentResultCommunityPost,
  createPlaintextCommunityPostBlocks,
  createWalkthroughTimelineCommunityPostBlocks,
  deleteCommunityComment as deleteD1CommunityComment,
  deleteCommunityPostByUid as deleteD1CommunityPostByUid,
  getCommunityFeedPageWithCache,
  getCommunityFeedPage as getD1CommunityFeedPage,
  getCommunityLikeCountsByPostUids as getD1CommunityLikeCountsByPostUids,
  getCommunityPostByUid as getD1CommunityPostByUid,
  getLikedCommunityPostUids as getD1LikedCommunityPostUids,
  getNestedCommunityComments as getD1NestedCommunityComments,
  getNestedCommunityCommentsByPostUids as getD1NestedCommunityCommentsByPostUids,
  setCommunityPostLike as setD1CommunityPostLike,
  syncWalkthroughTimelineCommunityPost as syncD1WalkthroughTimelineCommunityPost,
  updateCommunityComment as updateD1CommunityComment,
  upsertRecruitmentResultCommunityPost as upsertD1RecruitmentResultCommunityPost,
  upsertYoutubeVideoCommunityPost as upsertD1YoutubeVideoCommunityPost,
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

export const COMMUNITY_SOURCE_MODES = ["d1", "hyperdrive"] as const;
export type CommunitySourceMode = (typeof COMMUNITY_SOURCE_MODES)[number];

export function resolveCommunitySourceMode(value: string | undefined): CommunitySourceMode {
  if (value === "d1" || value === "hyperdrive") return value;
  throw new Error(`invalid COMMUNITY_SOURCE_MODE: ${value ?? "undefined"}`);
}

function isPostgresCommunityMode(env: Pick<Env, "COMMUNITY_SOURCE_MODE">): boolean {
  return resolveCommunitySourceMode(env.COMMUNITY_SOURCE_MODE) === "hyperdrive";
}

export async function getCommunityLikeCountsByPostUids(env: Env, postUids: string[]): Promise<Record<string, number>> {
  return isPostgresCommunityMode(env)
    ? getPostgresCommunityLikeCountsByPostUids(env, postUids)
    : getD1CommunityLikeCountsByPostUids(env, postUids);
}

export async function getLikedCommunityPostUids(env: Env, userId: number, postUids: string[]): Promise<Set<string>> {
  return isPostgresCommunityMode(env)
    ? getPostgresLikedCommunityPostUids(env, userId, postUids)
    : getD1LikedCommunityPostUids(env, userId, postUids);
}

export async function getNestedCommunityCommentsByPostUids(
  env: Env,
  postUids: string[],
  currentUserId?: number | null,
): Promise<Record<string, NestedCommunityComment[]>> {
  return isPostgresCommunityMode(env)
    ? getPostgresNestedCommunityCommentsByPostUids(env, postUids, currentUserId)
    : getD1NestedCommunityCommentsByPostUids(env, postUids, currentUserId);
}

export async function getNestedCommunityComments(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
): Promise<NestedCommunityComment[]> {
  return isPostgresCommunityMode(env)
    ? getPostgresNestedCommunityComments(env, postUid, currentUserId)
    : getD1NestedCommunityComments(env, postUid, currentUserId);
}

export async function getCommunityFeedPage(
  env: Env,
  options: CommunityFeedPageOptions = {},
): Promise<CommunityFeedPageResult> {
  return isPostgresCommunityMode(env)
    ? getCommunityFeedPageWithCache(env, options, getPostgresCommunityFeedPage)
    : getD1CommunityFeedPage(env, options);
}

export async function getCommunityPostByUid(
  env: Env,
  postUid: string,
  currentUserId?: number | null,
): Promise<CommunityFeedPost | null> {
  return isPostgresCommunityMode(env)
    ? getPostgresCommunityPostByUid(env, postUid, currentUserId)
    : getD1CommunityPostByUid(env, postUid, currentUserId);
}

export async function createCommunityComment(
  env: Env,
  userId: number,
  postUid: string,
  body: string,
  visibility: CommunityCommentVisibility = "public",
  parentUid?: string | null,
): Promise<string> {
  return isPostgresCommunityMode(env)
    ? createPostgresCommunityComment(env, userId, postUid, body, visibility, parentUid)
    : createD1CommunityComment(env, userId, postUid, body, visibility, parentUid);
}

export async function updateCommunityComment(
  env: Env,
  userId: number,
  commentUid: string,
  body: string,
  visibility: CommunityCommentVisibility,
): Promise<void> {
  return isPostgresCommunityMode(env)
    ? updatePostgresCommunityComment(env, userId, commentUid, body, visibility)
    : updateD1CommunityComment(env, userId, commentUid, body, visibility);
}

export async function deleteCommunityComment(env: Env, userId: number, commentUid: string): Promise<void> {
  return isPostgresCommunityMode(env)
    ? deletePostgresCommunityComment(env, userId, commentUid)
    : deleteD1CommunityComment(env, userId, commentUid);
}

export async function setCommunityPostLike(env: Env, userId: number, postUid: string, liked: boolean): Promise<void> {
  return isPostgresCommunityMode(env)
    ? setPostgresCommunityPostLike(env, userId, postUid, liked)
    : setD1CommunityPostLike(env, userId, postUid, liked);
}

export async function syncWalkthroughTimelineCommunityPost(
  env: Env,
  timeline: WalkthroughTimelineRecord,
): Promise<string | null> {
  return isPostgresCommunityMode(env)
    ? syncPostgresWalkthroughTimelineCommunityPost(
        env,
        timeline,
        createWalkthroughTimelineCommunityPostBlocks(timeline),
      )
    : syncD1WalkthroughTimelineCommunityPost(env, timeline);
}

export async function upsertYoutubeVideoCommunityPost(env: Env, video: YoutubeVideoCommunityPostInput): Promise<void> {
  return isPostgresCommunityMode(env)
    ? upsertPostgresYoutubeCommunityPost(env, video, [{ type: "youtube", youtubeId: video.id }])
    : upsertD1YoutubeVideoCommunityPost(env, video);
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
  return isPostgresCommunityMode(env)
    ? createPostgresCommunityPost(env, {
        userId: input.userId,
        postType: "recruitment_result",
        origin: "user",
        visibility: "public",
        subjectStudentUid: input.subjectStudentUid ?? null,
        subjectContentUid: input.subjectContentUid,
        blocks: createPlaintextCommunityPostBlocks(input.body),
        sourceType: "recruitment_result",
        sourceUid: input.recruitmentResultUid,
      })
    : createD1RecruitmentResultCommunityPost(env, input);
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
  return isPostgresCommunityMode(env)
    ? upsertPostgresCommunityPost(env, input.postUid, {
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
      })
    : upsertD1RecruitmentResultCommunityPost(env, input);
}

export async function deleteCommunityPostByUid(env: Env, postUid: string, userId?: number): Promise<void> {
  return isPostgresCommunityMode(env)
    ? deletePostgresCommunityPostByUid(env, postUid, userId)
    : deleteD1CommunityPostByUid(env, postUid, userId);
}
