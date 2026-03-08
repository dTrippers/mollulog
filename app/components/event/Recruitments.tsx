import { useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import { ChevronRightIcon, ClockIcon, StarIcon, XCircleIcon } from "@heroicons/react/16/solid";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import dayjs from "dayjs";
import { SubTitle } from "~/components/atoms/typography";
import { studentImageUrl } from "~/models/assets";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  recruitmentLabelLocale,
  roleColor,
  roleLocale,
} from "~/locales/ko";
import type { RecruitmentTypeEnum, Attack, Defense } from "~/graphql/graphql";
import type { Role } from "~/models/content.d";
import { useSignIn } from "~/contexts/SignInProvider";
import { sanitizeClassName } from "~/prophandlers";
import OptionBadge from "../atoms/student/OptionBadge";
import EventInfoCard from "./EventInfoCard";

type Recruitment = {
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: Date;
  until: Date | null;
  studentName: string;
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
  favorite?: { studentUid: string; favorited: boolean };
};

export default function Recruitments({ recruitments, signedIn }: RecruitmentsProps) {
  const groups = useMemo(() => {
    const pickupRecruitments = recruitments.filter(
      ({ pickup, recruitmentType }) => pickup || recruitmentType === "given",
    );

    const grouped = pickupRecruitments.reduce(
      (acc, recruitment) => {
        const key = `${recruitment.since}-${recruitment.until}`;
        if (!acc[key]) {
          acc[key] = { since: recruitment.since, until: recruitment.until, recruitments: [] };
        }
        acc[key].recruitments.push(recruitment);
        return acc;
      },
      {} as Record<string, { since: Date; until: Date | null; recruitments: Recruitment[] }>,
    );

    return Object.values(grouped);
  }, [recruitments]);

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
                  {dayjs(group.since).format("M월 D일")}
                  {group.until ? ` ~ ${dayjs(group.until).format("M월 D일")}` : ""}
                </p>
              )}

              {/* Mobile: vertical list */}
              <div className="flex flex-col gap-2 md:hidden">
                {group.recruitments.map((recruitment) => (
                  <MobileRecruitmentRow
                    key={recruitment.student?.uid ?? recruitment.studentName}
                    recruitment={recruitment}
                    signedIn={signedIn}
                  />
                ))}
              </div>

              {/* Desktop: horizontal cards */}
              <div className="hidden md:flex flex-wrap gap-3">
                {group.recruitments.map((recruitment) => (
                  <DesktopRecruitmentCard
                    key={recruitment.student?.uid ?? recruitment.studentName}
                    recruitment={recruitment}
                    signedIn={signedIn}
                  />
                ))}
              </div>
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
          <div className="flex flex-col gap-2 md:hidden">
            {limitedRecruitments.map((recruitment) => (
              <MobileRecruitmentRow
                key={recruitment.student?.uid ?? recruitment.studentName}
                recruitment={recruitment}
                signedIn={signedIn}
              />
            ))}
          </div>
          <div className="hidden md:flex flex-wrap gap-3">
            {limitedRecruitments.map((recruitment) => (
              <DesktopRecruitmentCard
                key={recruitment.student?.uid ?? recruitment.studentName}
                recruitment={recruitment}
                signedIn={signedIn}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MobileRecruitmentRow({ recruitment, signedIn }: { recruitment: Recruitment; signedIn: boolean }) {
  const studentUid = recruitment.student?.uid ?? null;
  const { attackType, defenseType, role } = recruitment.student ?? {};
  const { showSignIn } = useSignIn();

  const [favorited, setFavorited] = useState(recruitment.favorited);
  const [favoritedCount, setFavoritedCount] = useState(recruitment.favoritedCount);
  const fetcher = useFetcher();

  const toggleFavorite = () => {
    const next = !favorited;
    setFavorited(next);
    setFavoritedCount((c) => c + (next ? 1 : -1));
    const data: ActionData = { favorite: { studentUid: studentUid ?? "", favorited: next } };
    fetcher.submit(data, { method: "post", encType: "application/json" });
  };

  return (
    <div className="relative flex items-center gap-4 p-3 bg-neutral-100 dark:bg-neutral-900 rounded-xl pr-20">
      <div className="w-14 shrink-0">
        <img
          src={studentImageUrl(studentUid ?? "unlisted")}
          alt={recruitment.studentName}
          className="w-full rounded-lg object-cover"
          loading="lazy"
        />
      </div>
      <div className="grow min-w-0">
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
          {recruitmentLabelLocale(recruitment)}
        </p>
        <Link
          to={`/students/${studentUid}`}
          className="flex items-center gap-0.5 hover:underline font-semibold"
        >
          <span className="truncate">{recruitment.studentName}</span>
          {studentUid && <ChevronRightIcon className="size-4 shrink-0" />}
        </Link>
        {attackType && defenseType && role && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <OptionBadge text={attackTypeLocale[attackType]} color={attackTypeColor[attackType]} />
            <OptionBadge text={defenseTypeLocale[defenseType]} color={defenseTypeColor[defenseType]} />
            <OptionBadge text={roleLocale[role]} color={roleColor[role]} />
          </div>
        )}
      </div>
      {studentUid && (
        <button
          type="button"
          className={sanitizeClassName(`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-1 rounded-xl text-sm font-semibold transition-all ${
            favorited
              ? "bg-gradient-to-r from-red-500 to-pink-500 text-white shadow shadow-red-500/25"
              : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700"
          }`)}
          onClick={() => (signedIn ? toggleFavorite() : showSignIn())}
        >
          {favorited ? <HeartIconSolid className="size-3.5" /> : <HeartIconOutline className="size-3.5" strokeWidth={2} />}
          <span>{favoritedCount}</span>
        </button>
      )}
    </div>
  );
}

function DesktopRecruitmentCard({ recruitment, signedIn }: { recruitment: Recruitment; signedIn: boolean }) {
  const studentUid = recruitment.student?.uid ?? null;
  const { attackType, defenseType, role } = recruitment.student ?? {};
  const { showSignIn } = useSignIn();

  const [favorited, setFavorited] = useState(recruitment.favorited);
  const [favoritedCount, setFavoritedCount] = useState(recruitment.favoritedCount);
  const fetcher = useFetcher();

  const toggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    const next = !favorited;
    setFavorited(next);
    setFavoritedCount((c) => c + (next ? 1 : -1));
    const data: ActionData = { favorite: { studentUid: studentUid ?? "", favorited: next } };
    fetcher.submit(data, { method: "post", encType: "application/json" });
  };

  const [mainName, skinName] = recruitment.studentName.split("(");
  const trimmedSkinName = skinName?.replace(")", "").trim();

  return (
    <div className="w-32 flex flex-col bg-neutral-100 dark:bg-neutral-900 rounded-xl overflow-hidden">
      {/* Image with overlay */}
      <div className="relative w-full overflow-hidden aspect-200/226">
        <img
          src={studentImageUrl(studentUid ?? "unlisted")}
          alt={recruitment.studentName}
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />

        {/* Label: top-right */}
        <div className="absolute top-1 right-1.5">
          <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-md leading-tight">
            {recruitmentLabelLocale(recruitment)}
          </span>
        </div>

        {/* Name: bottom overlay with long gradient */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-100 via-neutral-100/75 dark:from-neutral-900 dark:via-neutral-900/75 via-75% to-transparent pt-2 px-2">
          {trimmedSkinName && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-tight">{trimmedSkinName}</p>
          )}
          <p className="font-bold text-neutral-900 dark:text-neutral-100 text-base leading-tight line-clamp-1">{mainName.trim()}</p>
        </div>
      </div>

      {/* Badges + favorite */}
      <div className="p-1.5 flex flex-col gap-1.5">
        {attackType && defenseType && role && (
          <div className="flex flex-wrap gap-0.5">
            <OptionBadge text={attackTypeLocale[attackType]} color={attackTypeColor[attackType]} />
            <OptionBadge text={defenseTypeLocale[defenseType].slice(0, 2)} color={defenseTypeColor[defenseType]} />
            <OptionBadge text={roleLocale[role]} color={roleColor[role]} />
          </div>
        )}

        {studentUid && (
          <Link
            to={`/students/${studentUid}`}
            className="inline-flex items-center justify-center w-full py-1 rounded-lg text-xs font-medium transition-all bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700"
          >
            상세 / 통계 정보
          </Link>
        )}

        {studentUid && (
          <button
            type="button"
            className={sanitizeClassName(`inline-flex items-center justify-center gap-1.5 w-full py-1 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              favorited
                ? "bg-gradient-to-r from-red-500 to-pink-500 text-white shadow shadow-red-500/25 hover:shadow-red-500/40 hover:brightness-110"
                : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-950/40 dark:hover:text-red-400 dark:hover:border-red-800"
            }`)}
            onClick={(e) => (signedIn ? toggleFavorite(e) : showSignIn())}
          >
            {favorited ? <HeartIconSolid className="size-3.5" /> : <HeartIconOutline className="size-3.5" strokeWidth={2} />}
            <span>{favoritedCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}
