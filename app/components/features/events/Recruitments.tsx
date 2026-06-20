import { ClockIcon, StarIcon, XCircleIcon } from "@heroicons/react/16/solid";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import { AttributeBadge, HorizontalScroll, SubTitle } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import { type UtcIsoString, formatInstant, formatInstantDateKey } from "~/lib/date-time";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  recruitmentLabelLocale,
  roleColor,
  roleLocale,
} from "~/locales/ko";
import { studentImageUrl } from "~/models/assets";
import type { Role } from "~/models/content.d";
import { sanitizeClassName } from "~/prophandlers";
import EventInfoCard from "./EventInfoCard";

export type Recruitment = {
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  studentName: string;
  favoriteKey: string;
  student: {
    uid: string;
    attackType: Attack;
    defenseType: Defense;
    role: Role;
  } | null;
  favorited: boolean;
  favoritedCount: number;
};

type RecruitmentsProps = {
  recruitments: Recruitment[];
  signedIn: boolean;
};

type ActionData = {
  favorite?: { studentUid: string; contentUid?: string; favorited: boolean };
};

function getFavoriteButtonClassName(favorited: boolean) {
  return sanitizeClassName(
    `inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-all ${
      favorited
        ? "bg-gradient-to-r from-red-500 to-pink-500 text-white shadow shadow-red-500/25 hover:shadow-red-500/40 hover:brightness-110"
        : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-950/40 dark:hover:text-red-400 dark:hover:border-red-800"
    }`,
  );
}

function useRecruitmentFavorite(recruitment: Recruitment, favoriteAction?: string, favoriteContentUid?: string) {
  const studentUid = recruitment.student?.uid ?? null;
  const favoriteKey = recruitment.favoriteKey;
  const fetcher = useFetcher();
  const [favorited, setFavorited] = useState(recruitment.favorited);
  const [favoritedCount, setFavoritedCount] = useState(recruitment.favoritedCount);

  useEffect(() => {
    setFavorited(recruitment.favorited);
  }, [recruitment.favorited]);

  useEffect(() => {
    setFavoritedCount(recruitment.favoritedCount);
  }, [recruitment.favoritedCount]);

  const toggleFavorite = () => {
    const next = !favorited;
    setFavorited(next);
    setFavoritedCount((count) => count + (next ? 1 : -1));

    const data: ActionData = { favorite: { studentUid: favoriteKey, contentUid: favoriteContentUid, favorited: next } };
    fetcher.submit(data, { action: favoriteAction, method: "post", encType: "application/json" });
  };

  return {
    studentUid,
    favoriteKey,
    favorited,
    favoritedCount,
    toggleFavorite,
  };
}

function RecruitmentFavoriteButton({
  favorited,
  favoritedCount,
  onClick,
  className,
}: {
  favorited: boolean;
  favoritedCount: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={sanitizeClassName(`${getFavoriteButtonClassName(favorited)} ${className ?? ""}`)}
      onClick={onClick}
    >
      {favorited ? <HeartIconSolid className="size-3.5" /> : <HeartIconOutline className="size-3.5" strokeWidth={2} />}
      <span>{favoritedCount}</span>
    </button>
  );
}

export default function Recruitments({ recruitments, signedIn }: RecruitmentsProps) {
  const displayTimeZone = useDisplayTimeZone();
  const groups = useMemo(() => {
    const pickupRecruitments = recruitments.filter(
      ({ pickup, recruitmentType }) => pickup || recruitmentType === "given",
    );

    const grouped = pickupRecruitments.reduce(
      (acc, recruitment) => {
        const key = `${formatInstantDateKey(recruitment.since, displayTimeZone)}-${
          recruitment.until ? formatInstantDateKey(recruitment.until, displayTimeZone) : "null"
        }`;
        if (!acc[key]) {
          acc[key] = { since: recruitment.since, until: recruitment.until, recruitments: [] };
        }
        acc[key].recruitments.push(recruitment);
        return acc;
      },
      {} as Record<string, { since: UtcIsoString; until: UtcIsoString | null; recruitments: Recruitment[] }>,
    );

    return Object.values(grouped);
  }, [displayTimeZone, recruitments]);

  const limitedRecruitments = useMemo(
    () => recruitments.filter(({ pickup, recruitmentType }) => !pickup && recruitmentType !== "given"),
    [recruitments],
  );

  const showDateLabels = groups.length > 1;

  if (groups.length === 0 && limitedRecruitments.length === 0) {
    return null;
  }

  return (
    <>
      {groups.length > 0 && (
        <>
          <SubTitle text="모집 학생" />
          {recruitments.some(({ recruitmentType }) => recruitmentType === "fes") && (
            <EventInfoCard
              Icon={StarIcon}
              title="모집 확률 상승"
              description="★3 학생 모집 확률이 6%로 상승해요. 단, 픽업 확률은 유지돼요."
            />
          )}
          {recruitments.some(({ recruitmentType }) => recruitmentType === "archive") && (
            <>
              <EventInfoCard
                Icon={StarIcon}
                title="아카이브 모집"
                description="아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 모집에서 등장하지 않아요."
              />
              <EventInfoCard
                Icon={ClockIcon}
                title="모집 포인트 유지"
                description="모집 포인트(천장)은 만료되지 않고 무기한 유지돼요."
              />
            </>
          )}
          {recruitments.some(({ recruitmentType }) => recruitmentType === "recollect") && (
            <EventInfoCard
              Icon={StarIcon}
              title="리콜렉트 모집"
              description="아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 페스 모집에서 등장하지 않아요."
            />
          )}
          {recruitments.some(({ recruitmentType }) => recruitmentType === "encore") && (
            <EventInfoCard
              Icon={StarIcon}
              title="앙코르 모집"
              description="아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 한정 픽업을 진행하지 않아요."
            />
          )}
          {groups.map((group) => (
            <div key={`${group.since}-${group.until}`} className="mb-6">
              {showDateLabels && (
                <p className="mb-3 font-semibold text-sm text-neutral-600 dark:text-neutral-400">
                  {formatInstant(group.since, { timeZone: displayTimeZone, format: "M월 D일" })}
                  {group.until
                    ? ` ~ ${formatInstant(group.until, { timeZone: displayTimeZone, format: "M월 D일" })}`
                    : ""}
                </p>
              )}

              <RecruitmentCardList recruitments={group.recruitments} signedIn={signedIn} />
            </div>
          ))}
        </>
      )}

      {limitedRecruitments.length > 0 && (
        <>
          <SubTitle text="기간 한정 모집 학생" />
          <EventInfoCard
            Icon={XCircleIcon}
            title="모집 포인트(천장) 교환 불가"
            description="아래 학생들은 모집 포인트(천장)로는 교환할 수 없어요"
          />
          <RecruitmentCardList recruitments={limitedRecruitments} signedIn={signedIn} />
        </>
      )}
    </>
  );
}

