import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import dayjs from "dayjs";
import { ChevronRightIcon, ChartBarIcon, ClockIcon, CheckCircleIcon, ChatBubbleOvalLeftEllipsisIcon, EyeIcon, EyeSlashIcon, CalculatorIcon, StarIcon } from "@heroicons/react/16/solid";
import { IdentificationIcon, HeartIcon as EmptyHeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as FilledHeartIcon } from "@heroicons/react/24/solid";
import type { EventType, RaidType, Role } from "~/models/content.d";
import { attackTypeColor, attackTypeLocale, contentTypeLocale, defenseTypeColor, defenseTypeLocale, recruitmentLabelLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import { StudentCards } from "~/components/students";
import { OptionBadge } from "~/components/atoms/student";
import { BottomSheet } from "~/components/atoms/layout";
import ContentCommentEditor from "./ContentCommentEditor";
import ContentCommentView from "./ContentCommentView";
import { TimelineItemBanner } from "./TimelineItemBanner";
import { SHOW_LINK_CONTENT_TYPES } from "~/models/content";
import type { Attack, Defense, Terrain, RecruitmentTypeEnum } from "~/graphql/graphql";

export type ContentTimelineItemProps = {
  uid: string;
  name: string;
  contentType: EventType | RaidType;
  runType: "first" | "rerun" | "permanent";
  endless: boolean;
  since?: Date | null;
  until: Date | null;
  link: string;
  confirmed?: boolean;
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
    } | null;
    studentName: string;
    since: Date;
    until: Date | null;
  }[];
  raidInfo?: {
    uid: string;
    boss: string;
    terrain: Terrain;
    attackType: Attack;
    defenseTypes: {
      defenseType: Defense;
      difficulty: string | null;
    }[];
    rankVisible: boolean;
  };

  signedIn: boolean;
};

export function ContentTimelineItem({
  name, contentType, runType, endless, since, until, link, confirmed, tags, raidInfo, recruitments,
  allComments, onCommentCreate, onCommentCreateSubcomment, onCommentUpdate, onCommentDelete, onCommentPin, onCommentUnpin, isSubmittingComment, favoritedStudents, favoritedCounts, onFavorite, signedIn,
}: ContentTimelineItemProps) {
  const showComments = recruitments && recruitments.length > 0;
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
      if (remainingHours > 24) {
        daysLabel = `내일 종료`;
      } else {
        finishSoon = true;
        daysLabel = `${remainingHours}시간 남음`;
      }
    }
  }

  return (
    <div className="my-4 md:my-6">
      {/* 컨텐츠 분류 */}
      <div className="flex items-center gap-x-1 md:my-1">
        <div className="my-1 flex flex-wrap gap-1 text-sm">
          <span className="pr-1 py-0.5 text-neutral-500 dark:text-neutral-400">
            {(contentType === "event" || contentType === "pickup") && runType === "rerun" && "복각 "}{contentTypeLocale[contentType]}
          </span>
          {!endless && daysLabel && <ContentTag Icon={ClockIcon} text={daysLabel} color={finishSoon ? "red" : "default"} />}
          {confirmed && (since && sinceDayjs.isAfter(now)) && <ContentTag Icon={CheckCircleIcon} text="확정" color="green" />}
          {raidInfo && raidInfo.rankVisible && <ContentTag Icon={ChartBarIcon} text="순위/통계" color="default" />}
          {tags.includes("recruit_free_100") && recruitments?.every(({ until }) => until !== null && dayjs(until).isAfter(now)) && (
            <ContentTag Icon={StarIcon} text="100회 무료" color="yellow" />
          )}
          {tags.includes("shop") && <ContentTag Icon={CalculatorIcon} text="이벤트 상점" color="default" />}
        </div>
      </div>

      {/* 컨텐츠 이름 */}
      {SHOW_LINK_CONTENT_TYPES.includes(contentType) ? (
        <Link to={link} className="cursor-pointer hover:underline tracking-tight">
          <ContentTitles name={name} showLink={true} />
          {raidInfo && <RaidInfo raid={raidInfo} />}
        </Link> 
      ) : (
        <>
          <ContentTitles name={name} showLink={false} />
          {raidInfo && <RaidInfo raid={raidInfo} />}
        </>
      )}

      {/* 모집 정보 */}
      {recruitments && recruitments.length > 0 && (
        <Recruitments
          contentType={contentType}
          recruitments={recruitments}
          favoritedStudents={favoritedStudents ?? []}
          favoritedCounts={favoritedCounts ?? {}}
          onFavorite={onFavorite}
          link={link}
          eventSince={since ?? null}
          eventUntil={until ?? null}
        />
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
    boss: string;
    terrain: Terrain;
    attackType: Attack;
    defenseTypes: {
      defenseType: Defense;
      difficulty: string | null;
    }[];
  };
};

function RaidInfo({ raid }: RaidInfoProps) {
  return (
    <div className="mt-2 mb-6 relative md:w-96">
      <img
        className="md:w-96 rounded-lg bg-linear-to-br from-neutral-50 to-neutral-300 dark:from-neutral-600 dark:to-neutral-800"
        src={bossImageUrl(raid.boss)} alt={`총력전 보스 ${raid.boss}`} loading="lazy"
      />
      <div className="absolute bottom-0 right-0 flex flex-col items-end gap-y-1 p-1 text-white text-sm">
        <div className="flex gap-x-1">
          <OptionBadge text={terrainLocale[raid.terrain]} bgColor="dark" />
          <OptionBadge text={attackTypeLocale[raid.attackType]} color={attackTypeColor[raid.attackType]} bgColor="dark" />
          {raid.defenseTypes.length === 1 && (
            <OptionBadge
              text={defenseTypeLocale[raid.defenseTypes[0].defenseType]}
              color={defenseTypeColor[raid.defenseTypes[0].defenseType]}
              bgColor="dark"
            />
          )}
        </div>
        {raid.defenseTypes.length > 1 && (
          <div className="flex gap-x-1">
            {raid.defenseTypes.map(({ defenseType }) => (
              <OptionBadge key={defenseType} text={defenseTypeLocale[defenseType]} color={defenseTypeColor[defenseType]} bgColor="dark" />
            ))}
          </div>
        )}
      </div>
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
    } | null;
    since: Date;
    until: Date | null;
  }[];

  favoritedStudents: string[];
  favoritedCounts: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  link: string;

  eventSince: Date | null;
  eventUntil: Date | null;
};

