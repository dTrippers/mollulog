import dayjs from "dayjs";
import { useMemo } from "react";
import type { ContentTimelineItemProps } from "./ContentTimelineItem";
import { ContentTimelineItem } from "./ContentTimelineItem";
import type { EventType, RaidType } from "~/models/content.d";

export type ContentTimelineProps = {
  contents: {
    name: string;
    since: Date;
    until: Date;
    endless: boolean;
    rerun: boolean;
    uid: string;
    link: string;
    contentType: EventType | RaidType;
    hasShopData?: boolean;
    pickups?: ContentTimelineItemProps["pickups"];
    raidInfo?: ContentTimelineItemProps["raidInfo"];

    allComments?: ContentTimelineItemProps["allComments"];
  }[];

  favoritedStudents?: { contentUid: string, studentUid: string }[];
  favoritedCounts: { contentUid: string, studentUid: string, count: number }[];

  signedIn: boolean;
  onCommentCreate?: (contentUid: string, body: string, visibility: "private" | "public") => void;
  onCommentCreateSubcomment?: (contentUid: string, parentCommentId: string, body: string, visibility: "private" | "public") => void;
  onCommentUpdate?: (contentUid: string, commentUid: string, body: string, visibility: "private" | "public") => void;
  onCommentDelete?: (contentUid: string, commentUid: string) => void;
  onCommentPin?: (contentUid: string, commentUid: string) => void;
  onCommentUnpin?: (contentUid: string) => void;
  isSubmittingComment?: boolean;
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void;
};

type ContentGroup = {
  groupDate: Date | null;
  contents: ContentTimelineProps["contents"];
};

export const contentOrders: (EventType | RaidType)[] = [
  "update",
  "fes",
  "event",
  "immortal_event",
  "main_story",
  "pickup",
  "archive_pickup",
  "collab",
  "total_assault",
  "elimination",
  "unlimit",
  "campaign",
  "exercise",
  "mini_event",
  "guide_mission",
  "battle_pass",
];

function groupContents(contents: ContentTimelineProps["contents"]): ContentGroup[] {
  const groups: { groupDate: dayjs.Dayjs | null, contents: ContentTimelineProps["contents"] }[] = [];

  const now = dayjs();
  contents.sort((a, b) => a.since.getTime() - b.since.getTime()).forEach((content) => {
    const since = dayjs(content.since);
    const until = dayjs(content.until);
    const isCurrent = since.isBefore(now) && until.isAfter(now);

    const groupDate = isCurrent ? null : since.startOf("day");
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && (lastGroup.groupDate === null && isCurrent) || (lastGroup && lastGroup.groupDate?.isSame(groupDate, "day"))) {
      lastGroup.contents.push(content);
    } else {
      groups.push({ groupDate, contents: [content] });
    }
  });

  return groups.map(({ groupDate, contents }) => ({
    groupDate: groupDate?.toDate() ?? null,
    contents: contents.sort((a, b) => contentOrders.indexOf(a.contentType) - contentOrders.indexOf(b.contentType)),
  }));
}

export default function ContentTimeline({ contents, favoritedStudents, favoritedCounts, onCommentCreate, onCommentCreateSubcomment, onCommentUpdate, onCommentDelete, onCommentPin, onCommentUnpin, onFavorite, isSubmittingComment, signedIn }: ContentTimelineProps) {
  const contentGroups = useMemo(() => groupContents(contents), [contents]);
  const favoriteStudentIdsByContents = useMemo(() => {
    const aggregatedResult: Record<string, Record<string, number>> = {};
    favoritedCounts.forEach(({ contentUid, studentUid, count }) => {
      if (!aggregatedResult[contentUid]) {
        aggregatedResult[contentUid] = {};
      }
      aggregatedResult[contentUid][studentUid] = count;
    });
    return aggregatedResult;
  }, [favoritedCounts]);

  if (contents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="my-24 text-neutral-500 dark:text-neutral-400">필터 조건에 해당하는 컨텐츠가 없어요.</p>
      </div>
    );
  }

  const today = dayjs();
  return (
    <>
      {contentGroups.map((group) => {
        const isCurrent = group.groupDate === null;
        const groupDate = isCurrent ? dayjs() : dayjs(group.groupDate);
        return (
          <div key={isCurrent ? "current" : groupDate.format("YYYY-MM-DD")}>
            {/* 날짜 구분자 영역 */}
            {isCurrent ? (
              <div className="flex items-center">
                <div className="inline-block size-3 bg-red-600 rounded-full animate-pulse" />
                <span className="mx-2 md:mx-4 font-bold text-red-600">
                  진행중인 컨텐츠
                </span>
              </div>
            ) : (
              <div className="flex items-center">
                <div className="inline-block size-3 bg-neutral-500 dark:bg-neutral-400 rounded-full" />
                <span className="mx-2 md:mx-4 font-bold text-neutral-500 dark:text-neutral-400 text-sm ">
                  {groupDate.format("YYYY-MM-DD")}
                </span>
              </div>
            )}

            {/* 컨텐츠 목록 영역 */}
            <div className="flex">
              <div className="w-3 h-parent flex justify-center shrink-0">
                <div className="w-px h-full bg-neutral-200 dark:bg-neutral-700" />
              </div>
              <div className="pl-3 md:pl-5 pb-4 md:pb-8">
                {group.contents.map((content) => {
                  const showComments = !!onCommentCreate && !!content.pickups && content.pickups.length > 0;
                  return (
                    <ContentTimelineItem
                      key={content.uid}
                      {...content}

                      allComments={content.allComments}
                      onCommentCreate={showComments ? (body, visibility) => onCommentCreate?.(content.uid, body, visibility) : undefined}
                      onCommentCreateSubcomment={showComments ? (parentCommentId, body, visibility) => onCommentCreateSubcomment?.(content.uid, parentCommentId, body, visibility) : undefined}
                      onCommentUpdate={showComments ? (commentUid, body, visibility) => onCommentUpdate?.(content.uid, commentUid, body, visibility) : undefined}
                      onCommentDelete={showComments ? (commentUid) => onCommentDelete?.(content.uid, commentUid) : undefined}
                      onCommentPin={showComments ? (commentUid) => onCommentPin?.(content.uid, commentUid) : undefined}
                      onCommentUnpin={showComments ? () => onCommentUnpin?.(content.uid) : undefined}

                      favoritedStudents={favoritedStudents?.filter(({ contentUid }) => contentUid === content.uid).map(({ studentUid }) => studentUid)}
                      favoritedCounts={favoriteStudentIdsByContents[content.uid]}
                      onFavorite={(studentUid, favorited) => onFavorite?.(content.uid, studentUid, favorited)}

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

      <div className="flex items-center">
        <div className="inline-block size-3 bg-neutral-500 dark:bg-neutral-400 rounded-full" />
        <span className="mx-2 md:mx-4 font-bold text-neutral-500 dark:text-neutral-400 text-sm ">
          {`남은 미래시까지 D-${dayjs(contents[contents.length - 1].until).diff(today, "day")}`}
        </span>
      </div>
    </>
  );
}
