import type { CommunityFeedPost } from "./community";
import { getAllStudentsMap } from "./student";
import { getGradingTagsByGradingUids, type StudentGradingTagValue } from "./student-grading-tag";
import { getTimelineContentsByUids } from "./timeline-content";
import { RecruitmentRepository } from "~/repositories/recruitment";

export const COMMUNITY_FEED_PAGE_SIZE = 20;
export const COMMUNITY_VISIBLE_POST_TYPES = ["student_review", "event_opinion"] as const;

export type EnrichedCommunityFeedPost = CommunityFeedPost & {
  subjectStudentName: string | null;
  subjectContentName: string | null;
  tags: StudentGradingTagValue[];
  pickupStudents: { uid: string; name: string }[];
};

export async function enrichCommunityFeedPosts(
  env: Env,
  posts: CommunityFeedPost[],
): Promise<{
  posts: EnrichedCommunityFeedPost[];
  studentsByUid: Record<string, { name: string }>;
}> {
  const allStudentsMap = await getAllStudentsMap(env, true);
  const contentUids = posts
    .map((post) => post.subjectContentUid)
    .filter((uid): uid is string => uid !== null);

  const [timelineContents, gradingTags] = await Promise.all([
    contentUids.length > 0 ? getTimelineContentsByUids(env, contentUids) : [],
    getGradingTagsByGradingUids(
      env,
      posts.filter((post) => post.postType === "student_review").map((post) => post.uid),
    ),
  ]);

  const timelineContentMap = new Map(timelineContents.map((content) => [content.uid, content]));
  const recruitmentGroupUids = timelineContents
    .map((content) => content.recruitmentGroupUid)
    .filter((uid): uid is string => uid !== null);
  const recruitmentGroups = recruitmentGroupUids.length > 0
    ? await new RecruitmentRepository(env).getByUids(recruitmentGroupUids)
    : [];
  const recruitmentGroupMap = new Map(recruitmentGroups.map((group) => [group.uid, group]));

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
      subjectStudentName: post.subjectStudentUid ? allStudentsMap[post.subjectStudentUid]?.name ?? null : null,
      subjectContentName: post.subjectContentUid ? timelineContentMap.get(post.subjectContentUid)?.name ?? null : null,
      pickupStudents: post.subjectContentUid
        ? (
            recruitmentGroupMap
              .get(timelineContentMap.get(post.subjectContentUid)?.recruitmentGroupUid ?? "")
              ?.recruitments.filter((recruitment) => recruitment.pickup && recruitment.student)
              .map((recruitment) => ({
                uid: recruitment.student?.uid ?? "",
                name: recruitment.student?.name ?? recruitment.studentName,
              })) ?? []
          )
        : [],
    })),
  };
}
