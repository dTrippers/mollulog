import { useEffect, useMemo, useState } from "react";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { type UtcIsoString, formatInstant, formatInstantDateKey, nowUtcIso, parseUtcTimestamp } from "~/lib/date-time";
import type { EventType, RaidType } from "~/models/content.d";
import type { RecruitmentCompletionMeta } from "~/models/recruitment-result";
import type { ContentTimelineFeatureBannerId, ContentTimelineItemProps } from "./ContentTimelineItem";
import { ContentTimelineItem } from "./ContentTimelineItem";
import { groupContents } from "./content-timeline-grouping";

const featureBannerDismissalStorageKey = "futures::dismissed-feature-banners";
const featureBannerIds: ContentTimelineFeatureBannerId[] = ["student-analysis", "pending-student-favorite"];

function parseDismissedFeatureBannerIds(value: string | null): ContentTimelineFeatureBannerId[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is ContentTimelineFeatureBannerId => featureBannerIds.includes(item));
  } catch {
    return [];
  }
}

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
    showStudentAnalysisFeatureBanner?: boolean;
    showPendingStudentFavoriteFeatureBanner?: boolean;

    allComments?: ContentTimelineItemProps["allComments"];
    commentSummary?: ContentTimelineItemProps["commentSummary"];
    isLoadingComments?: boolean;
  }[];

  favoritedStudents?: { contentUid: string; studentUid: string }[];
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[];
  completedRecruitmentStudents?: { recruitmentGroupUid: string; studentUid: string }[];
  recruitmentResultEditLinks?: { recruitmentGroupUid: string; link: string }[];

  signedIn: boolean;
  showFeatureBanners?: boolean;
  revealedSpoilerContentUids?: string[];
  onRevealSpoiler?: (contentUid: string) => void;
  onHideSpoiler?: (contentUid: string) => void;
  onCommentOpen?: (contentUid: string) => void;
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
    recruitment: RecruitmentCompletionMeta,
  ) => void;
};

export default function ContentTimeline({
  contents,
  favoritedStudents,
  favoritedCounts,
  completedRecruitmentStudents = [],
  recruitmentResultEditLinks = [],
  revealedSpoilerContentUids = [],
  onRevealSpoiler,
  onHideSpoiler,
  onCommentOpen,
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
  showFeatureBanners = false,
}: ContentTimelineProps) {
  const displayTimeZone = useDisplayTimeZone();
  const [dismissedFeatureBannerIds, setDismissedFeatureBannerIds] = useState<ContentTimelineFeatureBannerId[]>([]);
  const [featureBannerDismissalsLoaded, setFeatureBannerDismissalsLoaded] = useState(false);
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

  useEffect(() => {
    setDismissedFeatureBannerIds(
      parseDismissedFeatureBannerIds(localStorage.getItem(featureBannerDismissalStorageKey)),
    );
    setFeatureBannerDismissalsLoaded(true);
  }, []);

  const dismissFeatureBanner = (bannerId: ContentTimelineFeatureBannerId) => {
    setDismissedFeatureBannerIds((prev) => {
      if (prev.includes(bannerId)) {
        return prev;
      }

      const next = [...prev, bannerId];
      localStorage.setItem(featureBannerDismissalStorageKey, JSON.stringify(next));
      return next;
    });
  };

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
                  const spoilerVisible = !content.isSpoiler || revealedSpoilerContentUids.includes(content.uid);
                  return (
                    <ContentTimelineItem
                      key={content.uid}
                      confirmed={content.confirmed}
                      {...content}
                      spoilerVisible={spoilerVisible}
                      onRevealSpoiler={content.isSpoiler ? () => onRevealSpoiler?.(content.uid) : undefined}
                      onHideSpoiler={content.isSpoiler ? () => onHideSpoiler?.(content.uid) : undefined}
                      allComments={content.allComments}
                      commentSummary={content.commentSummary}
                      isLoadingComments={content.isLoadingComments}
                      onCommentOpen={showComments ? () => onCommentOpen?.(content.uid) : undefined}
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
                      showStudentAnalysisFeatureBanner={
                        showFeatureBanners &&
                        featureBannerDismissalsLoaded &&
                        spoilerVisible &&
                        content.showStudentAnalysisFeatureBanner &&
                        !dismissedFeatureBannerIds.includes("student-analysis")
                      }
                      showPendingStudentFavoriteFeatureBanner={
                        showFeatureBanners &&
                        featureBannerDismissalsLoaded &&
                        spoilerVisible &&
                        content.showPendingStudentFavoriteFeatureBanner &&
                        !dismissedFeatureBannerIds.includes("pending-student-favorite")
                      }
                      onFeatureBannerDismiss={dismissFeatureBanner}
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
