import type { CommunityFeedPost } from "~/models/community";
import {
  type CommunityFeedStatsRecruitmentGroup,
  type CommunityFeedStatsTimelineContent,
  type RecruitmentFeedStats,
  getRecruitmentFeedStatsByPostUid,
} from "~/models/community-feed";
import { getRecruitmentGroupsByUids } from "~/models/recruitment";
import { getAllStudentsMap } from "~/models/student";
import { type StudentGradingTagValue, getGradingTagsByGradingUids } from "~/models/student-grading-tag";
import { getTimelineContentsByUids } from "~/models/timeline-content";

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

export async function enrichCommunityFeedPosts(
  env: Env,
  posts: CommunityFeedPost[],
): Promise<{
  posts: EnrichedCommunityFeedPost[];
  studentsByUid: Record<string, { name: string }>;
}> {
  const allStudentsMap = await getAllStudentsMap(env, true);
  const contentUids = posts.map((post) => post.subjectContentUid).filter((uid): uid is string => uid !== null);

  const [timelineContents, gradingTags] = await Promise.all([
    contentUids.length > 0 ? getTimelineContentsByUids(env, contentUids) : [],
    getGradingTagsByGradingUids(
      env,
      posts.filter((post) => post.postType === "student_review").map((post) => post.uid),
    ),
  ]);

  const timelineContentMap = new Map<string, CommunityFeedStatsTimelineContent>(
    timelineContents.map((content) => [content.uid, content]),
  );
  const recruitmentGroupUids = timelineContents
    .map((content) => content.recruitmentGroupUid)
    .filter((uid): uid is string => uid !== null);
  const recruitmentGroups =
    recruitmentGroupUids.length > 0 ? await getRecruitmentGroupsByUids(env, recruitmentGroupUids) : [];
  const recruitmentGroupMap = new Map<string, CommunityFeedStatsRecruitmentGroup>(
    recruitmentGroups.map((group) => [group.uid, group]),
  );
  const recruitmentStatsByPostUid = await getRecruitmentFeedStatsByPostUid(env, posts, {
    allStudentsMap,
    recruitmentGroupMap,
    timelineContentMap,
  });

  return {
    studentsByUid: Object.fromEntries(
      Object.entries(allStudentsMap).map(([uid, student]) => [
        uid,
        {
          name: student.name,
        },
      ]),
    ),
    posts: posts.map((post) => ({
      ...post,
      tags: gradingTags[post.uid]?.map((tag) => tag.tagValue) ?? [],
      subjectStudentName: post.subjectStudentUid ? (allStudentsMap[post.subjectStudentUid]?.name ?? null) : null,
      subjectContentName: post.subjectContentUid
        ? (timelineContentMap.get(post.subjectContentUid)?.name ?? null)
        : null,
      recruitmentStats: recruitmentStatsByPostUid.get(post.uid) ?? null,
      pickupStudents: post.subjectContentUid
        ? (recruitmentGroupMap
            .get(timelineContentMap.get(post.subjectContentUid)?.recruitmentGroupUid ?? "")
            ?.recruitments.filter(
              (recruitment) => recruitment.pickup && recruitment.recruitmentType !== "given" && recruitment.student,
            )
            .map((recruitment) => ({
              uid: recruitment.student?.uid ?? "",
              name: recruitment.student?.name ?? recruitment.studentName,
            })) ?? [])
        : [],
    })),
  };
}
