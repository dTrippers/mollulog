import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getRecruitmentGroupsByUids } from "~/models/recruitment";
import type { CommunityFeedPost } from "./community";
import {
  type RecruitmentResultStudent,
  recruitmentResultsTable,
  sanitizeRecruitmentResultStudents,
} from "./recruitment-result";
import { getRecruitmentResultCountStats } from "./recruitment-result-stats";
import { getAllStudentsMap } from "./student";
import { type StudentGradingTagValue, getGradingTagsByGradingUids } from "./student-grading-tag";
import { getTimelineContentsByUids } from "./timeline-content";

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

export type RecruitmentFeedStats = {
  totalTrial: number | null;
  tier3Count: number;
  pickupCount: number;
};

function parseRecruitmentResultStudents(value: string): RecruitmentResultStudent[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sanitizeRecruitmentResultStudents(parsed as RecruitmentResultStudent[]);
  } catch {
    return [];
  }
}

async function getRecruitmentFeedStatsByPostUid(
  env: Env,
  posts: CommunityFeedPost[],
  options: {
    allStudentsMap: Awaited<ReturnType<typeof getAllStudentsMap>>;
    recruitmentGroupMap: Map<string, Awaited<ReturnType<typeof getRecruitmentGroupsByUids>>[number]>;
    timelineContentMap: Map<string, Awaited<ReturnType<typeof getTimelineContentsByUids>>[number]>;
  },
): Promise<Map<string, RecruitmentFeedStats>> {
  const postByUid = new Map(
    posts.flatMap((post) => (post.postType === "recruitment_result" && post.author ? [[post.uid, post] as const] : [])),
  );
  if (postByUid.size === 0) {
    return new Map();
  }

  const db = drizzle(env.DB);
  const rows = await db
    .select({
      userId: recruitmentResultsTable.userId,
      recruitedStudents: recruitmentResultsTable.recruitedStudents,
      tier3Count: recruitmentResultsTable.tier3Count,
      trial: recruitmentResultsTable.trial,
      commentPostUid: recruitmentResultsTable.commentPostUid,
    })
    .from(recruitmentResultsTable)
    .where(inArray(recruitmentResultsTable.commentPostUid, [...postByUid.keys()]))
    .all();

  return new Map(
    rows.flatMap((row) => {
      const commentPostUid = row.commentPostUid;
      const post = commentPostUid ? postByUid.get(commentPostUid) : null;
      if (!post?.author || post.author.id !== row.userId) {
        return [];
      }

      const recruitedStudents = parseRecruitmentResultStudents(row.recruitedStudents);
      const subjectContentUid = post.subjectContentUid;
      const group = subjectContentUid
        ? options.recruitmentGroupMap.get(options.timelineContentMap.get(subjectContentUid)?.recruitmentGroupUid ?? "")
        : null;
      const stats = getRecruitmentResultCountStats(
        {
          recruitedStudents,
          tier3Count: row.tier3Count ?? null,
          trial: row.trial ?? null,
        },
        {
          allStudentsMap: options.allStudentsMap,
          group,
        },
      );

      return [
        [
          post.uid,
          {
            totalTrial: row.trial ?? null,
            tier3Count: stats.tier3Count,
            pickupCount: stats.pickupCount,
          },
        ] as const,
      ];
    }),
  );
}

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

  const timelineContentMap = new Map(timelineContents.map((content) => [content.uid, content]));
  const recruitmentGroupUids = timelineContents
    .map((content) => content.recruitmentGroupUid)
    .filter((uid): uid is string => uid !== null);
  const recruitmentGroups =
    recruitmentGroupUids.length > 0 ? await getRecruitmentGroupsByUids(env, recruitmentGroupUids) : [];
  const recruitmentGroupMap = new Map(recruitmentGroups.map((group) => [group.uid, group]));
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
