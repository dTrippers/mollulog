import type { NestedCommunityComment } from "./community";

export type CommunityPostCommentsChangedActionResult = {
  kind: "communityPostCommentsChanged";
  postUid: string;
  comments: NestedCommunityComment[];
};

export type CommunityPostLikeChangedActionResult = {
  kind: "communityPostLikeChanged";
  postUid: string;
  likeCount: number;
  liked: boolean;
};

export type CommunityEngagementActionResult =
  | CommunityPostCommentsChangedActionResult
  | CommunityPostLikeChangedActionResult;

export function isCommunityEngagementActionResult(value: unknown): value is CommunityEngagementActionResult {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return false;
  }

  if (value.kind === "communityPostCommentsChanged") {
    return (
      "postUid" in value && typeof value.postUid === "string" && "comments" in value && Array.isArray(value.comments)
    );
  }

  if (value.kind === "communityPostLikeChanged") {
    return (
      "postUid" in value &&
      typeof value.postUid === "string" &&
      "likeCount" in value &&
      typeof value.likeCount === "number" &&
      "liked" in value &&
      typeof value.liked === "boolean"
    );
  }

  return false;
}
