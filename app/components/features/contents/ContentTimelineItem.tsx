import {
  CalculatorIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  CheckCircleIcon as CheckCircleSolidIcon,
  ChevronRightIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
  StarIcon,
} from "@heroicons/react/16/solid";
import {
  CheckCircleIcon,
  HeartIcon as EmptyHeartIcon,
  IdentificationIcon,
  PencilSquareIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as FilledHeartIcon } from "@heroicons/react/24/solid";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { RaidCard } from "~/components/features/raids";
import { StudentCards } from "~/components/features/students";
import { BottomSheet, Button } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { Attack, Defense, RecruitmentTypeEnum, Terrain } from "~/graphql/graphql";
import {
  type UtcIsoString,
  formatInstant,
  formatInstantDateKey,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
  parseUtcTimestamp,
} from "~/lib/date-time";
import { contentTypeLocale, recruitmentLabelLocale } from "~/locales/ko";
import { SHOW_LINK_CONTENT_TYPES, SHOW_LINK_RAID_TYPES } from "~/models/content-rules";
import type { EventType, RaidType, Role } from "~/models/content.d";
import type { RecruitmentCompletionMeta } from "~/models/recruitment-result";
import { canCompleteRecruitmentStudent } from "~/models/recruitment-result-completion";
import ContentCommentEditor from "./ContentCommentEditor";
import ContentCommentView from "./ContentCommentView";
import { TimelineItemBanner } from "./TimelineItemBanner";

