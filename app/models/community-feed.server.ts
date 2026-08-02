import { getPostgresRecruitmentStatsRows } from "~/db/postgres/community";
import { getRecruitmentResultCountStats, sanitizeRecruitmentResultStudents } from "~/domain/recruitment-result";
import type { CommunityFeedPost } from "./community";
import { resolveCommunitySourceMode } from "./community.server";
import {
  type CommunityFeedStatsRecruitmentGroup,
  type CommunityFeedStatsStudentMap,
  type CommunityFeedStatsTimelineContent,
  getRecruitmentFeedStatsByPostUid as getD1RecruitmentFeedStatsByPostUid,
  type RecruitmentFeedStats,
} from "./community-feed";
import type { RecruitmentResultStudent } from "./recruitment-result";

export type {
  CommunityFeedStatsRecruitmentGroup,
  CommunityFeedStatsStudentMap,
  CommunityFeedStatsTimelineContent,
  RecruitmentFeedStats,
} from "./community-feed";

function isPostgresCommunityMode(env: Pick<Env, "COMMUNITY_SOURCE_MODE">): boolean {
  return resolveCommunitySourceMode(env.COMMUNITY_SOURCE_MODE) === "hyperdrive";
}

function parseRecruitmentResultStudents(value: unknown): RecruitmentResultStudent[] {
  if (Array.isArray(value)) {
    return sanitizeRecruitmentResultStudents(value as RecruitmentResultStudent[]);
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? sanitizeRecruitmentResultStudents(parsed as RecruitmentResultStudent[]) : [];
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
  if (!isPostgresCommunityMode(env)) {
    return getD1RecruitmentFeedStatsByPostUid(env, posts, options);
  }

  const postByUid = new Map(
    posts.flatMap((post) => (post.postType === "recruitment_result" && post.author ? [[post.uid, post] as const] : [])),
  );
  if (postByUid.size === 0) return new Map();

  const rows = await getPostgresRecruitmentStatsRows(env, [...postByUid.keys()]);
  return new Map(
    rows.flatMap((row) => {
      const post = row.commentPostUid ? postByUid.get(row.commentPostUid) : null;
      if (!post?.author || post.author.id !== row.userId) return [];

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
