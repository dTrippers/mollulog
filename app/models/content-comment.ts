import type { UtcIsoString } from "~/lib/date-time";

export type ContentCommentVisibility = "private" | "public";

export type ContentComment = {
  id: number;
  uid: string;
  contentId: string;
  body: string;
  visibility: ContentCommentVisibility;
  parentCommentId?: number | null;
  pinned: boolean;
  createdAt: UtcIsoString;
};

export type ContentCommentWithSensei = ContentComment & {
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
