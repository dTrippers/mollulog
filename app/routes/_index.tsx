import { Suspense } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Await, Link, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventHeader, RecruitmentCard } from "~/components/features/events";
import { MobileMoreTabNoticeBanner } from "~/components/features/layout";
import { RaidCard } from "~/components/features/raids";
import { HorizontalScroll, SubTitle, Title } from "~/components/primitives";
import { raidTypeToParam } from "~/domain/raid";
import { withD1Session } from "~/lib/d1-session";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import { getCommunityFeedPage } from "~/models/community";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import type { TimelineContent } from "~/models/timeline-content";
import { getHomeYoutubeSections } from "~/models/youtube";
import { enrichCommunityFeedPosts } from "~/views/community";
import { getIndexContents, type IndexRecruitment } from "~/views/home";
import HomeRightRail, { HomeRightRailSkeleton } from "./_index._components/HomeRightRail";

const homeMoreMenuBannerDismissalStorageKey = "home::dismissed-more-menu-banner";

export const meta: MetaFunction = ({ location }) => {
  return [
    { title: "몰루로그 - 블루 아카이브 미래시/통계 정보 모음" },
    {
      name: "description",
      content: "게임 <블루 아카이브>의 컨텐츠, 통계 정보 등을 확인하고 미래시 계획을 관리해보세요.",
    },
    canonicalLink(location.pathname),
  ];
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const ctx: ExecutionContext = context.cloudflare.ctx;
  const logger = getLogger(env, ctx, { route: "_index.loader" });

  return ctx.tracing.enterSpan("_index.loader", async (span) => {
    const currentUser = await ctx.tracing.enterSpan("auth", () => getActiveSensei(env, request));
    const currentUserId = currentUser?.id;
    const publicReadEnv = withD1Session(env, "first-unconstrained");

    const indexContentsPromise = ctx.tracing.enterSpan("index_contents", () =>
      getIndexContents(publicReadEnv, false, ctx),
    );
    const recentCommunityPagePromise = ctx.tracing.enterSpan("community", () =>
      getCommunityFeedPage(env, {
        currentUserId,
        postTypes: ["student_review", "event_opinion"],
        pageSize: 4,
        includeEngagement: false,
        ctx,
      }),
    );
    const recentCommunityFeedPromise = recentCommunityPagePromise.then((recentCommunityPage) =>
      ctx.tracing.enterSpan("enrich", () => enrichCommunityFeedPosts(env, recentCommunityPage.items)),
    );
    const recentCommunityRailPromise = recentCommunityFeedPromise
      .then((recentCommunityFeed) => ({
        recentCommunityPosts: recentCommunityFeed.posts,
        studentsByUid: recentCommunityFeed.studentsByUid,
      }))
      .catch((error) => {
        logger.error("Failed to load home community rail", error);
        return {
          recentCommunityPosts: [],
          studentsByUid: {},
        };
      });
    const youtubeSectionsPromise = ctx.tracing.enterSpan("youtube", () =>
      getHomeYoutubeSections(env, ctx).catch((error) => {
        logger.error("Failed to load home youtube sections", error);
        return [];
      }),
    );
    const favoritedStudentsPromise = currentUserId
      ? ctx.tracing.enterSpan("favorites", () => getUserFavoritedStudents(env, currentUserId))
      : Promise.resolve([]);
    const rightRailPromise = ctx.tracing.enterSpan("index_right_rail", () =>
      Promise.all([recentCommunityRailPromise, youtubeSectionsPromise]).then(([communityRail, youtubeSections]) => ({
        ...communityRail,
        youtubeSections,
      })),
    );

    const [{ mainEvent, currentRaids, currentRecruitments, favoritedCounts }, favoritedStudents] = await Promise.all([
      indexContentsPromise,
      favoritedStudentsPromise,
    ]);
    const favoritedStudentUids = currentUserId
      ? favoritedStudents
          .filter((favorited) =>
            currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId),
          )
          .map((favorited) => favorited.studentId)
      : [];

    // ========== Raids ==========
    const currentTotalAssualt = currentRaids.find(
      (raid) => raid.raidType === "total_assault" || raid.raidType === "elimination",
    );
    const currentUnlimit = currentRaids.find((raid) => raid.raidType === "unlimit");

    span.setAttribute("signedIn", currentUser !== null);

    return {
      mainEvent,
      currentRecruitments,
      favoritedCounts,
      favoritedStudentUids,
      currentTotalAssualt,
      currentUnlimit,
      rightRail: rightRailPromise,
      signedIn: currentUser !== null,
    };
  });
};

