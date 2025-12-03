import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import dayjs from "dayjs";
import { ChevronRightIcon, ChartBarIcon, ClockIcon, CheckCircleIcon, ExclamationTriangleIcon, ChatBubbleOvalLeftEllipsisIcon, EyeIcon, EyeSlashIcon, CalculatorIcon } from "@heroicons/react/16/solid";
import { ArrowTopRightOnSquareIcon, IdentificationIcon, HeartIcon as EmptyHeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as FilledHeartIcon } from "@heroicons/react/24/solid";
import type { AttackType, DefenseType, EventType, PickupType, RaidType, Role, Terrain } from "~/models/content.d";
import { attackTypeColor, attackTypeLocale, contentTypeLocale, defenseTypeColor, defenseTypeLocale, pickupLabelLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import { StudentCards } from "~/components/molecules/student";
import { OptionBadge } from "~/components/atoms/student";
import { BottomSheet } from "~/components/atoms/layout";
import ContentCommentEditor from "./ContentCommentEditor";
import ContentCommentView from "./ContentCommentView";

export type ContentTimelineItemProps = {
  uid: string;
  name: string;
  contentType: EventType | RaidType;
  rerun: boolean;
  endless: boolean;
  since?: Date | null;
  until: Date | null;
  link: string;
  confirmed?: boolean;
  hasShopData?: boolean;

  allComments?: {
    uid: string;
    body: string;
    visibility: "private" | "public";
    createdAt: string;
    sensei: {
      username: string;
      profileStudentId: string | null;
      me: boolean;
    };
    subcomments?: {
      uid: string;
      body: string;
      visibility: "private" | "public";
      createdAt: string;
      sensei: {
        username: string;
        profileStudentId: string | null;
        me: boolean;
      };
    }[];
  }[];
  onCommentCreate?: (body: string, visibility: "private" | "public") => void;
  onCommentCreateSubcomment?: (parentCommentId: string, body: string, visibility: "private" | "public") => void;
  onCommentUpdate?: (commentUid: string, body: string, visibility: "private" | "public") => void;
  onCommentDelete?: (commentUid: string) => void;
  isSubmittingComment?: boolean;

  favoritedStudents?: string[];
  favoritedCounts?: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;

  pickups?: {
    type: PickupType;
    rerun: boolean;
    student: {
      uid: string;
      attackType?: AttackType;
      defenseType?: DefenseType;
      role?: Role;
      schaleDbId?: string | null;
    } | null;
    studentName: string;
    since: Date;
    until: Date | null;
  }[];
  raidInfo?: {
    uid: string;
    boss: string;
    terrain: Terrain;
    attackType: AttackType;
    defenseTypes: {
      defenseType: DefenseType;
      difficulty: string | null;
    }[];
    rankVisible: boolean;
  };

  signedIn: boolean;
};

function ContentTitles({ name, showLink }: { name: string, showLink: boolean }): ReactNode {
  const titles = name.split("\n");
  return (
    titles.map((titleLine, index) => {
      const key = `${name}-${index}`;
      if (index < titles.length - 1) {
        return <p key={key} className="text-lg md:text-xl font-semibold">{titleLine}</p>;
      } else {
        return (
          <div key={key} className="text-lg md:text-xl font-semibold flex items-center">
            <span className="inline">{titleLine}</span>
            {showLink && <ChevronRightIcon className="inline size-4" strokeWidth={2} />}
          </div>
        );
      }
    })
  )
}

const MEMO_CONTENT_TYPES = ["event", "pickup", "fes", "immortal_event", "main_story"];

export function ContentTimelineItem({
  name, contentType, rerun, endless, since, until, link, confirmed, hasShopData, raidInfo, pickups,
  allComments, onCommentCreate, onCommentCreateSubcomment, onCommentUpdate, onCommentDelete, isSubmittingComment, favoritedStudents, favoritedCounts, onFavorite, signedIn,
}: ContentTimelineItemProps) {
  const showComments = MEMO_CONTENT_TYPES.includes(contentType) && (pickups && pickups.length > 0);
  const [commentEditing, setCommentEditing] = useState(false);

  let daysLabel = null;
  const now = dayjs();
  const sinceDayjs = dayjs(since);
  const untilDayjs = dayjs(until);

  let finishSoon = false;
  if (since && until && sinceDayjs.isBefore(now)) {
    const remainingDays = untilDayjs.startOf("day").diff(now.startOf("day"), "day");
    if (remainingDays >= 2) {
      daysLabel = `${remainingDays}일`;
    } else {
      const remainingHours = untilDayjs.startOf("hour").diff(now.startOf("hour"), "hour");
      finishSoon = true;
      if (remainingHours > 24) {
        daysLabel = `내일 종료`;
      } else {
        daysLabel = `${remainingHours}시간 남음`;
      }
    }
  }

  const RaidInfo = () => raidInfo ? (
    <div className="mt-2 mb-6 relative md:w-96">
      <img
        className="md:w-96 rounded-lg bg-linear-to-br from-neutral-50 to-neutral-300 dark:from-neutral-600 dark:to-neutral-800"
        src={bossImageUrl(raidInfo.boss)} alt={`총력전 보스 ${name}`} loading="lazy"
      />
      <div className="absolute bottom-0 right-0 flex flex-col items-end gap-y-1 p-1 text-white text-sm">
        <div className="flex gap-x-1">
          <OptionBadge text={terrainLocale[raidInfo.terrain]} bgColor="dark" />
          <OptionBadge text={attackTypeLocale[raidInfo.attackType]} color={attackTypeColor[raidInfo.attackType]} bgColor="dark" />
          {raidInfo.defenseTypes.length === 1 && (
            <OptionBadge
              text={defenseTypeLocale[raidInfo.defenseTypes[0].defenseType]}
              color={defenseTypeColor[raidInfo.defenseTypes[0].defenseType]}
              bgColor="dark"
            />
          )}
        </div>
        {raidInfo.defenseTypes.length > 1 && (
          <div className="flex gap-x-1">
            {raidInfo.defenseTypes.map(({ defenseType }) => (
              <OptionBadge key={defenseType} text={defenseTypeLocale[defenseType]} color={defenseTypeColor[defenseType]} bgColor="dark" />
            ))}
          </div>
        )}
      </div>
      
    </div>
  ) : null;

  const pickupSince = pickups?.[0]?.since;
  const pickupUntil = pickups?.[0]?.until;
  const isPickupDayDifferent = pickupSince && pickupUntil &&
    (!dayjs(pickupSince).isSame(dayjs(since), "day") || !dayjs(pickupUntil).isSame(dayjs(until), "day"));

  return (
    <div className="my-4 md:my-6">
      {/* 컨텐츠 분류 */}
      <div className="flex items-center gap-x-1 md:my-1">
        <div className="my-1 flex flex-wrap gap-1 text-sm">
          <span className="pr-1 py-0.5 text-neutral-500 dark:text-neutral-400">
            {(contentType === "event" || contentType === "pickup") && rerun && "복각 "}{contentTypeLocale[contentType]}
          </span>
          {!endless && daysLabel && (
            <span className={`flex items-center px-2 py-0.5 rounded-full ${finishSoon ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-neutral-100 dark:bg-neutral-700"}`}>
              <ClockIcon className="inline size-4 mr-1" />
              {daysLabel}
            </span>
          )}
          {confirmed && (since && sinceDayjs.isAfter(now)) && (
            <span className="flex items-center px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
              <CheckCircleIcon className="inline size-4 mr-1" />
              확정
            </span>
          )}
          {raidInfo && raidInfo.rankVisible && (
            <span className="flex items-center px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200">
              <ChartBarIcon className="inline size-4 mr-1" />
              순위 정보
            </span>
          )}
          {hasShopData && (
            <span className="flex items-center px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200">
              <CalculatorIcon className="inline size-4 mr-1" />
              소탕 계산기
            </span>
          )}
        </div>
      </div>

      {/* 컨텐츠 이름 */}
      <Link to={link} className="cursor-pointer hover:underline tracking-tight">
        <ContentTitles name={name} showLink={true} />
        <RaidInfo />
      </Link> 

      {/* 픽업 정보 */}
      {pickups && pickups.length > 0 && (
        <div className="my-2">
          <PickupStudents
            pickups={pickups}
            favoritedStudents={favoritedStudents ?? []}
            favoritedCounts={favoritedCounts ?? {}}
            onFavorite={onFavorite}
            showToggle={contentType === "archive_pickup"}
          />

          {isPickupDayDifferent && (
            <div className="mb-2 px-2 py-2 flex items-center gap-x-2 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl text-sm">
              <ExclamationTriangleIcon className="shrink-0 size-5 text-amber-600 dark:text-amber-400" />
              <div className="flex flex-wrap gap-x-1">
                <p className="shrink-0 text-amber-700 dark:text-amber-300">
                  {dayjs(pickupUntil).isBefore(dayjs()) ? "픽업 모집은 종료되었어요." : "이벤트 개최 기간과 픽업 모집 기간이 달라요."}
                </p>
                <Link to={link} className="flex-shrink-0 text-amber-600 dark:text-amber-400 underline cursor-pointer hover:text-amber-700 dark:hover:text-amber-300">
                  자세히 보기
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 댓글 */}
      {showComments && onCommentCreate && (
        <>
          <ContentCommentView
            comments={allComments}
            onClick={() => setCommentEditing(true)}
          />

          {commentEditing && (
            <BottomSheet Icon={ChatBubbleOvalLeftEllipsisIcon} title="이벤트 의견" onClose={() => setCommentEditing(false)}>
              <ContentCommentEditor
                comments={allComments ?? []}
                onCreateComment={onCommentCreate}
                onCreateSubcomment={onCommentCreateSubcomment ?? (() => {})}
                onUpdateComment={onCommentUpdate}
                onDeleteComment={onCommentDelete}
                isSubmitting={isSubmittingComment}
                signedIn={signedIn}
              />
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
}

type PickupStudentsProps = {
  pickups: {
    type: PickupType;
    rerun: boolean;
    studentName: string;
    student: {
      uid: string;
      schaleDbId?: string | null;
    } | null;
  }[];
  favoritedStudents: string[];
  favoritedCounts: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  showToggle?: boolean;
};

function PickupStudents({ pickups, favoritedStudents, favoritedCounts, onFavorite, showToggle = false }: PickupStudentsProps) {
  const [showCards, setShowCards] = useState(!showToggle);

  if (!showToggle) {
    return (
      <StudentCards
        mobileGrid={5}
        students={pickups.map((pickup) => {
          const student = pickup.student;
          const colorClass = (pickup.rerun || pickup.type === "archive") ? "text-white" : "text-yellow-500";
          return {
            ...student,
            uid: student?.uid ?? null,
            name: pickup.studentName,
            label: <span className={`${colorClass}`}>{pickupLabelLocale(pickup)}</span>,
            state: student?.uid ? {
              favorited: favoritedStudents?.includes(student.uid),
              favoritedCount: favoritedCounts?.[student.uid],
            } : undefined,
            popups: (student?.uid && student?.schaleDbId) ? [
              favoritedStudents?.includes(student.uid) ? {
                Icon: FilledHeartIcon,
                text: "관심 학생에서 해제",
                onClick: () => onFavorite?.(student.uid, false),
              } : {
                Icon: EmptyHeartIcon,
                text: "관심 학생에 등록",
                onClick: () => onFavorite?.(student.uid, true),
              },
              {
                Icon: IdentificationIcon,
                text: "학생부 보기 (평가/통계)",
                link: `/students/${student?.uid}`,
              },
              {
                Icon: ArrowTopRightOnSquareIcon,
                text: "샬레DB 정보 보기",
                link: `https://schaledb.com/student/${student?.schaleDbId}`,
              },
            ] : undefined,
          };
        })}
      />
    );
  }

  return (
    <div>
      <div className="mb-2">
        <button
          onClick={() => setShowCards(!showCards)}
          className="flex items-center gap-x-1 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition border border-neutral-200 dark:border-neutral-700"
        >
          {showCards ? (
            <>
              <EyeSlashIcon className="size-4" />
              <span>모집 대상 학생 숨기기</span>
            </>
          ) : (
            <>
              <EyeIcon className="size-4" />
              <span>모집 대상 학생 보기</span>
            </>
          )}
        </button>
      </div>

      {showCards && (
        <StudentCards
          mobileGrid={5}
          students={pickups.map((pickup) => {
            const student = pickup.student;
            const colorClass = (pickup.rerun || pickup.type === "archive") ? "text-white" : "text-yellow-500";
            return {
              ...student,
              uid: student?.uid ?? null,
              name: pickup.studentName,
              label: <span className={`${colorClass}`}>{pickupLabelLocale(pickup)}</span>,
              state: student?.uid ? {
                favorited: favoritedStudents?.includes(student.uid),
                favoritedCount: favoritedCounts?.[student.uid],
              } : undefined,
              popups: (student?.uid && student?.schaleDbId) ? [
                favoritedStudents?.includes(student.uid) ? {
                  Icon: FilledHeartIcon,
                  text: "관심 학생에서 해제",
                  onClick: () => onFavorite?.(student.uid, false),
                } : {
                  Icon: EmptyHeartIcon,
                  text: "관심 학생에 등록",
                  onClick: () => onFavorite?.(student.uid, true),
                },
                {
                  Icon: IdentificationIcon,
                  text: "학생부 보기",
                  link: `/students/${student?.uid}`,
                },
                {
                  Icon: ArrowTopRightOnSquareIcon,
                  text: "샬레DB에서 학생 정보 보기",
                  link: `https://schaledb.com/student/${student?.schaleDbId}`,
                },
              ] : undefined,
            };
          })}
        />
      )}
    </div>
  );
}
