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
import { useStudentCardPopup } from "~/contexts/StudentCardPopupProvider";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { canCompleteRecruitmentStudent } from "~/domain/recruitment-result";
import type { Attack, Defense, RecruitmentTypeEnum, Terrain } from "~/graphql/graphql";
import {
  formatInstant,
  formatInstantDateKey,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
  parseUtcTimestamp,
  type UtcIsoString,
} from "~/lib/date-time";
import { contentTypeLocale, recruitmentLabelLocale, remainingTime } from "~/locales/ko";
import type { ContentCommentSummary } from "~/models/content";
import type { EventType, RaidType, Role } from "~/models/content.d";
import {
  COMMENT_ENABLED_WITHOUT_RECRUITMENT_CONTENT_TYPES,
  SHOW_LINK_CONTENT_TYPES,
  SHOW_LINK_RAID_TYPES,
} from "~/models/content-rules";
import type { RecruitmentCompletionMeta } from "~/models/recruitment-result";
import ContentCommentEditor from "./ContentCommentEditor";
import ContentCommentView from "./ContentCommentView";
import { TimelineItemBanner } from "./TimelineItemBanner";

export type ContentTimelineItemProps = {
  uid: string;
  name: string;
  imageUrl?: string | null;
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
  commentSummary?: ContentCommentSummary;
  commentsUnavailable?: boolean;

  onCommentOpen?: () => void;
  onCommentCreate?: (body: string, visibility: "private" | "public") => void;
  onCommentCreateSubcomment?: (parentCommentId: string, body: string, visibility: "private" | "public") => void;
  onCommentUpdate?: (commentUid: string, body: string, visibility: "private" | "public") => void;
  onCommentDelete?: (commentUid: string) => void;
  onCommentPin?: (commentUid: string) => void;
  onCommentUnpin?: () => void;
  isLoadingComments?: boolean;
  isSubmittingComment?: boolean;

  favoritedStudents?: string[];
  favoritedCounts?: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  completedStudentUids?: string[];
  recruitmentResultEditLink?: string;
  onRecruitmentComplete?: (studentUid: string, completed: boolean, recruitment: RecruitmentCompletionMeta) => void;
  onRevealSpoiler?: () => void;
  onHideSpoiler?: () => void;
  showStudentAnalysisFeatureBanner?: boolean;
  showPendingStudentFavoriteFeatureBanner?: boolean;
  onFeatureBannerDismiss?: (bannerId: ContentTimelineFeatureBannerId) => void;

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
  recruitmentStudentMobileGrid?: 5 | 6;
};

export type ContentTimelineFeatureBannerId = "student-analysis" | "pending-student-favorite";

