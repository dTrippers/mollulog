import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getRecruitmentResultCountStats, sanitizeRecruitmentResultStudents } from "~/domain/recruitment-result";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { CommunityFeedPost } from "./community";
import { type RecruitmentResultStudent, recruitmentResultsTable } from "./recruitment-result";

export type RecruitmentFeedStats = {
  totalTrial: number | null;
  tier3Count: number;
  pickupCount: number;
};

export type CommunityFeedStatsStudentMap = Record<string, { uid: string; name: string; initialTier: number }>;

export type CommunityFeedStatsRecruitmentGroup = {
  uid: string;
  recruitmentType: RecruitmentTypeEnum;
  recruitments: {
    pickup: boolean;
    recruitmentType: RecruitmentTypeEnum;
    studentName: string;
    student: { uid: string; name: string; initialTier: number } | null;
  }[];
};

export type CommunityFeedStatsTimelineContent = {
  uid: string;
  name: string;
  recruitmentGroupUid: string | null;
  recruitmentStudentUids: string[] | null;
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

export async function getRecruitmentFeedStatsByPostUid(
  env: Env,
  posts: CommunityFeedPost[],
  options: {
    allStudentsMap: CommunityFeedStatsStudentMap;
    recruitmentGroupMap: Map<string, CommunityFeedStatsRecruitmentGroup>;
    timelineContentMap: Map<string, CommunityFeedStatsTimelineContent>;
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
