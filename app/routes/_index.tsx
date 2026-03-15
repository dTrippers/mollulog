import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { CalendarIcon, IdentificationIcon } from "@heroicons/react/24/outline";
import { HeartIcon as FilledHeartIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { EventHeader } from "~/components/features/events";
import EventList from "~/components/features/events/EventList";
import { RaidCard } from "~/components/features/raids";
import { ProfileImage, SubTitle, Title } from "~/components/primitives";
import { recruitmentLabelLocale } from "~/locales/ko";
import { type IndexRecruitment, getIndexContents } from "~/models/content";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getAllStudentsMap } from "~/models/student";
import { getRecentStudentGradingsWithUsers } from "~/models/student-grading";
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
  const { env } = context.cloudflare;

  const [
    { mainEvent, currentRaids, currentEvents, currentRecruitments, favoritedCounts },
    recentGradings,
    allStudentsMap,
    youtubeSections,
  ] = await Promise.all([
    getIndexContents(env),
    getRecentStudentGradingsWithUsers(env, 3, true),
    getAllStudentsMap(env, true),
    getHomeYoutubeSections(env).catch((error) => {
      console.error("Failed to load home youtube sections", error);
      return [];
    }),
  ]);
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const favoritedStudentUids = currentUser
    ? (await getUserFavoritedStudents(env, currentUser.id))
        .filter((favorited) => currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId))
        .map((favorited) => favorited.studentId)
    : [];

  // ========== Raids ==========
  const currentTotalAssualt = currentRaids.find((raid) => raid.type === "total_assault" || raid.type === "elimination");
  const currentUnlimit = currentRaids.find((raid) => raid.type === "unlimit");
  return {
    mainEvent,
    currentEvents: currentEvents
      .filter((event) => event.uid !== mainEvent?.uid)
      .map((event) => ({
        uid: event.uid,
        name: event.name,
        type: event.contentType,
        since: event.startAt,
        until: event.endAt ?? event.startAt,
        imageUrl: event.imageUrl,
      })),
    currentRecruitments,
    favoritedCounts,
    favoritedStudentUids,
    currentTotalAssualt,
    currentUnlimit,
    recentGradings: recentGradings.map((grading) => ({
      ...grading,
      student: allStudentsMap[grading.studentUid]
        ? { uid: grading.studentUid, name: allStudentsMap[grading.studentUid].name }
        : undefined,
    })),
    youtubeSections,
  };
};

export default function Index() {
  const {
    mainEvent,
    currentEvents,
    currentRecruitments,
    favoritedCounts,
    favoritedStudentUids,
    currentTotalAssualt,
    currentUnlimit,
    recentGradings,
    youtubeSections,
  } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 xl:flex-row xl:items-start">
      <div className="min-w-0 xl:flex-1">
        <Title text="진행중인 컨텐츠" />

        <MainEvent event={mainEvent} />
        <EventList events={currentEvents} />
        <div className="grid grid-cols-2 gap-2 xl:hidden">
          <LinkCard Icon={CalendarIcon} title="미래시" description="컨텐츠 및 픽업 일정" to="/futures" />
          <LinkCard Icon={IdentificationIcon} title="학생부" description="통계 및 평가 정보" to="/students" />
        </div>

        {currentRecruitments.length > 0 && (
          <CurrentRecruitments
            recruitments={currentRecruitments}
            favoritedStudentUids={favoritedStudentUids}
            favoritedCounts={favoritedCounts}
          />
        )}

        <SubTitle text="레이드" />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {currentTotalAssualt && (
            <Link to={`/raids/${currentTotalAssualt.uid}`} className="hover:opacity-75 transition-opacity">
              <RaidCard raid={currentTotalAssualt} timeLocaleType="relative" />
            </Link>
          )}
          {currentUnlimit && (
            <Link to={`/raids/${currentUnlimit.uid}`} className="hover:opacity-75 transition-opacity">
              <RaidCard raid={currentUnlimit} timeLocaleType="relative" />
            </Link>
          )}
        </div>
      </div>
      <div className="min-w-0 xl:w-full xl:max-w-xs xl:flex-none">
        <HomeRightRail recentGradings={recentGradings} youtubeSections={youtubeSections} />
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
  favoritedCounts: { studentId: string; count: number }[];
};

function CurrentRecruitments({ recruitments, favoritedStudentUids, favoritedCounts }: CurrentRecruitmentsProps) {
  const [showAll, setShowAll] = useState(false);

  const displayedRecruitments = showAll ? recruitments : recruitments.slice(0, 6);

  return (
    <div className="my-8">
      <SubTitle text="모집중인 학생" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {displayedRecruitments.map(({ recruitment }) => {
          const student = recruitment.student;
          if (!student) {
            return null;
          }

          const favorited = favoritedStudentUids.includes(student.uid);
          return (
            <Link to={`/students/${student.uid}`} key={student.uid} className="block">
              <div className="p-3 flex items-center gap-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors rounded-lg">
                <div className="relative">
                  <ProfileImage imageSize={12} studentUid={student.uid} />
                  <div className="absolute -bottom-1 -right-1">
                    <div
                      className={`text-xs relative flex items-center gap-0.5 ${favorited ? "bg-red-500/90" : "bg-neutral-900/90"} text-white rounded-lg px-1.5 border border-white dark:border-transparent`}
                    >
                      <FilledHeartIcon className="size-3" />
                      <span className="font-semibold">
                        {favoritedCounts.find((favorited) => favorited.studentId === student.uid)?.count ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grow">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {recruitmentLabelLocale(recruitment)}
                    {recruitment.pickup ? " • 픽업" : ""}
                  </p>
                  <p className="text-sm md:text-base font-semibold">{student.name}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {recruitments.length > 6 && (
        <button
          type="button"
          className="w-full my-4 py-2 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors rounded-lg text-neutral-500 dark:text-neutral-400 cursor-pointer"
          onClick={() => setShowAll(!showAll)}
        >
          <span className="text-sm mr-1">{showAll ? "접기" : `학생 ${recruitments.length}명 모두 보기`}</span>
          {showAll ? <ChevronUpIcon className="size-4 inline" /> : <ChevronDownIcon className="size-4 inline" />}
        </button>
      )}
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
    <Link to={to} className="my-4 block group">
      <div className="flex items-center justify-between p-3 xl:p-4 bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors rounded-lg">
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