export function ContentTimelineItem({
  name,
  imageUrl,
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
  commentSummary,
  commentsUnavailable = false,
  onCommentOpen,
  isLoadingComments = false,
  isSubmittingComment,
  favoritedStudents,
  favoritedCounts,
  onFavorite,
  completedStudentUids = [],
  recruitmentResultEditLink,
  onRecruitmentComplete,
  onRevealSpoiler,
  onHideSpoiler,
  showStudentAnalysisFeatureBanner = false,
  showPendingStudentFavoriteFeatureBanner = false,
  onFeatureBannerDismiss,
  signedIn,
  recruitmentStudentMobileGrid,
}: ContentTimelineItemProps) {
  const displayTimeZone = useDisplayTimeZone();
  const { setActivePopupId } = useStudentCardPopup();
  const showComments =
    (recruitments?.length ?? 0) > 0 || COMMENT_ENABLED_WITHOUT_RECRUITMENT_CONTENT_TYPES.includes(contentType);
  const [commentEditing, setCommentEditing] = useState(false);

  let daysLabel = null;
  const now = nowUtcIso();

  let finishSoon = false;
  if (since && until && isInstantBefore(since, now)) {
    const remaining = remainingTime(parseUtcTimestamp(until), {
      now: parseUtcTimestamp(now),
      timeZone: displayTimeZone,
    });
    daysLabel = remaining.text;
    finishSoon = remaining.finishSoon;
  }

  const headerLinked = isContentHeaderLinked({ contentType, raidInfo, isSpoiler, spoilerVisible });
  const titleContent = <ContentTitles name={name} showLink={headerLinked} />;
  const headerContent = headerLinked ? (
    <Link to={link} className="block cursor-pointer hover:underline tracking-tight">
      {titleContent}
      {raidInfo && <RaidInfo raid={raidInfo} since={since ?? null} until={until} />}
    </Link>
  ) : (
    <>
      {titleContent}
      {raidInfo && <RaidInfo raid={raidInfo} since={since ?? null} until={until} />}
    </>
  );
  const showThumbnail = contentType === "live" && imageUrl && (!isSpoiler || spoilerVisible);

  return (
    <div className="my-4 md:my-6">
      <div className={showThumbnail ? "sm:grid sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start sm:gap-4" : undefined}>
        <div className="min-w-0">
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
        </div>

        {showThumbnail && (
          <Link to={link} className="mt-3 block w-28 sm:mt-1 sm:w-40" aria-label={`${name} 상세 보기`}>
            <img
              src={imageUrl}
              alt={`${name.replaceAll("\n", " ")} 썸네일`}
              className="aspect-video w-full rounded-lg object-cover shadow-sm"
              loading="lazy"
              decoding="async"
            />
          </Link>
        )}
      </div>

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
          studentMobileGrid={recruitmentStudentMobileGrid}
        />
      )}
      {completedStudentUids.length > 0 && recruitmentResultEditLink && (
        <div className="my-2">
          <Button
            text="모집 결과 데이터 상세 입력"
            icon={PencilSquareIcon}
            to={recruitmentResultEditLink}
            size="xs"
            className="shadow-none"
          />
        </div>
      )}

      {(showStudentAnalysisFeatureBanner || showPendingStudentFavoriteFeatureBanner) && (
        <FeatureBanners
          showStudentAnalysisFeatureBanner={showStudentAnalysisFeatureBanner}
          showPendingStudentFavoriteFeatureBanner={showPendingStudentFavoriteFeatureBanner}
          studentAnalysisPopupId={recruitments ? getStudentAnalysisFeatureBannerPopupId(recruitments, now) : null}
          pendingStudentPopupId={recruitments ? getPendingStudentFeatureBannerPopupId(recruitments) : null}
          onOpenPopup={setActivePopupId}
          onDismiss={onFeatureBannerDismiss}
        />
      )}

      {/* 댓글 */}
      {showComments && onCommentCreate && (
        <>
          <div className={(recruitments?.length ?? 0) === 0 ? "mt-3" : undefined}>
            <ContentCommentView
              comments={allComments}
              summary={commentSummary}
              unavailable={commentsUnavailable}
              onClick={() => {
                onCommentOpen?.();
                setCommentEditing(true);
              }}
            />
          </div>

          {commentEditing && !commentsUnavailable && (
            <BottomSheet
              Icon={ChatBubbleOvalLeftEllipsisIcon}
              title={contentType === "live" ? "공식 방송 의견" : "이벤트 의견"}
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
                isLoading={isLoadingComments}
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

function FeatureBanners({
  showStudentAnalysisFeatureBanner,
  showPendingStudentFavoriteFeatureBanner,
  studentAnalysisPopupId,
  pendingStudentPopupId,
  onOpenPopup,
  onDismiss,
}: {
  showStudentAnalysisFeatureBanner: boolean;
  showPendingStudentFavoriteFeatureBanner: boolean;
  studentAnalysisPopupId: string | null;
  pendingStudentPopupId: string | null;
  onOpenPopup: (popupId: string) => void;
  onDismiss?: (bannerId: ContentTimelineFeatureBannerId) => void;
}) {
  return (
    <>
      {showStudentAnalysisFeatureBanner && (
        <TimelineItemBanner
          icon="info"
          color="green"
          linkText="확인하기"
          onLinkClick={studentAnalysisPopupId ? () => onOpenPopup(studentAnalysisPopupId) : undefined}
          onDismiss={onDismiss ? () => onDismiss("student-analysis") : undefined}
          message="학생부에서 통계 분석을 보고 모집 여부를 판단해보세요"
        />
      )}
      {showPendingStudentFavoriteFeatureBanner && (
        <TimelineItemBanner
          icon="info"
          color="green"
          linkText="확인하기"
          onLinkClick={pendingStudentPopupId ? () => onOpenPopup(pendingStudentPopupId) : undefined}
          onDismiss={onDismiss ? () => onDismiss("pending-student-favorite") : undefined}
          message="데이터를 준비중인 학생도 관심 학생에 등록할 수 있어요"
        />
      )}
    </>
  );
}

function getStudentAnalysisFeatureBannerPopupId(
  recruitments: NonNullable<ContentTimelineItemProps["recruitments"]>,
  now: UtcIsoString,
): string | null {
  const target = recruitments
    .filter((recruitment) => recruitment.pickup && recruitment.student && isInstantAfter(recruitment.since, now))
    .sort((a, b) => a.since.localeCompare(b.since))[0];

  return target?.favoriteKey ?? null;
}

function getPendingStudentFeatureBannerPopupId(
  recruitments: NonNullable<ContentTimelineItemProps["recruitments"]>,
): string | null {
  return (
    recruitments.find((recruitment) => recruitment.student === null && recruitment.favoriteKey)?.favoriteKey ?? null
  );
}

function SpoilerHeader({
  hidden,
  onReveal,
  onHide,
  children,
}: {
  hidden: boolean;
  onReveal?: () => void;
  onHide?: () => void;
  children: ReactNode;
}) {
  if (!hidden) {
    return (
      <div className="space-y-2">
        {children}
        {onHide && (
          <Button
            text="스포일러 다시 숨기기"
            icon={EyeSlashIcon}
            size="xs"
            variant="secondary"
            onClick={onHide}
            className="shadow-none dark:border-neutral-700/80 dark:bg-neutral-800/70 dark:hover:bg-neutral-700/75"
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-32 overflow-hidden rounded-lg bg-white/60 dark:bg-neutral-800/45">
      <div className="pointer-events-none select-none blur-md opacity-80 dark:opacity-35 dark:saturate-75">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-linear-to-b from-white/86 to-white/78 px-4 text-center shadow-sm backdrop-blur-[2px] dark:from-neutral-800/84 dark:to-neutral-800/76">
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
  let colorClass =
    "bg-neutral-100 text-neutral-800 shadow-xs shadow-black/5 dark:bg-neutral-700 dark:text-neutral-200 dark:shadow-none";
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
  studentMobileGrid?: 5 | 6;
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
  studentMobileGrid,
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
    return <TimelineItemBanner message="픽업 외 학생은 모집 포인트(천장)로 교환할 수 없어요." link={link} />;
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
              mobileGrid={studentMobileGrid}
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
        mobileGrid={studentMobileGrid}
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
          mobileGrid={studentMobileGrid}
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
  mobileGrid?: 5 | 6;
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
  mobileGrid,
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
        <StudentCards layout="responsive-wrap" mobileGrid={mobileGrid} cardSize="lg" students={studentCards} />
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

      {showCards && (
        <StudentCards layout="responsive-wrap" mobileGrid={mobileGrid} cardSize="lg" students={studentCards} />
      )}
    </div>
  );
}
