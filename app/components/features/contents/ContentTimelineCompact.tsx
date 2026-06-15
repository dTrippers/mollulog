import { CheckCircleIcon, HeartIcon as EmptyHeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as FilledHeartIcon } from "@heroicons/react/24/solid";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { StudentCard } from "~/components/features/students";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, formatInstantDateKey, nowUtcIso, parseUtcTimestamp } from "~/lib/date-time";
import { contentTypeLocale } from "~/locales/ko";
import type { RecruitmentCompletionMeta } from "~/models/recruitment-result";
import type { ContentTimelineProps } from "./ContentTimeline";
import { getRecruitmentStudentCards, isContentHeaderLinked } from "./ContentTimelineItem";
import { TimelineDateMarker } from "./TimelineDateMarker";
import { groupContents } from "./content-timeline-grouping";

export type ContentTimelineCompactProps = {
  contents: ContentTimelineProps["contents"];
  favoritedStudents?: { contentUid: string; studentUid: string }[];
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[];
  completedRecruitmentStudents?: { recruitmentGroupUid: string; studentUid: string }[];
  revealedSpoilerContentUids?: string[];
  onRevealSpoiler?: (contentUid: string) => void;
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void;
  onRecruitmentComplete?: (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
    recruitment: RecruitmentCompletionMeta,
  ) => void;
};

