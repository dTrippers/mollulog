import { useCallback } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { type FeedPageData, InfiniteFeed } from "~/components/v2/features/feed/InfiniteFeed";
import { hasAccountLabel } from "~/domain/account-label";
import { getLogger } from "~/lib/observability.server";
import { getCommunityFeedPage } from "~/models/community.server";
import { isCommunityEngagementActionResult } from "~/models/community-engagement";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { COMMUNITY_FEED_PAGE_SIZE, COMMUNITY_VISIBLE_POST_TYPES } from "~/views/community";
import { enrichCommunityFeedPosts } from "~/views/community.server";
import { getRecruitmentRecordSummary } from "~/views/recruitment-record-summary.server";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { useUserLayout } from "./$username._components/user-layout";
import { OfficialAccountNotice } from "./$username._index._components/OfficialAccountNotice";
import {
  ProfileRecordSummary,
  type ProfileRecordSummaryData,
} from "./$username._index._components/ProfileRecordSummary";

function parsePage(request: Request) {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
}

// The feed and the record summary are shown with their own failure state, so their failures are answered as data:
// `fetcher.load` for the next page could not show a thrown error inline.
async function loadFeed(
  env: Env,
  ctx: ExecutionContext,
  logger: ReturnType<typeof getLogger>,
  options: { currentUserId: number | undefined; authorUserId: number; page: number },
): Promise<FeedPageData> {
  const signedIn = options.currentUserId !== undefined;
  try {
    const feedPage = await getCommunityFeedPage(env, {
      currentUserId: options.currentUserId,
      authorUserId: options.authorUserId,
      postTypes: [...COMMUNITY_VISIBLE_POST_TYPES],
      page: options.page,
      pageSize: COMMUNITY_FEED_PAGE_SIZE,
      ctx,
    });
    const enriched = await enrichCommunityFeedPosts(env, feedPage.items, { ctx, currentUserId: options.currentUserId });
    return {
      page: feedPage.page,
      totalPages: feedPage.totalPages,
      signedIn,
      studentsByUid: enriched.studentsByUid,
      posts: enriched.posts,
      failed: false,
    };
  } catch (error) {
    logger.error("Profile feed failed to load", error);
    return { page: options.page, totalPages: options.page, signedIn, studentsByUid: {}, posts: [], failed: true };
  }
}

async function loadRecordSummary(
  env: Env,
  logger: ReturnType<typeof getLogger>,
  userId: number,
): Promise<ProfileRecordSummaryData> {
  try {
    return { status: "ready", summary: await getRecruitmentRecordSummary(env, userId) };
  } catch (error) {
    logger.error("Profile recruitment record summary failed to load", error);
    return { status: "failed" };
  }
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const page = parsePage(request);
  const logger = getLogger(env, ctx, { route: "$username._index" });

  const [recruitedStudents, allReleasedStudents, feed, records] = await Promise.all([
    getRecruitedStudents(env, sensei.id),
    getAllStudents(env),
    loadFeed(env, ctx, logger, { currentUserId: currentUser?.id, authorUserId: sensei.id, page }),
    loadRecordSummary(env, logger, sensei.id),
  ]);

  const tierCounts: Record<number, number> = {};
  for (const { tier } of recruitedStudents) {
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  return {
    sensei: {
      labels: sensei.labels ?? [],
    },
    tierCounts,
    recruitedStudentCount: recruitedStudents.length,
    totalStudentCount: allReleasedStudents.length,
    records,
    feed,
  };
};

export const shouldRevalidate: ShouldRevalidateFunction = ({ actionResult, defaultShouldRevalidate }) => {
  if (isCommunityEngagementActionResult(actionResult)) {
    return false;
  }

  return defaultShouldRevalidate;
};

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 프로필 | 몰루로그`.trim() },
    {
      name: "description",
      content: `${params.username} 선생님의 프로필과 최근 활동을 확인해보세요.`,
    },
    {
      name: "og:title",
      content: `${params.username || ""} - 프로필 | 몰루로그`.trim(),
    },
    {
      name: "og:description",
      content: `${params.username} 선생님의 프로필과 최근 활동을 확인해보세요.`,
    },
  ];
};

export default function UserIndex() {
  const { sensei, tierCounts, recruitedStudentCount, totalStudentCount, records, feed } =
    useLoaderData<typeof loader>();
  const { username } = useUserLayout();
  const [searchParams] = useSearchParams();
  const getPageUrl = useCallback(
    (nextPage: number) => {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("page", String(nextPage));
      // `index` targets this screen's loader instead of the user layout's, which has no feed.
      nextSearchParams.set("index", "");
      return `/@${username}?${nextSearchParams.toString()}`;
    },
    [searchParams, username],
  );

  return (
    <div className="flex flex-col gap-v2-section-gap">
      {hasAccountLabel(sensei.labels, "official") ? <OfficialAccountNotice /> : null}
      <ProfileRecordSummary
        username={username}
        tierCounts={tierCounts}
        recruitedCount={recruitedStudentCount}
        totalCount={totalStudentCount}
        records={records}
      />
      <section aria-labelledby="profile-feed" className="flex flex-col gap-v2-block-gap">
        <h2 id="profile-feed" className="text-base font-bold text-v2-fg">
          작성한 글
        </h2>
        <InfiniteFeed {...feed} emptyText="아직 작성한 글이 없어요" resetKey={username} getPageUrl={getPageUrl} />
      </section>
    </div>
  );
}
