import type { CommunityFeedPost } from "~/models/community";
import type { RecruitmentFeedStats } from "~/models/community-feed";
import type { StudentGradingTagValue } from "~/models/student-grading-tag";

export const COMMUNITY_FEED_PAGE_SIZE = 20;
export const COMMUNITY_VISIBLE_POST_TYPES = [
  "student_review",
  "event_opinion",
  "youtube_video",
  "recruitment_result",
] as const;

export type EnrichedCommunityFeedPost = CommunityFeedPost & {
  subjectStudentName: string | null;
  subjectContentName: string | null;
  tags: StudentGradingTagValue[];
  pickupStudents: { uid: string; name: string }[];
  recruitmentStats: RecruitmentFeedStats | null;
};