function Recruitments({ contentType, recruitments, favoritedStudents, favoritedCounts, onFavorite, link, eventSince, eventUntil }: RecruitmentsProps) {
  // Group pickups by period (since/until dates)
  const recruitmentDateGroups = useMemo(() => {
    return recruitments.reduce((groups, recruitment) => {
      const sinceKey = dayjs(recruitment.since).format("YYYY-MM-DD");
      const untilKey = recruitment.until ? dayjs(recruitment.until).format("YYYY-MM-DD") : "null";
      const key = `${sinceKey}-${untilKey}`;
      if (!groups[key]) {
        groups[key] = {
          since: recruitment.since,
          until: recruitment.until,
          recruitments: []
        };
      }
      groups[key].recruitments.push(recruitment);
      return groups;
    }, {} as Record<string, { since: Date; until: Date | null; recruitments: RecruitmentsProps["recruitments"] }>)
  }, [recruitments]);

  const recruitDateGroupsArray = Object.values(recruitmentDateGroups);
  const hasMultiplePeriods = recruitDateGroupsArray.length >= 2;

  const firstSince = recruitments[0].since;
  const firstUntil = recruitments[0].until;
  const isPickupDayDifferent = firstSince && firstUntil &&
    (!dayjs(firstSince).isSame(dayjs(eventSince), "day") || !dayjs(firstUntil).isSame(dayjs(eventUntil), "day"));

  const lastUntil = recruitments[recruitments.length - 1].until;

  if (contentType === "fes") {
    return (
      <>


        <TimelineItemBanner
          message="픽업 외 학생은 모집 포인트(천장)로 교환할 수 없어요."
          link={link}
        />
      </>
    )
  }

  if (hasMultiplePeriods) {
    return (
      <>
        {recruitDateGroupsArray.map((group) => {
          return (
            <RecruitmentStudents
              key={`${dayjs(group.since).format("YYYY-MM-DD")}-${dayjs(group.until).format("YYYY-MM-DD")}`}
              title={`${dayjs(group.since).format("MM/DD")} ~ ${dayjs(group.until).format("MM/DD")}`}
              recruitments={group.recruitments}
              favoritedStudents={favoritedStudents ?? []}
              favoritedCounts={favoritedCounts ?? {}}
              onFavorite={onFavorite}
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
      />

      {hasNonPickupRecruitments && (
        <RecruitmentStudents
          title="픽업 대상 외 모집 가능 학생"
          recruitments={recruitments.filter(({ pickup }) => !pickup)}
          favoritedStudents={favoritedStudents ?? []}
          favoritedCounts={favoritedCounts ?? {}}
          onFavorite={onFavorite}
        />
      )}

      {isPickupDayDifferent && (
        <TimelineItemBanner
          message={dayjs(lastUntil).isBefore(dayjs()) ? "학생 모집이 종료되었어요." : "이벤트 개최 기간과 모집 기간이 달라요."}
          link={link}
        />
      )}
    </>
  )
}

type RecruitmentStudentsProps = {
  title?: string;
  recruitments: RecruitmentsProps["recruitments"];
  favoritedStudents: string[];
  favoritedCounts: Record<string, number>;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  showToggle?: boolean;
};

function RecruitmentStudents({ title, recruitments, favoritedStudents, favoritedCounts, onFavorite, showToggle = false }: RecruitmentStudentsProps) {
  const [showCards, setShowCards] = useState(!showToggle);

  if (!showToggle) {
    return (
      <div className="my-2">
        {title && <p className="mt-4 mb-1 font-semibold">{title}</p>}
        <StudentCards
          mobileGrid={5}
          pcGrid={8}
          students={recruitments.map((recruitment) => {
            const student = recruitment.student;
            const colorClass = (recruitment.rerun || recruitment.recruitmentType === "archive" || recruitment.recruitmentType === "recollect" || recruitment.recruitmentType === "encore") ? "text-white" : "text-yellow-500";
            return {
              ...student,
              uid: student?.uid ?? null,
              name: recruitment.studentName,
              label: <span className={`${colorClass}`}>{recruitmentLabelLocale(recruitment)}</span>,
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
              ] : undefined,
            };
          })}
        />
      </div>
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
          students={recruitments.map((recruitment) => {
            const student = recruitment.student;
            const colorClass = (recruitment.rerun || recruitment.recruitmentType === "archive" || recruitment.recruitmentType === "recollect" || recruitment.recruitmentType === "encore") ? "text-white" : "text-yellow-500";
            return {
              ...student,
              uid: student?.uid ?? null,
              name: recruitment.studentName,
              label: <span className={`${colorClass}`}>{recruitmentLabelLocale(recruitment)}</span>,
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
              ] : undefined,
            };
          })}
        />
      )}
    </div>
  );
}
