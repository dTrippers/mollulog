import { normalizeCommunityTimestamp } from "./community";
import type { ContentCommentWithSensei } from "./content-comment";

export type { ContentCommentSummary, ContentCommentWithSensei } from "./content-comment";

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

export { CONTENT_ORDER, SHOW_LINK_CONTENT_TYPES, SHOW_LINK_RAID_TYPES } from "./content-rules";
