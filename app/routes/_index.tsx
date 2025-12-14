import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { CalendarIcon, IdentificationIcon } from "@heroicons/react/24/outline";
import { HeartIcon as FilledHeartIcon } from "@heroicons/react/24/solid";
import { ChevronDownIcon, ChevronUpIcon, ArrowRightIcon } from "@heroicons/react/16/solid";
import { getAuthenticator } from "~/auth/authenticator.server";
import { SubTitle, Title } from "~/components/atoms/typography";
import type { IndexQuery } from "~/graphql/graphql";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, pickupLabelLocale, raidTypeLocale, relativeTime } from "~/locales/ko";
import dayjs from "dayjs";
import { OptionBadge, ProfileImage } from "~/components/atoms/student";
import { useState } from "react";
import { EventHeader } from "~/components/event";
import type { DefenseType, RaidType } from "~/models/content.d";
import { bossImageUrl } from "~/models/assets";
import { getIndexContents } from "~/models/content";
import EventList from "~/components/event/EventList";

export const meta: MetaFunction = () => {
  return [
    { title: "몰루로그 - 블루 아카이브 미래시/통계 정보 모음" },
    { name: "description", content: "게임 <블루 아카이브>의 컨텐츠, 통계 정보 등을 확인하고 미래시 계획을 관리해보세요." },
  ];
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;

  const { mainEvent, currentRaids, currentEvents, currentPickups, favoritedCounts } = await getIndexContents(env);
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const favoritedStudentUids = currentUser ?
    (await getUserFavoritedStudents(env, currentUser.id)).filter((favorited) => currentPickups.some((pickup) => pickup.eventUid === favorited.contentId)).map((favorited) => favorited.studentId) :
    [];

  // ========== Raids ==========
  const currentTotalAssualt = currentRaids.find((raid) => raid.type === "total_assault" || raid.type === "elimination");
  const currentUnlimit = currentRaids.find((raid) => raid.type === "unlimit");
  return {
    mainEvent,
    currentEvents: currentEvents.filter((event) => (event.uid !== mainEvent?.uid)),
    currentPickups,
    favoritedCounts,
    favoritedStudentUids,
    currentTotalAssualt,
    currentUnlimit,
  };
}

export default function Index() {
  const { mainEvent, currentEvents, currentPickups, favoritedCounts, favoritedStudentUids, currentTotalAssualt, currentUnlimit } = useLoaderData<typeof loader>();

  return (
    <>
      <Title text="진행중인 컨텐츠" />

      <MainEvent event={mainEvent} />
      <EventList events={currentEvents} />
      <div className="grid grid-cols-2 gap-2">
        <LinkCard Icon={CalendarIcon} title="미래시" description="컨텐츠 및 픽업 일정" to="/futures" />
        <LinkCard Icon={IdentificationIcon} title="학생부" description="통계 및 평가 정보" to="/students" />
      </div>

      {CurrentPickups.length > 0 && (
        <CurrentPickups
          pickups={currentPickups}
          favoritedStudentUids={favoritedStudentUids}
          favoritedCounts={favoritedCounts}
        />
      )}

      <SubTitle text="레이드" />
      {currentTotalAssualt && <CurrentRaid {...currentTotalAssualt} />}
      {currentUnlimit && <CurrentRaid {...currentUnlimit} />}
    </>
  );
}

function MainEvent({ event }: { event: Exclude<IndexQuery["events"]["nodes"][0], null> | null }) {
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
        <EventHeader {...event} />
      </Link>
    </div>
  );
}

type CurrentPickupsProps = {
  pickups: { eventUid: string, pickup: IndexQuery["events"]["nodes"][0]["pickups"][0] }[];
  favoritedStudentUids: string[];
  favoritedCounts: { studentId: string, count: number }[];
};

function CurrentPickups({ pickups, favoritedStudentUids, favoritedCounts }: CurrentPickupsProps) {
  const [showAll, setShowAll] = useState(false);

  const displayedPickups = showAll ? pickups : pickups.slice(0, 6);

  return (
    <div className="my-8">
      <SubTitle text="픽업 모집" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {displayedPickups.map(({ pickup }) => {
          const student = pickup.student;
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
                    <div className={`text-xs relative flex items-center gap-0.5 ${favorited ? "bg-red-500/90" : "bg-neutral-900/90"} text-white rounded-lg px-1.5 border border-white dark:border-transparent`}>
                      <FilledHeartIcon className="size-3" />
                      <span className="font-semibold">
                        {favoritedCounts.find((favorited) => favorited.studentId === student.uid)?.count ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grow">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{pickupLabelLocale(pickup)}</p>
                  <p className="text-sm md:text-base font-semibold">{student.name}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {pickups.length > 6 && (
        <div
          className="w-full my-4 py-2 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors rounded-lg text-neutral-500 dark:text-neutral-400 cursor-pointer"
          onClick={() => setShowAll(!showAll)}
        >
          <span className="text-sm mr-1">{showAll ? "접기" : `픽업 학생 ${pickups.length}명 모두 보기`}</span>
          {showAll ? <ChevronUpIcon className="size-4 inline" /> : <ChevronDownIcon className="size-4 inline" />}
        </div>
      )}
    </div>
  );
}

type CurrentRaidProps = {
  type: RaidType;
  uid: string;
  name: string;
  boss: string;
  since: Date;
  until: Date;
  defenseTypes: { defenseType: DefenseType; difficulty: string | null }[];
}

function CurrentRaid({ type, uid, name, boss, since, until, defenseTypes }: CurrentRaidProps) {
  const sinceDayjs = dayjs(since);
  const untilDayjs = dayjs(until);
  const now = dayjs();

  let timeLabel = null;
  if (sinceDayjs.isAfter(now)) {
    timeLabel = `${relativeTime(sinceDayjs)} 시작`;
  } else if (untilDayjs.isAfter(now)) {
    timeLabel = `${relativeTime(untilDayjs)} 종료`;
  }

  return (
    <Link to={`/raids/${uid}`}>
      <div className="my-4 relative bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors border border-neutral-200 dark:border-neutral-700 rounded-lg">
        <img src={bossImageUrl(boss)} alt={`${name} 보스 이미지`} className="absolute right-0 top-0 h-full" />
        <div className="relative w-full p-4 bg-white/50 dark:bg-neutral-800/50 rounded-lg">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{raidTypeLocale[type]}</p>
          <p className="font-semibold">{name}</p>
          <div className="mt-2 flex gap-1 flex-wrap">
            {defenseTypes.map(({ defenseType, difficulty }) => (
              <OptionBadge
                key={defenseType}
                text={`${defenseTypeLocale[defenseType]}${difficulty ? ` / ${difficultyLocale[difficulty]}` : ""}`}
                color={defenseTypeColor[defenseType]}
                bgColor="light"
              />
            ))}
          </div>
          {timeLabel && (
            <div className="absolute top-0 right-0 p-3">
              <span className="flex items-center gap-1.5 px-2 md:px-3 py-0.5 text-xs md:text-sm bg-neutral-800/90 text-white rounded-full">
                {sinceDayjs.isBefore(now) && <div className="size-2 bg-red-500 rounded-full animate-pulse" />}
                {timeLabel}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
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
        <ArrowRightIcon className="hidden md:block size-4 text-neutral-500 dark:text-neutral-400 group-hover:translate-x-1 transition-transform duration-200" strokeWidth={2} />
      </div>
    </Link>
  );
}
