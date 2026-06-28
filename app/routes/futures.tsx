import { Bars3BottomLeftIcon, FunnelIcon, QueueListIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type HeadersFunction,
  type LoaderFunctionArgs,
  type MetaFunction,
  data,
  useFetcher,
  useLoaderData,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { ContentTimeline, ContentTimelineCompact } from "~/components/features/contents";
import type { ContentTimelineProps } from "~/components/features/contents";
import { ContentFilterPanel } from "~/components/features/futures";
import type { ContentFilterState } from "~/components/features/futures/content-filter-state";
import { Page } from "~/components/features/layout";
import { useSignIn } from "~/contexts/SignInProvider";
import { compareInstantAsc, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import { getLogger } from "~/lib/observability.server";
import { ServerTiming, shouldLogTiming } from "~/lib/server-timing.server";
import { canonicalLink } from "~/lib/seo";
import {
  type ContentCommentSummary,
  type NestedComment,
  getContentsCommentSummaries,
} from "~/models/content";
import { type FutureContent, getFutureContents } from "~/views/futures";
import type { EventType, RaidType } from "~/models/content.d";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { raidTypeToParam } from "~/domain/raid";
import { getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import {
  type RecruitmentCompletionMeta,
  getRecruitmentResultsByRecruitmentGroupUids,
} from "~/models/recruitment-result";
import { applyRecruitmentResultStudentCompletion } from "~/domain/recruitment-result";
import type { ActionData as ContentsActionData } from "./api.contents";
import type { ActionData as CommentActionData } from "./api.contents.$uid.comments";
import type { ActionData as RecruitmentResultActionData } from "./api.recruitment-results";
import FutureRecruitmentTable from "./futures._components/FutureRecruitmentTable";
import type { FutureRecruitmentTableContent } from "./futures._components/future-recruitment-table-model";

export const meta: MetaFunction = ({ location }) => {
  const title = "블루 아카이브 이벤트, 픽업 미래시";
  const description = "블루 아카이브 한국 서버의 이벤트 및 총력전, 픽업 미래시 정보 모음";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "futures.loader" });
  const timing = new ServerTiming();
  const startedAt = Date.now();

  const rawContentsPromise = timing.measure("future_contents", () => getFutureContents(env, false, ctx));
  const currentUserPromise = timing.measure("auth", () => getActiveSensei(env, request));
  const [rawContents, currentUser] = await Promise.all([rawContentsPromise, currentUserPromise]);
  const contents: FutureContentsLoaderContent[] = rawContents.map((content: FutureContent) => ({
    uid: content.uid,
    name: content.name,
    startAt: content.startAt,
    endAt: content.endAt,
    endless: content.endless,
    contentType: content.contentType,
    runType: content.runType,
    contentUid: content.contentUid,
    recruitmentGroupUid: content.recruitmentGroupUid,
    imageUrl: content.imageUrl,
    confirmed: content.confirmed,
    isSpoiler: content.isSpoiler,
    tags: content.tags,
    recruitments: content.recruitments.map(normalizeFutureRecruitment),
    raidInfo: content.raidInfo,
  }));

  const allStudentUids = contents
    .flatMap((content: FutureContentsLoaderContent) =>
      content.recruitments.map((recruitment: FutureRecruitment) => recruitment.favoriteKey),
    )
    .filter((uid): uid is string => typeof uid === "string" && uid.length > 0);

  const currentUserId = currentUser?.id;
  const signedIn = currentUser !== null;
  const recruitmentGroupUids = contents
    .map((content) => content.recruitmentGroupUid)
    .filter((uid): uid is string => uid !== null);
  const [commentSummaries, favoritedStudents, favoritedCounts, recruitmentResults] = await Promise.all([
    timing.measure("comment_summaries", () =>
      getContentsCommentSummaries(
        env,
        contents.map((content: FutureContentsLoaderContent) => content.uid),
        currentUserId,
      ),
    ),
    currentUserId ? timing.measure("favorited_students", () => getUserFavoritedStudents(env, currentUserId)) : null,
    timing.measure("favorited_counts", () => getFavoritedCounts(env, allStudentUids)),
    currentUserId
      ? timing.measure("recruitment_results", () =>
          getRecruitmentResultsByRecruitmentGroupUids(env, currentUserId, recruitmentGroupUids),
        )
      : [],
  ]);

  const payload: FutureContentsLoaderData = {
    signedIn,
    contents,
    favoritedStudents,
    favoritedCounts,
    recruitmentResults,
    commentSummaries,
  };

  timing.add("total", Date.now() - startedAt);
  if (shouldLogTiming()) {
    logger.info("loader_timing", { route: "futures", signedIn, ...timing.toMetrics() });
  }

  return data(payload, { headers: { "Server-Timing": timing.header() } });
};

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
  const responseHeaders: Record<string, string> = {};
  const serverTiming = [parentHeaders.get("Server-Timing"), loaderHeaders.get("Server-Timing")]
    .filter((value): value is string => Boolean(value))
    .join(", ");
  if (serverTiming) {
    responseHeaders["Server-Timing"] = serverTiming;
  }
  return responseHeaders;
};