export type ContentTimelineItemProps = {
  uid: string;
  name: string;
  contentType: EventType | RaidType;
  runType: "first" | "rerun" | "permanent";
  endless: boolean;
  since?: UtcIsoString | null;
  until: UtcIsoString | null;
  link: string;
  confirmed?: boolean;
  isSpoiler?: boolean;
  spoilerVisible?: boolean;
  tags: string[];

  allComments?: {
    uid: string;
    body: string;
    visibility: "private" | "public";
    pinned: boolean;
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
  onCommentPin?: (commentUid: string) => void;
  onCommentUnpin?: () => void;
  isSubmittingComment?: boolean;

  favoritedStudents?: string[];
  favoritedCounts?: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  completedStudentUids?: string[];
  recruitmentResultEditLink?: string;
  onRecruitmentComplete?: (studentUid: string, completed: boolean, recruitment: RecruitmentCompletionMeta) => void;
  onRevealSpoiler?: () => void;
  onHideSpoiler?: () => void;

  recruitments?: {
    recruitmentType: RecruitmentTypeEnum;
    pickup: boolean;
    rerun: boolean;
    student: {
      uid: string;
      attackType?: Attack;
      defenseType?: Defense;
      role?: Role;
      schaleDbId?: string | null;
      initialTier?: number;
    } | null;
    studentName: string;
    favoriteKey: string;
    since: UtcIsoString;
    until: UtcIsoString | null;
  }[];
  raidInfo?: {
    raidType: string;
    boss: string;
    name: string;
    terrain: Terrain;
    attackType: Attack | null;
    defenseTypeSets?: {
      difficulty: string | null;
      defenseTypes: Defense[];
      primaryDefenseType?: Defense;
    }[];
    defenseTypes: {
      defenseType: Defense;
      difficulty: string | null;
    }[];
  };

  signedIn: boolean;
};

export function ContentTimelineItem({
  name,
  contentType,
  runType,
  endless,
  since,
  until,
  link,
  confirmed,
  isSpoiler = false,
  spoilerVisible = true,
  tags,
  raidInfo,
  recruitments,
  allComments,
  onCommentCreate,
  onCommentCreateSubcomment,
  onCommentUpdate,
  onCommentDelete,
  onCommentPin,
  onCommentUnpin,
  isSubmittingComment,
  favoritedStudents,
  favoritedCounts,
  onFavorite,
  completedStudentUids = [],
  recruitmentResultEditLink,
  onRecruitmentComplete,
  onRevealSpoiler,
  onHideSpoiler,
  signedIn,
}: ContentTimelineItemProps) {
  const displayTimeZone = useDisplayTimeZone();
  const showComments = recruitments && recruitments.length > 0;
  const [commentEditing, setCommentEditing] = useState(false);

  let daysLabel = null;
  const now = nowUtcIso();

  let finishSoon = false;
  if (since && until && isInstantBefore(since, now)) {
    const remainingDays = parseUtcTimestamp(until).startOf("day").diff(parseUtcTimestamp(now).startOf("day"), "day");
    if (remainingDays >= 2) {
      daysLabel = `${remainingDays}일`;
    } else {
      const remainingHours = parseUtcTimestamp(until)
        .startOf("hour")
        .diff(parseUtcTimestamp(now).startOf("hour"), "hour");
      if (remainingHours > 24) {
        daysLabel = "내일 종료";
      } else {
        finishSoon = true;
        daysLabel = `${remainingHours}시간 남음`;
      }
    }
  }

  const headerLinked = isContentHeaderLinked({ contentType, raidInfo, isSpoiler, spoilerVisible });
  const headerContent = headerLinked ? (
    <Link to={link} className="block cursor-pointer hover:underline tracking-tight">
      <ContentTitles name={name} showLink={true} />
      {raidInfo && <RaidInfo raid={raidInfo} since={since ?? null} until={until} />}
    </Link>
  ) : (
    <>
      <ContentTitles name={name} showLink={false} />
      {raidInfo && <RaidInfo raid={raidInfo} since={since ?? null} until={until} />}
    </>
  );

  return (
    <div className="my-4 md:my-6">
      {/* 컨텐츠 분류 */}
      <div className="flex items-center gap-x-1 md:my-1">
        <div className="my-1 flex flex-wrap gap-1 text-sm">
          <span className="pr-1 py-0.5 text-neutral-500 dark:text-neutral-400">
            {(contentType === "event" || contentType === "pickup") && runType === "rerun" && "복각 "}
            {contentType === "event" && runType === "permanent" ? "이벤트 상설화" : contentTypeLocale[contentType]}
          </span>
          {!endless && daysLabel && (
            <ContentTag Icon={ClockIcon} text={daysLabel} color={finishSoon ? "red" : "default"} />
          )}
          {confirmed && since && isInstantAfter(since, now) && (
            <ContentTag Icon={CheckCircleSolidIcon} text="확정" color="green" />
          )}
          {tags.includes("recruit_free_100") &&
            recruitments?.every(({ until }) => until !== null && isInstantAfter(until, now)) && (
              <ContentTag Icon={StarIcon} text="100회 무료" color="yellow" />
            )}
          {tags.includes("shop") && <ContentTag Icon={CalculatorIcon} text="이벤트 상점" color="default" />}
        </div>
      </div>

      {/* 컨텐츠 이름 */}
      <SpoilerHeader
        hidden={isSpoiler && !spoilerVisible}
        onReveal={onRevealSpoiler}
        onHide={isSpoiler && spoilerVisible ? onHideSpoiler : undefined}
      >
        {headerContent}
      </SpoilerHeader>

      {/* 모집 정보 */}
      {recruitments && recruitments.length > 0 && (
        <Recruitments
          contentType={contentType}
          recruitments={recruitments}
          favoritedStudents={favoritedStudents ?? []}
          favoritedCounts={favoritedCounts ?? {}}
          onFavorite={onFavorite}
          completedStudentUids={completedStudentUids}
          onRecruitmentComplete={onRecruitmentComplete}
          link={link}
          eventSince={since ?? null}
          eventUntil={until ?? null}
          timeZone={displayTimeZone}
        />
      )}
      {completedStudentUids.length > 0 && recruitmentResultEditLink && (
        <div className="my-2">
          <Button
            text="모집 결과 데이터 상세 입력"
            icon={PencilSquareIcon}
            to={recruitmentResultEditLink}
            size="xs"
            shadow="none"
          />
        </div>
      )}

      {/* 댓글 */}
      {showComments && onCommentCreate && (
        <>
          <ContentCommentView comments={allComments} onClick={() => setCommentEditing(true)} />

          {commentEditing && (
            <BottomSheet
              Icon={ChatBubbleOvalLeftEllipsisIcon}
              title="이벤트 의견"
              onClose={() => setCommentEditing(false)}
            >
              <ContentCommentEditor
                comments={allComments ?? []}
                onCreateComment={onCommentCreate}
                onCreateSubcomment={onCommentCreateSubcomment ?? (() => {})}
                onUpdateComment={onCommentUpdate}
                onDeleteComment={onCommentDelete}
                onPinComment={onCommentPin}
                onUnpinComment={onCommentUnpin}
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

function SpoilerHeader({
  hidden,
  onReveal,
  onHide,
  children,
}: { hidden: boolean; onReveal?: () => void; onHide?: () => void; children: ReactNode }) {
  if (!hidden) {
    return (
      <div className="space-y-2">
        {children}
        {onHide && (
          <Button
            text="스포일러 다시 숨기기"
            icon={EyeSlashIcon}
            size="xs"
            variant="tint"
            shadow="none"
            onClick={onHide}
            className="dark:border-neutral-700/80 dark:bg-neutral-800/70 dark:hover:bg-neutral-700/75"
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-32 overflow-hidden rounded-xl border border-neutral-200/70 bg-white/60 dark:border-neutral-700/70 dark:bg-neutral-800/45">
      <div className="pointer-events-none select-none blur-md opacity-80 dark:opacity-35 dark:saturate-75">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-linear-to-b from-white/86 to-white/78 px-4 text-center shadow-sm backdrop-blur-[2px] dark:from-neutral-800/84 dark:to-neutral-800/76">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">스포일러가 포함되어 있어요</p>
          <Button text="내용 보기" size="sm" variant="inverse" onClick={onReveal} />
        </div>
      </div>
    </div>
  );
}

function ContentTitles({ name, showLink }: { name: string; showLink: boolean }): ReactNode {
  const titles = name.split("\n");
  return titles.map((titleLine, index) => {
    const key = `${name}-${index}`;
    if (index < titles.length - 1) {
      return (
        <p key={key} className="text-lg md:text-xl font-semibold">
          {titleLine}
        </p>
      );
    }
    return (
      <div key={key} className="text-lg md:text-xl font-semibold flex items-center">
        <span className="inline">{titleLine}</span>
        {showLink && <ChevronRightIcon className="inline size-4" strokeWidth={2} />}
      </div>
    );
  });
}

type ContentTagProps = {
  Icon: React.ElementType;
  text: string;
  color: "default" | "green" | "red" | "yellow";
};

function ContentTag({ Icon, text, color }: ContentTagProps) {
  let colorClass = "bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200";
  if (color === "green") {
    colorClass = "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
  } else if (color === "red") {
    colorClass = "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200";
  } else if (color === "yellow") {
    colorClass = "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200";
  }

  return (
    <span className={`flex items-center px-2 py-0.5 rounded-full ${colorClass}`}>
      <Icon className="inline size-4 mr-1" />
      {text}
    </span>
  );
}

type RaidInfoProps = {
  raid: {
    raidType: string;
    boss: string;
    name: string;
    seasonIndex?: number;
    terrain: Terrain;
    attackType: Attack | null;
    defenseTypeSets?: {
      difficulty: string | null;
      defenseTypes: Defense[];
      primaryDefenseType?: Defense;
    }[];
    defenseTypes: {
      defenseType: Defense;
      difficulty: string | null;
    }[];
  };
  since: UtcIsoString | null;
  until: UtcIsoString | null;
};

function RaidInfo({ raid, since, until }: RaidInfoProps) {
  return (
    <div className="mt-2 mb-6 w-full max-w-96">
      <RaidCard
        raid={{
          raidBoss: { uid: raid.boss, name: raid.name },
          raidType: raid.raidType,
          seasonIndex: raid.seasonIndex,
          attackType: raid.attackType,
          defenseTypeSets: raid.defenseTypeSets,
          defenseTypes: raid.defenseTypes,
          startAt: since,
          endAt: until,
          terrain: raid.terrain,
        }}
        timeLocaleType="relative"
        showTimeLabel={false}
        showTitle={false}
        showAttackType
        className="w-full"
      />
    </div>
  );
}

type RecruitmentsProps = {
  contentType: EventType | RaidType;
  recruitments: {
    recruitmentType: RecruitmentTypeEnum;
    pickup: boolean;
    rerun: boolean;
    studentName: string;
    student: {
      uid: string;
      schaleDbId?: string | null;
      attackType?: Attack;
      defenseType?: Defense;
      role?: Role;
      initialTier?: number;
    } | null;
    favoriteKey: string;
    since: UtcIsoString;
    until: UtcIsoString | null;
  }[];

  favoritedStudents: string[];
  favoritedCounts: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  completedStudentUids: string[];
  onRecruitmentComplete?: (studentUid: string, completed: boolean, recruitment: RecruitmentCompletionMeta) => void;
  link: string;

  eventSince: UtcIsoString | null;
  eventUntil: UtcIsoString | null;
  timeZone: string;
};

function Recruitments({
  contentType,
  recruitments,
  favoritedStudents,
  favoritedCounts,
  onFavorite,
  completedStudentUids,
  onRecruitmentComplete,
  link,
  timeZone,
}: RecruitmentsProps) {
  // Group pickups by period (since/until dates)
  const recruitmentDateGroups = useMemo(() => {
    return recruitments.reduce(
      (groups, recruitment) => {
        const sinceKey = formatInstantDateKey(recruitment.since, timeZone);
        const untilKey = recruitment.until ? formatInstantDateKey(recruitment.until, timeZone) : "null";
        const key = `${sinceKey}-${untilKey}`;
        if (!groups[key]) {
          groups[key] = {
            since: recruitment.since,
            until: recruitment.until,
            recruitments: [],
          };
        }
        groups[key].recruitments.push(recruitment);
        return groups;
      },
      {} as Record<
        string,
        { since: UtcIsoString; until: UtcIsoString | null; recruitments: RecruitmentsProps["recruitments"] }
      >,
    );
  }, [recruitments, timeZone]);

  const recruitDateGroupsArray = Object.values(recruitmentDateGroups);
  const hasMultiplePeriods = recruitDateGroupsArray.length >= 2;

  if (contentType === "fes") {
    return (
      <>
        <TimelineItemBanner message="픽업 외 학생은 모집 포인트(천장)로 교환할 수 없어요." link={link} />
      </>
    );
  }

  if (hasMultiplePeriods) {
    return (
      <>
        {recruitDateGroupsArray.map((group) => {
          return (
            <RecruitmentStudents
              key={`${formatInstantDateKey(group.since, timeZone)}-${group.until ? formatInstantDateKey(group.until, timeZone) : "null"}`}
              title={`${formatInstant(group.since, { timeZone, format: "MM/DD" })} ~ ${
                group.until ? formatInstant(group.until, { timeZone, format: "MM/DD" }) : "미정"
              }`}
              recruitments={group.recruitments}
              favoritedStudents={favoritedStudents ?? []}
              favoritedCounts={favoritedCounts ?? {}}
              onFavorite={onFavorite}
              completedStudentUids={completedStudentUids}
              onRecruitmentComplete={onRecruitmentComplete}
            />
          );
        })}
      </>
    );
  }

  const hasNonPickupRecruitments = recruitments.some(({ pickup }) => !pickup);
  return (
    <>
      <RecruitmentStudents
        title={hasNonPickupRecruitments ? "픽업 학생" : undefined}
        recruitments={recruitments.filter(({ pickup }) => pickup)}
        favoritedStudents={favoritedStudents ?? []}
        favoritedCounts={favoritedCounts ?? {}}
        onFavorite={onFavorite}
        completedStudentUids={completedStudentUids}
        onRecruitmentComplete={onRecruitmentComplete}
      />

      {hasNonPickupRecruitments && (
        <RecruitmentStudents
          title="픽업 대상 외 모집 가능 학생"
          recruitments={recruitments.filter(({ pickup }) => !pickup)}
          favoritedStudents={favoritedStudents ?? []}
          favoritedCounts={favoritedCounts ?? {}}
          onFavorite={onFavorite}
          completedStudentUids={completedStudentUids}
          onRecruitmentComplete={onRecruitmentComplete}
        />
      )}
    </>
  );
}

type RecruitmentStudentsProps = {
  title?: string;
  recruitments: RecruitmentsProps["recruitments"];
  favoritedStudents: string[];
  favoritedCounts: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  completedStudentUids: string[];
  onRecruitmentComplete?: (studentUid: string, completed: boolean, recruitment: RecruitmentCompletionMeta) => void;
  showToggle?: boolean;
};

export function isContentHeaderLinked({
  contentType,
  raidInfo,
  isSpoiler = false,
  spoilerVisible = true,
}: {
  contentType: EventType | RaidType;
  raidInfo?: { raidType: string };
  isSpoiler?: boolean;
  spoilerVisible?: boolean;
}) {
  return (
    ((raidInfo !== undefined && SHOW_LINK_RAID_TYPES.includes(raidInfo.raidType)) ||
      SHOW_LINK_CONTENT_TYPES.includes(contentType)) &&
    (!isSpoiler || spoilerVisible)
  );
}

export function getRecruitmentStudentCards({
  recruitments,
  favoritedStudents,
  favoritedCounts,
  onFavorite,
  completedStudentUids,
  onRecruitmentComplete,
  detailedLinkText,
}: {
  recruitments: RecruitmentsProps["recruitments"];
  favoritedStudents: string[];
  favoritedCounts: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  completedStudentUids: string[];
  onRecruitmentComplete?: (studentUid: string, completed: boolean, recruitment: RecruitmentCompletionMeta) => void;
  detailedLinkText: string;
}) {
  const now = nowUtcIso();
  return recruitments.map((recruitment) => {
    const student = recruitment.student;
    const studentUid = student?.uid;
    const favoriteKey = recruitment.favoriteKey;
    const isFavorited = favoritedStudents.includes(favoriteKey);
    const recruitmentCompleted = studentUid ? completedStudentUids.includes(studentUid) : false;
    const showRecruitmentCompleteAction = Boolean(
      recruitmentCompleted ||
        (studentUid &&
          canCompleteRecruitmentStudent({
            recruitmentSince: recruitment.since,
            favorited: isFavorited,
            now,
          })),
    );
    const recruitmentResultStudent = {
      tier: student?.initialTier ?? 3,
      pickup: recruitment.pickup && recruitment.recruitmentType !== "given",
      recruitmentType: recruitment.recruitmentType,
    };
    const labelColorClass =
      recruitment.rerun ||
      recruitment.recruitmentType === "archive" ||
      recruitment.recruitmentType === "recollect" ||
      recruitment.recruitmentType === "encore"
        ? "text-white"
        : "text-yellow-500";

    return {
      ...student,
      uid: studentUid ?? null,
      popupId: favoriteKey,
      name: recruitment.studentName,
      label: <span className={labelColorClass}>{recruitmentLabelLocale(recruitment)}</span>,
      state: {
        favorited: isFavorited,
        favoritedCount: favoritedCounts[favoriteKey],
        completed: recruitmentCompleted,
      },
      popups: favoriteKey
        ? [
            ...(onRecruitmentComplete && studentUid && showRecruitmentCompleteAction
              ? [
                  recruitmentCompleted
                    ? {
                        Icon: XCircleIcon,
                        text: "모집 완료 취소",
                        onClick: () => onRecruitmentComplete(studentUid, false, recruitmentResultStudent),
                      }
                    : {
                        Icon: CheckCircleIcon,
                        text: "모집 완료로 표시",
                        onClick: () => onRecruitmentComplete(studentUid, true, recruitmentResultStudent),
                      },
                ]
              : []),
            isFavorited
              ? {
                  Icon: FilledHeartIcon,
                  text: "관심 학생에서 해제",
                  onClick: () => onFavorite?.(favoriteKey, false),
                }
              : {
                  Icon: EmptyHeartIcon,
                  text: "관심 학생에 등록",
                  onClick: () => onFavorite?.(favoriteKey, true),
                },
            ...(studentUid
              ? [
                  {
                    Icon: IdentificationIcon,
                    text: detailedLinkText,
                    link: `/students/${studentUid}`,
                  },
                ]
              : []),
          ]
        : undefined,
    };
  });
}

function RecruitmentStudents({
  title,
  recruitments,
  favoritedStudents,
  favoritedCounts,
  onFavorite,
  completedStudentUids,
  onRecruitmentComplete,
  showToggle = false,
}: RecruitmentStudentsProps) {
  const [showCards, setShowCards] = useState(!showToggle);
  const studentCards = useMemo(
    () =>
      getRecruitmentStudentCards({
        recruitments,
        favoritedStudents,
        favoritedCounts,
        onFavorite,
        completedStudentUids,
        onRecruitmentComplete,
        detailedLinkText: "학생부 보기 (평가/통계)",
      }),
    [completedStudentUids, favoritedCounts, favoritedStudents, onFavorite, onRecruitmentComplete, recruitments],
  );

  if (!showToggle) {
    return (
      <div className="my-2">
        {title && <p className="mt-4 mb-1 font-semibold">{title}</p>}
        <StudentCards mobileGrid={5} pcGrid={8} students={studentCards} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <button
          type="button"
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

      {showCards && <StudentCards mobileGrid={5} students={studentCards} />}
    </div>
  );
}
