import type { CommunityFeedPost, CommunityPostBlock, MarkdownCommunityPostBlock } from "~/models/community";
import type { RecruitmentFeedStats } from "~/models/community-feed";
import type { StudentGradingTagValue } from "~/models/student-grading-tag";

export const COMMUNITY_FEED_PAGE_SIZE = 20;
export const COMMUNITY_VISIBLE_POST_TYPES = [
  "student_review",
  "event_opinion",
  "youtube_video",
  "recruitment_result",
  "walkthrough_timeline",
] as const;

// Markdown blocks carry server-rendered, sanitized HTML so the client does not need a markdown renderer.
export type EnrichedCommunityPostBlock =
  | Exclude<CommunityPostBlock, MarkdownCommunityPostBlock>
  | (MarkdownCommunityPostBlock & { html: string });

export type EnrichedCommunityFeedPost = Omit<CommunityFeedPost, "blocks"> & {
  blocks: EnrichedCommunityPostBlock[];
  subjectStudentName: string | null;
  subjectContentName: string | null;
  tags: StudentGradingTagValue[];
  pickupStudents: { uid: string; name: string }[];
  recruitmentStats: RecruitmentFeedStats | null;
  likeTarget: { uid: string; action: string } | null;
};
