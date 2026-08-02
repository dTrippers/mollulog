import { getPostgresWalkthroughTimelineLikeSummaries } from "~/db/postgres/walkthrough-timeline-likes";
import { filterRecruitmentsByStudentUids } from "~/domain/recruitment-identity";
import type { CommunityFeedPost } from "~/models/community";
import {
  type CommunityFeedStatsRecruitmentGroup,
  type CommunityFeedStatsTimelineContent,
  getRecruitmentFeedStatsByPostUid,
} from "~/models/community-feed.server";
import { getRecruitmentGroupsByUids } from "~/models/recruitment";
import { getAllStudentsMap } from "~/models/student";
import { getGradingTagsByGradingUids } from "~/models/student-grading-tag.server";
import { getTimelineContentsByUids } from "~/models/timeline-content.server";
import type { EnrichedCommunityFeedPost } from "~/views/community";

export { COMMUNITY_FEED_PAGE_SIZE, COMMUNITY_VISIBLE_POST_TYPES } from "~/views/community";

export async function enrichCommunityFeedPosts(
  env: Env,
  posts: CommunityFeedPost[],
  options: {
    ctx?: ExecutionContext;
    currentUserId?: number | null;
    includeEngagement?: boolean;
  } = {},
): Promise<{
  posts: EnrichedCommunityFeedPost[];
  studentsByUid: Record<string, { name: string }>;
}> {
  const { ctx, currentUserId, includeEngagement = true } = options;
  const allStudentsMap = await getAllStudentsMap(env, true);
  const contentUids = posts.map((post) => post.subjectContentUid).filter((uid): uid is string => uid !== null);

  const walkthroughUids = posts.flatMap((post) =>
    post.blocks.flatMap((block) => (block.type === "walkthrough_timeline" ? [block.timelineUid] : [])),
  );
  const [timelineContents, gradingTags, walkthroughEngagementByUid] = await Promise.all([
    contentUids.length > 0 ? getTimelineContentsByUids(env, contentUids, { ctx }) : [],
    getGradingTagsByGradingUids(
      env,
      posts.filter((post) => post.postType === "student_review").map((post) => post.uid),
    ),
    includeEngagement
      ? getPostgresWalkthroughTimelineLikeSummaries(env, walkthroughUids, currentUserId, { ctx })
      : Promise.resolve({} as Awaited<ReturnType<typeof getPostgresWalkthroughTimelineLikeSummaries>>),
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
    posts: posts.map((post) => {
      const walkthroughBlock = post.blocks.find((block) => block.type === "walkthrough_timeline");
      const walkthroughEngagement = walkthroughBlock ? walkthroughEngagementByUid[walkthroughBlock.timelineUid] : null;
      const likeTarget = walkthroughBlock
        ? { uid: walkthroughBlock.timelineUid, action: `/api/timelines/${walkthroughBlock.timelineUid}/likes` }
        : post.postType === "guide" || post.postType === "youtube_video"
          ? { uid: post.uid, action: `/api/community/posts/${post.uid}/likes` }
          : null;

      return {
        ...post,
        liked: walkthroughEngagement?.liked ?? post.liked,
        likeCount: walkthroughEngagement?.likeCount ?? post.likeCount,
        likeTarget,
        tags: gradingTags[post.uid]?.map((tag) => tag.tagValue) ?? [],
        subjectStudentName: post.subjectStudentUid ? (allStudentsMap[post.subjectStudentUid]?.name ?? null) : null,
        subjectContentName: post.subjectContentUid
          ? (timelineContentMap.get(post.subjectContentUid)?.name ?? null)
          : null,
        recruitmentStats: recruitmentStatsByPostUid.get(post.uid) ?? null,
        pickupStudents: post.subjectContentUid
          ? (() => {
              const subjectContent = timelineContentMap.get(post.subjectContentUid);
              const group = recruitmentGroupMap.get(subjectContent?.recruitmentGroupUid ?? "");
              return filterRecruitmentsByStudentUids(
                group?.recruitments ?? [],
                subjectContent?.recruitmentStudentUids ?? null,
              )
                .filter(
                  (recruitment) => recruitment.pickup && recruitment.recruitmentType !== "given" && recruitment.student,
                )
                .map((recruitment) => ({
                  uid: recruitment.student?.uid ?? "",
                  name: recruitment.student?.name ?? recruitment.studentName,
                }));
            })()
          : [],
      };
    }),
  };
}