function RecruitmentCardList({
  recruitments,
  signedIn,
}: {
  recruitments: Recruitment[];
  signedIn: boolean;
}) {
  const recruitmentCards = recruitments.map((recruitment) => (
    <RecruitmentCard
      key={recruitment.favoriteKey}
      recruitment={recruitment}
      signedIn={signedIn}
      className="w-full md:w-28"
    />
  ));

  return (
    <>
      <div className="md:hidden">
        <HorizontalScroll
          itemWidth={{ mobile: "w-28", desktop: "md:w-28" }}
          gap="gap-2"
          className="-mx-4 px-4"
          fadeEdges
        >
          {recruitmentCards}
        </HorizontalScroll>
      </div>
      <div className="hidden md:flex md:flex-wrap md:gap-3">{recruitmentCards}</div>
    </>
  );
}

export function RecruitmentCard({
  recruitment,
  signedIn,
  favoriteAction,
  favoriteContentUid,
  className,
}: {
  recruitment: Recruitment;
  signedIn: boolean;
  favoriteAction?: string;
  favoriteContentUid?: string;
  className?: string;
}) {
  const { attackType, defenseType, role } = recruitment.student ?? {};
  const { showSignIn } = useSignIn();
  const { studentUid, favoriteKey, favorited, favoritedCount, toggleFavorite } = useRecruitmentFavorite(
    recruitment,
    favoriteAction,
    favoriteContentUid,
  );

  const [mainName, skinName] = recruitment.studentName.split("(");
  const trimmedSkinName = skinName?.replace(")", "").trim();

  return (
    <div
      className={sanitizeClassName(
        `w-28 flex flex-col bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-hidden ${className ?? ""}`,
      )}
    >
      <div className="relative w-full overflow-hidden aspect-200/226">
        <img
          src={studentImageUrl(studentUid ?? "unlisted")}
          alt={recruitment.studentName}
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />

        <div className="absolute top-0.5 right-0.5">
          <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-md leading-tight">
            {recruitmentLabelLocale(recruitment)}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-100 via-neutral-100/75 dark:from-neutral-900 dark:via-neutral-900/75 via-75% to-transparent pt-2 px-2">
          {trimmedSkinName && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-tight">{trimmedSkinName}</p>
          )}
          <p className="font-bold text-neutral-900 dark:text-neutral-100 text-base leading-tight line-clamp-1">
            {mainName.trim()}
          </p>
        </div>
      </div>

      <div className="p-1.5 flex flex-col gap-1.5">
        {attackType && defenseType && role && (
          <div className="flex flex-wrap gap-0.5">
            <AttributeBadge text={attackTypeLocale[attackType]} color={attackTypeColor[attackType]} />
            <AttributeBadge text={defenseTypeLocale[defenseType].slice(0, 2)} color={defenseTypeColor[defenseType]} />
            <AttributeBadge text={roleLocale[role]} color={roleColor[role]} />
          </div>
        )}

        {studentUid && (
          <Link
            to={`/students/${studentUid}`}
            className="inline-flex items-center justify-center w-full py-1 rounded-lg text-xs font-medium transition-all bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700"
          >
            평가/통계
          </Link>
        )}

        {favoriteKey && (
          <RecruitmentFavoriteButton
            favorited={favorited}
            favoritedCount={favoritedCount}
            className="w-full py-0.5 cursor-pointer"
            onClick={() => (signedIn ? toggleFavorite() : showSignIn())}
          />
        )}
      </div>
    </div>
  );
}