export default function ContentTimelineCompact({
  contents,
  favoritedStudents,
  favoritedCounts,
  completedRecruitmentStudents = [],
  revealedSpoilerContentUids = [],
  onRevealSpoiler,
  onFavorite,
  onRecruitmentComplete,
}: ContentTimelineCompactProps) {
  const displayTimeZone = useDisplayTimeZone();
  const contentGroups = useMemo(() => groupContents(contents, displayTimeZone), [contents, displayTimeZone]);
  const favoriteStudentIdsByContents = useMemo(() => {
    const aggregatedResult: Record<string, Record<string, number>> = {};
    for (const { contentUid, studentUid, count } of favoritedCounts) {
      if (!aggregatedResult[contentUid]) {
        aggregatedResult[contentUid] = {};
      }
      aggregatedResult[contentUid][studentUid] = count;
    }
    return aggregatedResult;
  }, [favoritedCounts]);

  if (contents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="my-24 text-neutral-500 dark:text-neutral-400">필터 조건에 해당하는 컨텐츠가 없어요.</p>
      </div>
    );
  }

  const today = nowUtcIso();
  const showsTerminalMarker = !!contents[contents.length - 1].until;
  return (
    <div className="relative">
      <div
        className={`absolute left-1.5 top-6 w-px bg-neutral-200 dark:bg-neutral-700 ${
          showsTerminalMarker ? "bottom-6" : "bottom-0"
        }`}
      />
      {contentGroups.map((group) => {
        const isCurrent = group.groupDate === null;
        const groupDateKey = group.groupDate ? formatInstantDateKey(group.groupDate, displayTimeZone) : "current";
        return (
          <div key={isCurrent ? "current" : groupDateKey}>
            <TimelineDateMarker current={isCurrent} compact>
              {isCurrent
                ? "진행중인 컨텐츠"
                : group.groupDate
                  ? formatInstant(group.groupDate, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })
                  : ""}
            </TimelineDateMarker>

            <div className="flex">
              <div className="flex w-3 shrink-0 justify-center" />
              <div className="min-w-0 flex-1 pl-3 pb-5 md:pl-5 md:pb-7">
                {group.contents.map((content) => {
                  const spoilerVisible = !content.isSpoiler || revealedSpoilerContentUids.includes(content.uid);
                  return (
                    <CompactContentItem
                      key={content.uid}
                      content={content}
                      spoilerVisible={spoilerVisible}
                      favoritedStudents={favoritedStudents
                        ?.filter(({ contentUid }) => contentUid === content.uid)
                        .map(({ studentUid }) => studentUid)}
                      favoritedCounts={favoriteStudentIdsByContents[content.uid]}
                      completedStudentUids={
                        content.recruitmentGroupUid
                          ? completedRecruitmentStudents
                              .filter((student) => student.recruitmentGroupUid === content.recruitmentGroupUid)
                              .map((student) => student.studentUid)
                          : []
                      }
                      onRevealSpoiler={() => onRevealSpoiler?.(content.uid)}
                      onFavorite={(studentUid, favorited) => onFavorite?.(content.uid, studentUid, favorited)}
                      onRecruitmentComplete={
                        content.recruitmentGroupUid
                          ? (studentUid, completed, recruitment) =>
                              onRecruitmentComplete?.(
                                content.uid,
                                content.recruitmentGroupUid as string,
                                studentUid,
                                completed,
                                recruitment,
                              )
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {showsTerminalMarker && (
        <TimelineDateMarker compact>
          {`남은 미래시까지 D-${parseUtcTimestamp(contents[contents.length - 1].until ?? today).diff(parseUtcTimestamp(today), "day")}`}
        </TimelineDateMarker>
      )}
    </div>
  );
}

function CompactContentItem({
  content,
  spoilerVisible,
  favoritedStudents = [],
  favoritedCounts = {},
  completedStudentUids,
  onRevealSpoiler,
  onFavorite,
  onRecruitmentComplete,
}: {
  content: ContentTimelineProps["contents"][number];
  spoilerVisible: boolean;
  favoritedStudents?: string[];
  favoritedCounts?: Record<string, number>;
  completedStudentUids: string[];
  onRevealSpoiler?: () => void;
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  onRecruitmentComplete?: (studentUid: string, completed: boolean, recruitment: RecruitmentCompletionMeta) => void;
}) {
  const navigate = useNavigate();
  const hiddenSpoiler = content.isSpoiler && !spoilerVisible;
  const linked = isContentHeaderLinked({
    contentType: content.contentType,
    raidInfo: content.raidInfo,
    isSpoiler: content.isSpoiler,
    spoilerVisible,
  });
  const title = hiddenSpoiler ? "???" : content.name.split("\n").join(" ");
  const label = getContentTypeLabel(content);
  const lineContent = (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="min-w-0 truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100 sm:text-sm group-hover:underline">
        {title}
      </span>
    </span>
  );
  const lineClassName =
    "group w-full cursor-pointer rounded-md px-1.5 py-1 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-800";

  return (
    <div className="py-0.5">
      {hiddenSpoiler || linked ? (
        <button
          type="button"
          className={lineClassName}
          onClick={() => {
            if (hiddenSpoiler) {
              if (window.confirm("스포일러가 포함된 컨텐츠에요. 표시할까요?")) {
                onRevealSpoiler?.();
              }
              return;
            }

            navigate(content.link);
          }}
        >
          {lineContent}
        </button>
      ) : (
        <div className="px-1.5 py-1">{lineContent}</div>
      )}

      {spoilerVisible && content.recruitments && content.recruitments.length > 0 && (
        <CompactRecruitmentStudents
          recruitments={content.recruitments}
          favoritedStudents={favoritedStudents}
          favoritedCounts={favoritedCounts}
          completedStudentUids={completedStudentUids}
          onFavorite={onFavorite}
          onRecruitmentComplete={onRecruitmentComplete}
        />
      )}
    </div>
  );
}

function CompactRecruitmentStudents({
  recruitments,
  favoritedStudents,
  favoritedCounts,
  completedStudentUids,
  onFavorite,
  onRecruitmentComplete,
}: {
  recruitments: NonNullable<ContentTimelineProps["contents"][number]["recruitments"]>;
  favoritedStudents: string[];
  favoritedCounts: Record<string, number>;
  completedStudentUids: string[];
  onFavorite?: (studentUid: string, favorited: boolean) => void;
  onRecruitmentComplete?: (studentUid: string, completed: boolean, recruitment: RecruitmentCompletionMeta) => void;
}) {
  const students = useMemo(
    () =>
      getRecruitmentStudentCards({
        recruitments,
        favoritedStudents,
        favoritedCounts,
        onFavorite,
        completedStudentUids,
        onRecruitmentComplete,
        detailedLinkText: "학생부 보기 (평가/통계)",
      }).map((student) => ({
        ...student,
        label: <span className="whitespace-nowrap">{student.label}</span>,
      })),
    [completedStudentUids, favoritedCounts, favoritedStudents, onFavorite, onRecruitmentComplete, recruitments],
  );

  return (
    <div className="mt-1 mb-3 flex gap-x-1.5 overflow-x-auto overflow-y-hidden">
      {students.map((student) => {
        const StatusIcon = student.state?.completed
          ? CheckCircleIcon
          : student.state?.favorited
            ? FilledHeartIcon
            : EmptyHeartIcon;
        const statusClassName = student.state?.completed
          ? "text-green-500 dark:text-green-400"
          : student.state?.favorited
            ? "text-red-500 dark:text-red-400"
            : "text-neutral-500 dark:text-neutral-400";

        return (
          <div key={student.uid ?? student.name} className="w-12 shrink-0 sm:w-14">
            <StudentCard {...student} namePlacement="overlay" />
            <div
              className={`mt-0.5 flex items-center justify-center gap-0.5 text-xs font-semibold leading-none ${statusClassName}`}
            >
              <StatusIcon className="size-3" />
              <span>{student.state?.favoritedCount ?? 0}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getContentTypeLabel(content: ContentTimelineProps["contents"][number]): string {
  if ((content.contentType === "event" || content.contentType === "pickup") && content.runType === "rerun") {
    return `복각 ${contentTypeLocale[content.contentType]}`;
  }

  if (content.contentType === "event" && content.runType === "permanent") {
    return "이벤트 상설화";
  }

  return contentTypeLocale[content.contentType];
}