function normalizeFutureRecruitment(recruitment: FutureRecruitment): FutureRecruitment {
  return {
    ...recruitment,
    favoriteKey: recruitment.favoriteKey ?? getRecruitmentFavoriteKey(recruitment),
  };
}

function equalFavorites(
  a: { contentUid: string; studentUid: string },
  b: { contentUid: string; studentUid: string },
): boolean {
  return a.contentUid === b.contentUid && a.studentUid === b.studentUid;
}

const futuresContentFilterKey = "futures::content-filter";
const futuresContentViewKey = "futures::content-view";

type FutureContentView = "timeline" | "table" | "compact";
type CommentVisibility = "private" | "public";
type FavoritedStudentState = { contentUid: string; studentUid: string };
type FavoritedCountState = FavoritedStudentState & { count: number };
type FutureContentForView = Pick<
  FutureContent,
  | "uid"
  | "name"
  | "startAt"
  | "endAt"
  | "endless"
  | "contentType"
  | "runType"
  | "imageUrl"
  | "confirmed"
  | "isSpoiler"
  | "tags"
  | "recruitments"
  | "raidInfo"
>;
type FutureContentsLoaderContent = FutureContentForView & Pick<FutureContent, "contentUid" | "recruitmentGroupUid">;
type RecruitmentResultState = {
  uid: string;
  recruitmentGroupUid: string;
  contentUid: string | null;
  completedAt: string | null;
  recruitedStudents: { studentUid: string; tier: number; pickup: boolean }[];
  exchangedStudents: { studentUid: string; tier: number; pickup: boolean }[];
};
type FavoriteStudentLoaderData = { contentId: string; studentId: string };
type FavoritedCountLoaderData = FavoriteStudentLoaderData & { count: number };
type FutureContentsLoaderData = {
  signedIn: boolean;
  contents: FutureContentsLoaderContent[];
  favoritedStudents: FavoriteStudentLoaderData[] | null;
  favoritedCounts: FavoritedCountLoaderData[];
  recruitmentResults: RecruitmentResultState[];
  commentSummaries: Record<string, ContentCommentSummary>;
};
type AllCommentsState = Record<string, NestedComment[]>;
type FutureRecruitment = FutureContent["recruitments"][number];
type CompletedRecruitmentStudentState = { recruitmentGroupUid: string; studentUid: string };
type RecruitmentResultEditLinkState = { recruitmentGroupUid: string; link: string };

function getContentLink(content: {
  contentType: EventType | RaidType;
  raidInfo?: { raidType: RaidType; seasonIndex?: number } | undefined;
  uid: string;
}) {
  if (content.contentType !== "raid") {
    return `/events/${content.uid}`;
  }

  return content.raidInfo?.seasonIndex != null
    ? `/raids/${raidTypeToParam(content.raidInfo.raidType)}/${content.raidInfo.seasonIndex}`
    : "/raids";
}

function getCommonContentFields(content: FutureContentForView) {
  const raidInfo = content.raidInfo;
  return {
    uid: content.uid,
    runType: content.runType,
    since: content.startAt,
    until: content.endAt,
    startAt: content.startAt,
    endAt: content.endAt,
    endless: content.endless,
    confirmed: content.confirmed,
    isSpoiler: content.isSpoiler,
    tags: content.tags,
    link: getContentLink(content),
    raidInfo,
    contentType: raidInfo?.raidType ?? content.contentType,
  };
}

function getEarliestUpcomingPickupAt(content: FutureContentsLoaderContent, now: string): string | null {
  const upcomingPickup = content.recruitments
    .filter(
      (recruitment) => recruitment.pickup && recruitment.student !== null && isInstantAfter(recruitment.since, now),
    )
    .sort((a, b) => compareInstantAsc(a.since, b.since))[0];

  return upcomingPickup?.since ?? null;
}

