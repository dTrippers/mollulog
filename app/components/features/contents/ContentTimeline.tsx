import { useMemo } from "react";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import {
  type UtcIsoString,
  compareInstantAsc,
  formatInstant,
  formatInstantDateKey,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
  parseUtcTimestamp,
} from "~/lib/date-time";
import { CONTENT_ORDER } from "~/models/content-rules";
import type { EventType, RaidType } from "~/models/content.d";
import type { ContentTimelineItemProps } from "./ContentTimelineItem";
import { ContentTimelineItem } from "./ContentTimelineItem";

export type ContentTimelineProps = {
  contents: {
    name: string;
    since: UtcIsoString;
    until: UtcIsoString | null;
    endless: boolean;
    runType: "first" | "rerun" | "permanent";
    uid: string;
    recruitmentGroupUid?: string | null;
    link: string;
    contentType: EventType | RaidType;
    confirmed?: boolean;
    isSpoiler: boolean;
    tags: string[];
    recruitments?: ContentTimelineItemProps["recruitments"];
    raidInfo?: ContentTimelineItemProps["raidInfo"];

    allComments?: ContentTimelineItemProps["allComments"];
  }[];

  favoritedStudents?: { contentUid: string; studentUid: string }[];
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[];
  completedRecruitmentStudents?: { recruitmentGroupUid: string; studentUid: string }[];
  recruitmentResultEditLinks?: { recruitmentGroupUid: string; link: string }[];

  signedIn: boolean;
  revealedSpoilerContentUids?: string[];
  onRevealSpoiler?: (contentUid: string) => void;
  onHideSpoiler?: (contentUid: string) => void;
  onCommentCreate?: (contentUid: string, body: string, visibility: "private" | "public") => void;
  onCommentCreateSubcomment?: (
    contentUid: string,
    parentCommentId: string,
    body: string,
    visibility: "private" | "public",
  ) => void;
  onCommentUpdate?: (contentUid: string, commentUid: string, body: string, visibility: "private" | "public") => void;
  onCommentDelete?: (contentUid: string, commentUid: string) => void;
  onCommentPin?: (contentUid: string, commentUid: string) => void;
  onCommentUnpin?: (contentUid: string) => void;
  isSubmittingComment?: boolean;
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void;
  onRecruitmentComplete?: (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
  ) => void;
};

type ContentGroup = {
  groupDate: UtcIsoString | null;
  contents: ContentTimelineProps["contents"];
};

function groupContents(contents: ContentTimelineProps["contents"], timeZone: string): ContentGroup[] {
  const groups: ContentGroup[] = [];

  const now = nowUtcIso();
  for (const content of [...contents].sort((a, b) => compareInstantAsc(a.since, b.since))) {
    const isCurrent =
      isInstantBefore(content.since, now) && (content.until === null || isInstantAfter(content.until, now));

    const groupDate = isCurrent ? null : content.since;
    const lastGroup = groups[groups.length - 1];
    if (
      (lastGroup?.groupDate === null && isCurrent) ||
      (lastGroup?.groupDate &&
        groupDate &&
        formatInstantDateKey(lastGroup.groupDate, timeZone) === formatInstantDateKey(groupDate, timeZone))
    ) {
      lastGroup.contents.push(content);
    } else {
      groups.push({ groupDate, contents: [content] });
    }
  }

  return groups.map(({ groupDate, contents }) => ({
    groupDate,
    contents: contents.sort((a, b) => CONTENT_ORDER.indexOf(a.contentType) - CONTENT_ORDER.indexOf(b.contentType)),
  }));
}