export default function Index() {
  const {
    mainEvent,
    currentRecruitments,
    favoritedCounts,
    favoritedStudentUids,
    currentTotalAssualt,
    currentUnlimit,
    rightRail,
    signedIn,
  } = useLoaderData<typeof loader>();

  return (
    <div className="w-full">
      <Title text="진행중인 컨텐츠" />

      <div className="mt-4 flex flex-col gap-8 lg:mt-6 lg:flex-row lg:items-start lg:gap-6 xl:gap-8">
        <div className="min-w-0 lg:flex-1">
          <MainEvent event={mainEvent} />

          <MobileMoreTabNoticeBanner
            className="mt-2"
            dismissStorageKey={homeMoreMenuBannerDismissalStorageKey}
            message={'전체 메뉴는 "더보기" 탭에서 확인할 수 있어요'}
          />

          {currentRecruitments.length > 0 && (
            <CurrentRecruitments
              recruitments={currentRecruitments}
              favoritedStudentUids={favoritedStudentUids}
              favoritedCounts={favoritedCounts}
              signedIn={signedIn}
            />
          )}

          <div className="my-6 grid grid-cols-1 gap-2 md:grid-cols-2">
            {currentTotalAssualt && (
              <Link
                to={`/raids/${raidTypeToParam(currentTotalAssualt.raidType)}/${currentTotalAssualt.seasonIndex}`}
                className="block rounded-lg shadow-md shadow-black/5 transition-shadow hover:shadow-lg hover:shadow-black/10 dark:shadow-md dark:shadow-black/20 dark:hover:shadow-lg dark:hover:shadow-black/30"
              >
                <RaidCard raid={currentTotalAssualt} timeLocaleType="relative" />
              </Link>
            )}
            {currentUnlimit && (
              <Link
                to={`/raids/${raidTypeToParam(currentUnlimit.raidType)}/${currentUnlimit.seasonIndex}`}
                className="block rounded-lg shadow-md shadow-black/5 transition-shadow hover:shadow-lg hover:shadow-black/10 dark:shadow-md dark:shadow-black/20 dark:hover:shadow-lg dark:hover:shadow-black/30"
              >
                <RaidCard raid={currentUnlimit} timeLocaleType="relative" />
              </Link>
            )}
          </div>
        </div>
        <div className="min-w-0 lg:w-full lg:max-w-72 xl:max-w-xs lg:flex-none">
          <Suspense fallback={<HomeRightRailSkeleton />}>
            <Await resolve={rightRail}>
              {({ recentCommunityPosts, studentsByUid, youtubeSections }) => (
                <HomeRightRail
                  recentCommunityPosts={recentCommunityPosts}
                  signedIn={signedIn}
                  studentsByUid={studentsByUid}
                  youtubeSections={youtubeSections}
                />
              )}
            </Await>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function MainEvent({ event }: { event: TimelineContent | null }) {
  if (!event) {
    return (
      <div className="rounded-lg bg-card p-8 text-center shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
        <p className="text-muted-foreground">현재 진행중인 이벤트가 없어요</p>
      </div>
    );
  }

  return (
    <Link
      to={`/events/${event.uid}`}
      className="block rounded-lg shadow-md shadow-black/5 transition-shadow hover:shadow-lg hover:shadow-black/10 dark:shadow-md dark:shadow-black/20 dark:hover:shadow-lg dark:hover:shadow-black/30"
    >
      <EventHeader
        name={event.name}
        type={event.contentType}
        runType={event.runType}
        since={event.startAt}
        until={event.endAt}
        endless={event.endless}
        imageUrl={event.imageUrl}
      />
    </Link>
  );
}

type CurrentRecruitmentsProps = {
  recruitments: { eventUid: string; recruitment: IndexRecruitment }[];
  favoritedStudentUids: string[];
  favoritedCounts: { studentId: string; contentId: string; count: number }[];
  signedIn: boolean;
};

function CurrentRecruitments({
  recruitments,
  favoritedStudentUids,
  favoritedCounts,
  signedIn,
}: CurrentRecruitmentsProps) {
  const recruitmentCards = recruitments.map(({ eventUid, recruitment }) => {
    const favorited = favoritedStudentUids.includes(recruitment.favoriteKey);
    const favoritedCount =
      favoritedCounts.find(
        (favorited) => favorited.studentId === recruitment.favoriteKey && favorited.contentId === eventUid,
      )?.count ?? 0;

    return (
      <RecruitmentCard
        key={`${eventUid}-${recruitment.favoriteKey}`}
        recruitment={{
          ...recruitment,
          favorited,
          favoritedCount,
        }}
        signedIn={signedIn}
        favoriteAction="/api/contents"
        favoriteContentUid={eventUid}
        className="w-full md:w-28"
      />
    );
  });

  return (
    <div className="my-8">
      <SubTitle text="모집중인 학생" />
      <div className="md:hidden">
        <HorizontalScroll
          itemWidth={{ mobile: "w-24", desktop: "md:w-24" }}
          gap="gap-2"
          className="-mx-4 px-4"
          fadeEdges
        >
          {recruitmentCards}
        </HorizontalScroll>
      </div>
      <div className="hidden md:flex md:flex-wrap md:gap-3">{recruitmentCards}</div>
    </div>
  );
}