function getStudentAnalysisFeatureBannerContentUid(
  contents: FutureContentsLoaderContent[],
  now: string,
): string | null {
  const target = contents
    .map((content) => ({
      content,
      upcomingPickupAt: getEarliestUpcomingPickupAt(content, now),
    }))
    .filter((item): item is { content: FutureContentsLoaderContent; upcomingPickupAt: string } =>
      Boolean(item.upcomingPickupAt),
    )
    .sort((a, b) => compareInstantAsc(a.upcomingPickupAt, b.upcomingPickupAt))[0];

  return target?.content.uid ?? null;
}

function hasPendingStudentRecruitment(content: FutureContentsLoaderContent): boolean {
  return content.recruitments.some((recruitment) => recruitment.student === null && Boolean(recruitment.favoriteKey));
}

export default function FutureContents() {
  const [filter, setFilter] = useState<ContentFilterState>({ types: [], onlyPickups: false });
  const [view, setView] = useState<FutureContentView>("timeline");
  const [revealedSpoilerContentUids, setRevealedSpoilerContentUids] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  const { showSignIn } = useSignIn();

  useEffect(() => {
    setIsHydrated(true);
    const saved = localStorage.getItem(futuresContentFilterKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFilter(parsed);
      } catch (e) {
        console.warn("Failed to parse saved content filter:", e);
      }
    }

    const savedSpoilers = localStorage.getItem(futuresRevealedSpoilerKey);
    const parsedSpoilers = parseRevealedSpoilerContentUids(savedSpoilers);
    if (parsedSpoilers.length > 0) {
      setRevealedSpoilerContentUids(parsedSpoilers);
    }

    const savedView = localStorage.getItem(futuresContentViewKey);
    if (savedView === "timeline" || savedView === "table" || savedView === "compact") {
      setView(savedView);
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(futuresContentFilterKey, JSON.stringify(filter));
    }
  }, [filter, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(futuresRevealedSpoilerKey, JSON.stringify(revealedSpoilerContentUids));
    }
  }, [isHydrated, revealedSpoilerContentUids]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(futuresContentViewKey, view);
    }
  }, [isHydrated, view]);

  const loaderData = useLoaderData() as FutureContentsLoaderData;
  const { contents, commentSummaries, signedIn } = loaderData;

  const [favoritedStudents, setFavoritedStudents] = useState<FavoritedStudentState[] | undefined>(
    loaderData.favoritedStudents?.map(
      (favorite: { contentId: string; studentId: string }): FavoritedStudentState => ({
        contentUid: favorite.contentId,
        studentUid: favorite.studentId,
      }),
    ) ?? undefined,
  );
  const [favoritedCounts, setFavoritedCounts] = useState<FavoritedCountState[]>(
    loaderData.favoritedCounts.map(
      (favorite: { contentId: string; count: number; studentId: string }): FavoritedCountState => ({
        contentUid: favorite.contentId,
        studentUid: favorite.studentId,
        count: favorite.count,
      }),
    ),
  );
  const [allComments, setAllComments] = useState<AllCommentsState>({});
  const [loadedCommentContentUids, setLoadedCommentContentUids] = useState<string[]>([]);
  const [commentLoadRequest, setCommentLoadRequest] = useState<{
    uid: string;
    started: boolean;
  } | null>(null);
  const [recruitmentResults, setRecruitmentResults] = useState<RecruitmentResultState[]>(loaderData.recruitmentResults);

  const favoriteFetcher = useFetcher();
  const submitFavorite = (data: ContentsActionData) =>
    favoriteFetcher.submit(data, { action: "/api/contents", method: "post", encType: "application/json" });

  const commentFetcher = useFetcher();
  const submitComment = (contentUid: string, data: CommentActionData) =>
    commentFetcher.submit(data, {
      action: `/api/contents/${contentUid}/comments`,
      method: "post",
      encType: "application/json",
    });
  const commentThreadFetcher = useFetcher<NestedComment[]>();
  const previousCommentThreadDataRef = useRef<unknown>(null);

  const loadCommentThread = (contentUid: string) => {
    if (loadedCommentContentUids.includes(contentUid) || commentLoadRequest?.uid === contentUid) {
      return;
    }

    previousCommentThreadDataRef.current = commentThreadFetcher.data;
    setCommentLoadRequest({ uid: contentUid, started: false });
    commentThreadFetcher.load(`/api/contents/${contentUid}/comments`);
  };

  const [pendingContentUid, setPendingContentUid] = useState<string | null>(null);

  const recruitmentResultFetcher = useFetcher();
  const submitRecruitmentResult = (data: RecruitmentResultActionData) =>
    recruitmentResultFetcher.submit(data, {
      action: "/api/recruitment-results",
      method: "post",
      encType: "application/json",
    });

  useEffect(() => {
    const response = recruitmentResultFetcher.data as
      | { success?: boolean; result?: RecruitmentResultState | null }
      | undefined;
    if (recruitmentResultFetcher.state !== "idle" || !response?.success || !response.result) {
      return;
    }

    const nextResult = response.result;
    setRecruitmentResults((prev) => {
      const existing = prev.find((result) => result.recruitmentGroupUid === nextResult.recruitmentGroupUid);
      if (existing) {
        return prev.map((result) =>
          result.recruitmentGroupUid === nextResult.recruitmentGroupUid ? nextResult : result,
        );
      }
      return [...prev, nextResult];
    });
  }, [recruitmentResultFetcher.state, recruitmentResultFetcher.data]);

  useEffect(() => {
    if (
      (commentFetcher.state === "idle" || commentFetcher.state === "loading") &&
      commentFetcher.data &&
      Array.isArray(commentFetcher.data) &&
      pendingContentUid
    ) {
      setAllComments(
        (prev: AllCommentsState): AllCommentsState => ({
          ...prev,
          [pendingContentUid]: commentFetcher.data as NestedComment[],
        }),
      );
      setLoadedCommentContentUids((prev) => (prev.includes(pendingContentUid) ? prev : [...prev, pendingContentUid]));
      if (commentLoadRequest?.uid === pendingContentUid) {
        previousCommentThreadDataRef.current = commentThreadFetcher.data;
        setCommentLoadRequest(null);
      }
      setPendingContentUid(null);
    }
  }, [
    commentFetcher.state,
    commentFetcher.data,
    commentLoadRequest?.uid,
    commentThreadFetcher.data,
    pendingContentUid,
  ]);

  useEffect(() => {
    if (!commentLoadRequest || commentLoadRequest.started || commentThreadFetcher.state !== "loading") {
      return;
    }

    setCommentLoadRequest({ ...commentLoadRequest, started: true });
  }, [commentLoadRequest, commentThreadFetcher.state]);

  useEffect(() => {
    const hasFreshData = commentThreadFetcher.data !== previousCommentThreadDataRef.current;
    if (
      !commentLoadRequest ||
      commentThreadFetcher.state !== "idle" ||
      !hasFreshData ||
      !Array.isArray(commentThreadFetcher.data)
    ) {
      return;
    }

    const contentUid = commentLoadRequest.uid;
    setAllComments((prev) => ({
      ...prev,
      [contentUid]: commentThreadFetcher.data as NestedComment[],
    }));
    setLoadedCommentContentUids((prev) => (prev.includes(contentUid) ? prev : [...prev, contentUid]));
    setCommentLoadRequest(null);
  }, [commentLoadRequest, commentThreadFetcher.state, commentThreadFetcher.data]);

  const revealSpoiler = (contentUid: string) => {
    setRevealedSpoilerContentUids((prev) => (prev.includes(contentUid) ? prev : [...prev, contentUid]));
  };

  const hideSpoiler = (contentUid: string) => {
    setRevealedSpoilerContentUids((prev) => prev.filter((uid) => uid !== contentUid));
  };

  const setRecruitmentCompleted = (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
    recruitment: RecruitmentCompletionMeta,
  ) => {
    if (!signedIn) {
      showSignIn();
      return;
    }

    if (completed) {
      submitRecruitmentResult({
        action: "completeStudent",
        contentUid,
        recruitmentGroupUid,
        studentUid,
        tier: recruitment.tier,
        pickup: recruitment.pickup,
      });
    } else {
      submitRecruitmentResult({
        action: "uncompleteStudent",
        recruitmentGroupUid,
        studentUid,
      });
    }

    setRecruitmentResults((prev) => {
      const existing = prev.find((result) => result.recruitmentGroupUid === recruitmentGroupUid);
      if (existing) {
        return prev.map((result) => {
          if (result.recruitmentGroupUid !== recruitmentGroupUid) {
            return result;
          }

          return applyRecruitmentResultStudentCompletion(result, {
            contentUid,
            studentUid,
            completed,
            recruitment,
            now: new Date().toISOString(),
          });
        });
      }

      if (!completed) {
        return prev;
      }

      return [
        ...prev,
        {
          uid: `optimistic-${recruitmentGroupUid}`,
          recruitmentGroupUid,
          contentUid,
          completedAt: new Date().toISOString(),
          recruitedStudents: [{ studentUid, tier: recruitment.tier, pickup: recruitment.pickup }],
          exchangedStudents: [],
        },
      ];
    });
  };

  const toggleFavorite = (contentUid: string, studentUid: string, favorited: boolean) => {
    if (!signedIn) {
      showSignIn();
      return;
    }

    submitFavorite({ favorite: { contentUid, studentUid, favorited } });

    setFavoritedStudents((prev: FavoritedStudentState[] | undefined): FavoritedStudentState[] | undefined => {
      const currentFavorites = prev ?? [];
      const alreadyFavorited = currentFavorites.some((favorite: FavoritedStudentState) =>
        equalFavorites(favorite, { contentUid, studentUid }),
      );
      if (favorited && !alreadyFavorited) {
        return [...currentFavorites, { contentUid, studentUid }];
      }
      if (!favorited && alreadyFavorited) {
        return currentFavorites.filter(
          (favorite: FavoritedStudentState) => !equalFavorites(favorite, { contentUid, studentUid }),
        );
      }
      return prev;
    });

    setFavoritedCounts((prev: FavoritedCountState[]): FavoritedCountState[] => {
      let found = false;
      const newCounts = prev.map((favorite: FavoritedCountState): FavoritedCountState => {
        if (equalFavorites(favorite, { contentUid, studentUid })) {
          found = true;
          return { ...favorite, count: favorite.count + (favorited ? 1 : -1) };
        }
        return favorite;
      });
      if (!found && favorited) {
        newCounts.push({ contentUid, studentUid, count: 1 });
      }
      return newCounts.filter((favorite: FavoritedCountState) => favorite.count > 0);
    });
  };

  const filteredContents = useMemo<FutureContentsLoaderContent[]>(
    () =>
      contents.filter((content: FutureContentsLoaderContent): boolean => {
        const effectiveType = content.raidInfo?.raidType ?? content.contentType;
        if (filter.types.length > 0 && !filter.types.includes(effectiveType)) {
          return false;
        }
        if (
          filter.onlyPickups &&
          content.recruitments.filter((recruitment: FutureRecruitment) => recruitment.pickup).length === 0
        ) {
          return false;
        }
        return true;
      }),
    [contents, filter],
  );

  const studentAnalysisFeatureBannerContentUid = useMemo(
    () => getStudentAnalysisFeatureBannerContentUid(filteredContents, nowUtcIso()),
    [filteredContents],
  );

  const timelineContents = useMemo<ContentTimelineProps["contents"]>(
    () =>
      filteredContents.map((content: FutureContentsLoaderContent): ContentTimelineProps["contents"][number] => {
        const common = getCommonContentFields(content);
        return {
          ...common,
          name: common.raidInfo ? common.raidInfo.name : content.name,
          recruitmentGroupUid: content.recruitmentGroupUid,
          recruitments: content.recruitments.length > 0 ? content.recruitments : undefined,
          showStudentAnalysisFeatureBanner: content.uid === studentAnalysisFeatureBannerContentUid,
          showPendingStudentFavoriteFeatureBanner: hasPendingStudentRecruitment(content),
          allComments: allComments[content.uid],
          commentSummary: commentSummaries[content.uid],
          isLoadingComments: commentLoadRequest?.uid === content.uid,
        };
      }),
    [allComments, commentLoadRequest?.uid, commentSummaries, filteredContents, studentAnalysisFeatureBannerContentUid],
  );

  const tableContents = useMemo<FutureRecruitmentTableContent[]>(
    () =>
      filteredContents.map(
        (content: FutureContentsLoaderContent): FutureRecruitmentTableContent => ({
          ...getCommonContentFields(content),
          name: content.name,
          imageUrl: content.imageUrl,
          recruitmentGroupUid: content.recruitmentGroupUid,
          recruitments: content.recruitments,
        }),
      ),
    [filteredContents],
  );

  const completedRecruitmentStudents = useMemo<CompletedRecruitmentStudentState[]>(() => {
    return recruitmentResults
      .filter((result) => result.completedAt !== null)
      .flatMap((result) => {
        const storedStudents = [...result.recruitedStudents, ...result.exchangedStudents];
        return storedStudents.map((student) => ({
          recruitmentGroupUid: result.recruitmentGroupUid,
          studentUid: student.studentUid,
        }));
      });
  }, [recruitmentResults]);

  const recruitmentResultEditLinks = useMemo<RecruitmentResultEditLinkState[]>(
    () =>
      recruitmentResults
        .filter(
          (result) =>
            result.completedAt !== null || result.recruitedStudents.length > 0 || result.exchangedStudents.length > 0,
        )
        .map((result) => ({
          recruitmentGroupUid: result.recruitmentGroupUid,
          link: result.uid.startsWith("optimistic-")
            ? `/my?path=pickups/edit/new?eventId=${encodeURIComponent(result.recruitmentGroupUid)}`
            : `/my?path=pickups/edit/${result.uid}`,
        })),
    [recruitmentResults],
  );

  return (
    <Page
      title="미래시"
      description="일본 서버를 바탕으로 추정된 일정으로 추후 변경될 수 있어요"
      contentArea="3xl"
      layout="horizontal"
      showMobileScreens={false}
      screens={[
        {
          text: "타임라인",
          Icon: QueueListIcon,
          active: view === "timeline",
          onClick: () => setView("timeline"),
        },
        {
          text: "목록",
          Icon: Bars3BottomLeftIcon,
          active: view === "compact",
          onClick: () => setView("compact"),
        },
        {
          text: "일정표",
          Icon: TableCellsIcon,
          active: view === "table",
          onClick: () => setView("table"),
        },
      ]}
      panels={[
        {
          title: "컨텐츠 필터",
          Icon: FunnelIcon,
          children: <ContentFilterPanel filter={filter} onFilterChange={setFilter} />,
        },
      ]}
    >
      {(view === "timeline" || view === "table") && (
        <div className={view === "table" ? "lg:hidden" : ""}>
          <ContentTimeline
            contents={timelineContents}
            favoritedStudents={favoritedStudents ?? []}
            favoritedCounts={favoritedCounts}
            completedRecruitmentStudents={completedRecruitmentStudents}
            recruitmentResultEditLinks={recruitmentResultEditLinks}
            signedIn={signedIn}
            showFeatureBanners={view === "timeline"}
            revealedSpoilerContentUids={revealedSpoilerContentUids}
            onRevealSpoiler={revealSpoiler}
            onHideSpoiler={hideSpoiler}
            onCommentOpen={loadCommentThread}
            onCommentCreate={(contentUid, body, visibility) => {
              setPendingContentUid(contentUid);
              submitComment(contentUid, { action: "create", body, visibility });
            }}
            onCommentCreateSubcomment={(contentUid, parentCommentUid, body, visibility) => {
              setPendingContentUid(contentUid);
              submitComment(contentUid, { action: "createSubcomment", parentCommentUid, body, visibility });
            }}
            onCommentUpdate={(contentUid, commentUid, body, visibility) => {
              setPendingContentUid(contentUid);
              submitComment(contentUid, { action: "update", commentUid, body, visibility });
            }}
            onCommentDelete={(contentUid, commentUid) => {
              setPendingContentUid(contentUid);
              submitComment(contentUid, { action: "delete", commentUid });
            }}
            onCommentPin={(contentUid, commentUid) => {
              setPendingContentUid(contentUid);
              submitComment(contentUid, { action: "pin", commentUid });
            }}
            onCommentUnpin={(contentUid) => {
              setPendingContentUid(contentUid);
              submitComment(contentUid, { action: "unpin" });
            }}
            onFavorite={toggleFavorite}
            onRecruitmentComplete={setRecruitmentCompleted}
            isSubmittingComment={commentFetcher.state === "submitting"}
          />
        </div>
      )}
      {view === "compact" && (
        <ContentTimelineCompact
          contents={timelineContents}
          favoritedStudents={favoritedStudents ?? []}
          favoritedCounts={favoritedCounts}
          completedRecruitmentStudents={completedRecruitmentStudents}
          revealedSpoilerContentUids={revealedSpoilerContentUids}
          onRevealSpoiler={revealSpoiler}
          onFavorite={toggleFavorite}
          onRecruitmentComplete={setRecruitmentCompleted}
        />
      )}
      {view === "table" && (
        <div className="hidden lg:block">
          <FutureRecruitmentTable
            contents={tableContents}
            favoritedStudents={favoritedStudents ?? []}
            favoritedCounts={favoritedCounts}
            completedRecruitmentStudents={completedRecruitmentStudents}
            recruitmentResultEditLinks={recruitmentResultEditLinks}
            revealedSpoilerContentUids={revealedSpoilerContentUids}
            onFavorite={toggleFavorite}
            onRecruitmentComplete={setRecruitmentCompleted}
          />
        </div>
      )}
    </Page>
  );
}