export default function ContentTimeline({
  contents,
  favoritedStudents,
  favoritedCounts,
  completedRecruitmentStudents = [],
  recruitmentResultEditLinks = [],
  revealedSpoilerContentUids = [],
  onRevealSpoiler,
  onHideSpoiler,
  onCommentCreate,
  onCommentCreateSubcomment,
  onCommentUpdate,
  onCommentDelete,
  onCommentPin,
  onCommentUnpin,
  onFavorite,
  onRecruitmentComplete,
  isSubmittingComment,
  signedIn,
}: ContentTimelineProps) {
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
  return (
    <>
      {contentGroups.map((group) => {
        const isCurrent = group.groupDate === null;
        const groupDateKey = group.groupDate ? formatInstantDateKey(group.groupDate, displayTimeZone) : "current";
        return (
          <div key={isCurrent ? "current" : groupDateKey}>
            {/* 날짜 구분자 영역 */}
            {isCurrent ? (
              <div className="flex items-center">
                <div className="inline-block size-3 bg-red-600 rounded-full animate-pulse" />
                <span className="mx-2 md:mx-4 font-bold text-red-600">진행중인 컨텐츠</span>
              </div>
            ) : (
              <div className="flex items-center">
                <div className="inline-block size-3 bg-neutral-500 dark:bg-neutral-400 rounded-full" />
                <span className="mx-2 md:mx-4 font-bold text-neutral-500 dark:text-neutral-400 text-sm ">
                  {group.groupDate
                    ? formatInstant(group.groupDate, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })
                    : ""}
                </span>
              </div>
            )}

            {/* 컨텐츠 목록 영역 */}
            <div className="flex">
              <div className="w-3 h-parent flex justify-center shrink-0">
                <div className="w-px h-full bg-neutral-200 dark:bg-neutral-700" />
              </div>
              <div className="min-w-0 flex-1 pl-3 pb-4 md:pl-5 md:pb-8">
                {group.contents.map((content) => {
                  const showComments = !!onCommentCreate && !!content.recruitments && content.recruitments.length > 0;
                  return (
                    <ContentTimelineItem
                      key={content.uid}
                      confirmed={content.confirmed}
                      {...content}
                      spoilerVisible={!content.isSpoiler || revealedSpoilerContentUids.includes(content.uid)}
                      onRevealSpoiler={content.isSpoiler ? () => onRevealSpoiler?.(content.uid) : undefined}
                      onHideSpoiler={content.isSpoiler ? () => onHideSpoiler?.(content.uid) : undefined}
                      allComments={content.allComments}
                      onCommentCreate={
                        showComments
                          ? (body, visibility) => onCommentCreate?.(content.uid, body, visibility)
                          : undefined
                      }
                      onCommentCreateSubcomment={
                        showComments
                          ? (parentCommentId, body, visibility) =>
                              onCommentCreateSubcomment?.(content.uid, parentCommentId, body, visibility)
                          : undefined
                      }
                      onCommentUpdate={
                        showComments
                          ? (commentUid, body, visibility) =>
                              onCommentUpdate?.(content.uid, commentUid, body, visibility)
                          : undefined
                      }
                      onCommentDelete={
                        showComments ? (commentUid) => onCommentDelete?.(content.uid, commentUid) : undefined
                      }
                      onCommentPin={showComments ? (commentUid) => onCommentPin?.(content.uid, commentUid) : undefined}
                      onCommentUnpin={showComments ? () => onCommentUnpin?.(content.uid) : undefined}
                      favoritedStudents={favoritedStudents
                        ?.filter(({ contentUid }) => contentUid === content.uid)
                        .map(({ studentUid }) => studentUid)}
                      favoritedCounts={favoriteStudentIdsByContents[content.uid]}
                      onFavorite={(studentUid, favorited) => onFavorite?.(content.uid, studentUid, favorited)}
                      completedStudentUids={
                        content.recruitmentGroupUid
                          ? completedRecruitmentStudents
                              .filter((student) => student.recruitmentGroupUid === content.recruitmentGroupUid)
                              .map((student) => student.studentUid)
                          : []
                      }
                      recruitmentResultEditLink={
                        content.recruitmentGroupUid
                          ? recruitmentResultEditLinks.find(
                              (item) => item.recruitmentGroupUid === content.recruitmentGroupUid,
                            )?.link
                          : undefined
                      }
                      onRecruitmentComplete={
                        content.recruitmentGroupUid
                          ? (studentUid, completed) =>
                              onRecruitmentComplete?.(
                                content.uid,
                                content.recruitmentGroupUid as string,
                                studentUid,
                                completed,
                              )
                          : undefined
                      }
                      isSubmittingComment={isSubmittingComment}
                      signedIn={signedIn}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {contents[contents.length - 1].until && (
        <div className="flex items-center">
          <div className="inline-block size-3 bg-neutral-500 dark:bg-neutral-400 rounded-full" />
          <span className="mx-2 md:mx-4 font-bold text-neutral-500 dark:text-neutral-400 text-sm ">
            {`남은 미래시까지 D-${parseUtcTimestamp(contents[contents.length - 1].until ?? today).diff(parseUtcTimestamp(today), "day")}`}
          </span>
        </div>
      )}
    </>
  );
}
