import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { BookOpenIcon, FireIcon, IdentificationIcon, TicketIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventHeader, RecruitmentCard } from "~/components/features/events";
import { RaidCard } from "~/components/features/raids";
import { HorizontalScroll, SubTitle, Title } from "~/components/primitives";
import { getLogger } from "~/lib/observability.server";
import { getCommunityFeedPage } from "~/models/community";
import { enrichCommunityFeedPosts } from "~/models/community-feed";
import { type IndexRecruitment, getIndexContents } from "~/models/content";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { raidTypeToParam } from "~/models/raid";
import type { TimelineContent } from "~/models/timeline-content";
import { getHomeYoutubeSections } from "~/models/youtube";
import HomeRightRail from "./_index._components/HomeRightRail";

export const meta: MetaFunction = () => {
  return [
    { title: "몰루로그 - 블루 아카이브 미래시/통계 정보 모음" },
    {
      name: "description",
      content: "게임 <블루 아카이브>의 컨텐츠, 통계 정보 등을 확인하고 미래시 계획을 관리해보세요.",
    },
  ];
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "_index.loader" });
  const currentUser = await getActiveSensei(env, request);

  const [{ mainEvent, currentRaids, currentRecruitments, favoritedCounts }, recentCommunityPage, youtubeSections] =
    await Promise.all([
      getIndexContents(env),
      getCommunityFeedPage(env, {
        currentUserId: currentUser?.id,
        postTypes: ["student_review", "event_opinion"],
        pageSize: 4,
        includeEngagement: false,
      }),
      getHomeYoutubeSections(env).catch((error) => {
        logger.error("Failed to load home youtube sections", error);
        return [];
      }),
    ]);
  const recentCommunityFeed = await enrichCommunityFeedPosts(env, recentCommunityPage.items);
  const favoritedStudentUids = currentUser
    ? (await getUserFavoritedStudents(env, currentUser.id))
        .filter((favorited) => currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId))
        .map((favorited) => favorited.studentId)
    : [];

  // ========== Raids ==========
  const currentTotalAssualt = currentRaids.find(
    (raid) => raid.raidType === "total_assault" || raid.raidType === "elimination",
  );
  const currentUnlimit = currentRaids.find((raid) => raid.raidType === "unlimit");
  return {
    mainEvent,
    currentRecruitments,
    favoritedCounts,
    favoritedStudentUids,
    currentTotalAssualt,
    currentUnlimit,
    recentCommunityPosts: recentCommunityFeed.posts,
    studentsByUid: recentCommunityFeed.studentsByUid,
    signedIn: currentUser !== null,
    youtubeSections,
  };
};

export default function Index() {
  const {
    mainEvent,
    currentRecruitments,
    favoritedCounts,
    favoritedStudentUids,
    currentTotalAssualt,
    currentUnlimit,
    recentCommunityPosts,
    signedIn,
    studentsByUid,
    youtubeSections,
  } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-6 xl:gap-8">
      <div className="min-w-0 lg:flex-1">
        <Title text="진행중인 컨텐츠" />

        <MainEvent event={mainEvent} />

        <div className="my-4 lg:hidden grid grid-cols-2 gap-2">
          <LinkCard Icon={IdentificationIcon} title="학생부" description="통계 및 평가" to="/students" />
          <LinkCard Icon={FireIcon} title="총력전/대결전" description="상위권 편성" to="/raids" />
          <LinkCard Icon={BookOpenIcon} title="메인 스토리" description="공개 일정" to="/mainstory" />
          <LinkCard Icon={TicketIcon} title="쿠폰" description="인게임 쿠폰" to="/coupons" />
        </div>

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
              className="hover:opacity-75 transition-opacity"
            >
              <RaidCard raid={currentTotalAssualt} timeLocaleType="relative" />
            </Link>
          )}
          {currentUnlimit && (
            <Link
              to={`/raids/${raidTypeToParam(currentUnlimit.raidType)}/${currentUnlimit.seasonIndex}`}
              className="hover:opacity-75 transition-opacity"
            >
              <RaidCard raid={currentUnlimit} timeLocaleType="relative" />
            </Link>
          )}
        </div>
      </div>
      <div className="min-w-0 lg:w-full lg:max-w-72 xl:max-w-xs lg:flex-none">
        <HomeRightRail
          recentCommunityPosts={recentCommunityPosts}
          signedIn={signedIn}
          studentsByUid={studentsByUid}
          youtubeSections={youtubeSections}
        />
      </div>
    </div>
  );
}

function MainEvent({ event }: { event: TimelineContent | null }) {
  if (!event) {
    return (
      <div className="my-8 p-8 text-center border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800">
        <p className="text-neutral-600 dark:text-neutral-400">현재 진행중인 이벤트가 없어요</p>
      </div>
    );
  }

  return (
    <div className="my-8">
      <Link to={`/events/${event.uid}`} className="block hover:opacity-75 transition-opacity">
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
    </div>
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

type LinkCardProps = {
  Icon: React.ElementType;
  title: string;
  description: string;
  to: string;
};

function LinkCard({ Icon, title, description, to }: LinkCardProps) {
  return (
    <Link to={to} className="block group">
      <div className="flex items-center justify-between p-3 lg:p-4 bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors rounded-lg">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg">
            <Icon className="size-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm md:text-base font-bold">{title}</p>
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
          </div>
        </div>
        <ArrowRightIcon
          className="hidden md:block size-4 text-neutral-500 dark:text-neutral-400 group-hover:translate-x-1 transition-transform duration-200"
          strokeWidth={2}
        />
      </div>
    </Link>
  );
}
