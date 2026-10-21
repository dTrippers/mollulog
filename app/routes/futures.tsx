import { Bars3BottomLeftIcon, CalendarDaysIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { FunnelIcon } from "@heroicons/react/24/solid";
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ClientLoaderFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteError,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import type { CommentVisibility } from "~/components/v2/features/comments/CommentComposer";
import { OpinionSheet } from "~/components/v2/features/comments/OpinionSheet";
import { FutureFilterPanel } from "~/components/v2/features/futures/FutureFilterPanel";
import { FutureList } from "~/components/v2/features/futures/FutureList";
import { FutureSchedule } from "~/components/v2/features/futures/FutureSchedule";
import {
  FilterEmptyState,
  FutureSkeleton,
  LoadFailureState,
  ViewerFailureNotice,
} from "~/components/v2/features/futures/FutureStates";
import { FutureTimeline } from "~/components/v2/features/futures/FutureTimeline";
import { eventFilterOptions, raidFilterOptions } from "~/components/v2/features/futures/filter-options";
import type { FutureBannerId, FutureOpinionState, FutureViewContent } from "~/components/v2/features/futures/types";
import type { FutureStudentEntry } from "~/components/v2/features/students/types";
import {
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  PageToolbar,
  PanelAction,
  PanelSheet,
  ScreenTabs,
  V2Page,
  type V2PanelRequest,
} from "~/components/v2/layout";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { useSignIn } from "~/contexts/SignInProvider";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { type ContentFilterState, defaultContentFilterState } from "~/domain/futures/content-filter-state";
import { groupFutureContents } from "~/domain/futures/content-timeline-grouping";
import {
  formatThousands,
  getFilterSummary,
  getFutureContentLink,
  getFutureFavoriteKeyForStudentAnalysis,
  getFuturePendingStudentFavoriteKey,
  isContentFilterActive,
  isFutureContentLinkable,
  matchesContentFilter,
} from "~/domain/futures/futures-view-model";
import { getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import {
  applyRecruitmentResultStudentCompletion,
  canCompleteRecruitmentStudent,
  isRecordedRecruitmentResult,
} from "~/domain/recruitment-result";
import { compareInstantAsc, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import {
  trackGoogleAnalyticsEvent,
  trackRecruitmentResultSubmitted,
  useTrackCreatedCommentAnalyticsEvent,
} from "~/lib/google-analytics-events.client";
import { captureClientError } from "~/lib/observability.client";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import { recruitmentLabelLocale } from "~/locales/ko";
import type { ContentCommentSummary, NestedComment } from "~/models/content";
import type { EventType, RaidType } from "~/models/content.d";
import { getContentsCommentSummaries } from "~/models/content.server";
import { COMMENT_ENABLED_WITHOUT_RECRUITMENT_CONTENT_TYPES } from "~/models/content-rules";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import type { RecruitmentCompletionMeta } from "~/models/recruitment-result";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result.server";
import { type FutureContent, getFutureContents } from "~/views/futures";
import type { ActionData as ContentsActionData } from "./api.contents";
import type { ActionData as CommentActionData, CommentResponse } from "./api.contents.$uid.comments";
import type { ActionData as RecruitmentResultActionData } from "./api.recruitment-results";
import {
  applyFavoriteCountChange,
  equalFavorites,
  type FavoriteCountsSync,
  type FavoritedCountEntry,
  syncFavoriteCounts,
} from "./futures._components/favorited-counts";
import { createFutureDetailNavigationState } from "./futures._components/futures-navigation";
import { useFuturesViewState } from "./futures._components/futures-view-state";
import { useRecruitmentOpinionSetting } from "./futures._components/recruitment-opinion-setting";
import {
  getRecruitmentOpinionTutorialDismissalAction,
  isRecruitmentOpinionTutorialDismissedForCurrentVisit,
  isRecruitmentOpinionTutorialEligible,
  notifyRecruitmentOpinionTutorialDismissed,
  recruitmentOpinionTutorialStorageKey,
  subscribeToRecruitmentOpinionTutorialDismissal,
} from "./futures._components/recruitment-opinion-tutorial";
import { useFuturesNavigation } from "./futures._components/use-futures-navigation";
import {
  resolveViewerStatus,
  settleViewerPair,
  settleViewerState,
  useSettledValue,
  type ViewerLoaded,
  type ViewerStatus,
} from "./futures._components/viewer-state";

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

const featureBannerDismissalStorageKey = "futures::dismissed-feature-banners";
const featureBannerIds: FutureBannerId[] = ["student-analysis", "pending-student-favorite"];
const FILTER_PANEL_ID = "content-filter";
const EMPTY_COMMENT_SUMMARY: ContentCommentSummary = { count: 0, hasRecentComment: false, pinnedPreviewBody: null };
const UNAVAILABLE_VIEWER: ViewerPair = { favorites: { status: "unavailable" }, results: { status: "unavailable" } };
const UNAVAILABLE_COMMENT_SUMMARIES: CommentSummariesState = { status: "unavailable" };

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const ctx: ExecutionContext = context.cloudflare.ctx;
  const logger = getLogger(env, ctx, { route: "futures.loader" });

  return ctx.tracing.enterSpan("futures.loader", async (span) => {
    // A contents failure is an explicit state. The page keeps its header and shows a failure message, never an empty list.
    const rawContentsPromise = ctx.tracing
      .enterSpan("future_contents", () => getFutureContents(env, false, ctx))
      .then(
        (rawContents) => ({ status: "available" as const, rawContents }),
        (error: unknown) => {
          const errorContext = { route: "futures.loader", operation: "future_contents" };
          logger.error("Failed to load futures contents", error, errorContext);
          captureServerError(error, errorContext);
          return { status: "unavailable" as const, rawContents: [] as FutureContent[] };
        },
      );
    // The page's own reads (auth, favorite counts) fail as the contents do: an explicit failed page state, with the header
    // kept. The raw error is reported, never sent to the page.
    const reportLoadFailure = (error: unknown, operation: string) => {
      const errorContext = { route: "futures.loader", operation };
      logger.error("Failed to load futures page data", error, errorContext);
      captureServerError(error, errorContext);
    };
    const currentUserPromise = ctx.tracing
      .enterSpan("auth", () => getActiveSensei(env, request, ctx))
      .then(
        (user) => ({ status: "available" as const, user }),
        (error: unknown) => {
          reportLoadFailure(error, "auth");
          return { status: "unavailable" as const, user: null };
        },
      );
    const [{ status: contentsReadStatus, rawContents }, currentUserResult] = await Promise.all([
      rawContentsPromise,
      currentUserPromise,
    ]);
    const currentUser = currentUserResult.user;
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
      recruitmentPeriod: content.recruitmentPeriod,
      confirmed: content.confirmed,
      isSpoiler: content.isSpoiler,
      tags: content.tags,
      minigameType: content.minigameType,
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
    const commentSummariesPromise: Promise<CommentSummariesState> = ctx.tracing
      .enterSpan("comment_summaries", () =>
        getContentsCommentSummaries(
          env,
          contents.map((content: FutureContentsLoaderContent) => content.uid),
          currentUserId,
          undefined,
          {
            hideRecruitmentOpinions: currentUser?.hideRecruitmentOpinions === true,
            recruitmentPeriodStartAtByContentId: Object.fromEntries(
              contents.map((content) => [content.uid, content.recruitmentPeriod?.startAt ?? null]),
            ),
            ctx,
          },
        ),
      )
      .then<CommentSummariesState>((summaries) => ({ status: "available", summaries }))
      .catch((error): CommentSummariesState => {
        const errorContext = {
          route: "futures.loader",
          operation: "comment_summaries",
          signedIn,
          contentCount: contents.length,
        };
        logger.error("Failed to load futures comment summaries", error, errorContext);
        captureServerError(error, errorContext);
        return { status: "unavailable" };
      });

    // Favorites, results and comment summaries are deferred: the page renders from the awaited values above, and each
    // deferred value streams in later. A failed viewer read settles to an explicit unavailable state.
    const reportViewerFailure = (error: unknown, operation: string) => {
      const errorContext = { route: "futures.loader", operation, signedIn };
      logger.error("Failed to load futures viewer state", error, errorContext);
      captureServerError(error, errorContext);
    };
    const favoritedStudentsPromise = settleViewerState<FavoriteStudentLoaderData[] | null>(
      currentUserId
        ? ctx.tracing.enterSpan("favorited_students", () =>
            getUserFavoritedStudents(env, currentUserId, undefined, { ctx }),
          )
        : Promise.resolve(null),
      "favorited_students",
      reportViewerFailure,
    );
    const recruitmentResultsPromise = settleViewerState<RecruitmentResultState[]>(
      currentUserId
        ? ctx.tracing.enterSpan("recruitment_results", () =>
            getRecruitmentResultsByRecruitmentGroupUids(env, currentUserId, recruitmentGroupUids),
          )
        : Promise.resolve([]),
      "recruitment_results",
      reportViewerFailure,
    );
    const favoritedCountsResult = await ctx.tracing
      .enterSpan("favorited_counts", () => getFavoritedCounts(env, allStudentUids, { ctx }))
      .then(
        (counts) => ({ status: "available" as const, counts }),
        (error: unknown) => {
          reportLoadFailure(error, "favorited_counts");
          return { status: "unavailable" as const, counts: [] as FavoritedCountLoaderData[] };
        },
      );
    const contentsStatus: FutureContentsLoaderData["contentsStatus"] =
      contentsReadStatus === "available" &&
      currentUserResult.status === "available" &&
      favoritedCountsResult.status === "available"
        ? "available"
        : "unavailable";

    const payload: FutureContentsLoaderData = {
      contentsStatus,
      signedIn,
      hideRecruitmentOpinions: currentUser?.hideRecruitmentOpinions === true,
      contents,
      favoritedCounts: favoritedCountsResult.counts,
      viewer: settleViewerPair(favoritedStudentsPromise, recruitmentResultsPromise),
      commentSummaries: commentSummariesPromise,
    };

    span.setAttribute("signedIn", signedIn);
    span.setAttribute("contentsAvailable", contentsStatus === "available");

    return payload;
  });
};

// The server result, handed over un-awaited. React Router commits client navigation at once with this shape, so the page
// shows its full skeleton until the result settles. clientLoader.hydrate stays unset, so the initial SSR load keeps the
// data shape. Revalidation also gets this shape and suspends inside React Router's transition, so the current screen
// stays until the new data arrives.
type PendingFutureContents = { pending: Promise<FutureContentsLoaderData> };
type FutureContentsRouteData = FutureContentsLoaderData | PendingFutureContents;

function isPendingFutureContents(data: FutureContentsRouteData): data is PendingFutureContents {
  return "pending" in data;
}

// The failure state for data that could not be read. The header stays, and the page shows LoadFailureState.
function unavailableFutureContents(): FutureContentsLoaderData {
  return {
    contentsStatus: "unavailable",
    signedIn: false,
    hideRecruitmentOpinions: false,
    contents: [],
    favoritedCounts: [],
    viewer: Promise.resolve(UNAVAILABLE_VIEWER),
    commentSummaries: Promise.resolve(UNAVAILABLE_COMMENT_SUMMARIES),
  };
}

// A rejected server result becomes the page's failure state, not a throw to the root boundary.
export const clientLoader = ({ serverLoader }: ClientLoaderFunctionArgs): PendingFutureContents => ({
  pending: (serverLoader() as Promise<FutureContentsLoaderData>).catch((error: unknown) => {
    captureClientError(error, { source: "futures.client_loader" });
    return unavailableFutureContents();
  }),
});

function toFavoritedCountEntries(counts: FavoritedCountLoaderData[]): FavoritedCountEntry[] {
  return counts.map((favorite) => ({
    contentUid: favorite.contentId,
    studentUid: favorite.studentId,
    count: favorite.count,
  }));
}

function normalizeFutureRecruitment(recruitment: FutureRecruitment): FutureRecruitment {
  return {
    ...recruitment,
    favoriteKey: recruitment.favoriteKey ?? getRecruitmentFavoriteKey(recruitment),
  };
}

type FavoritedStudentState = { contentUid: string; studentUid: string };
type FutureContentForView = Pick<
  FutureContent,
  | "uid"
  | "name"
  | "startAt"
  | "endAt"
  | "endless"
  | "contentType"
  | "runType"
  | "confirmed"
  | "isSpoiler"
  | "tags"
  | "minigameType"
  | "recruitments"
  | "recruitmentPeriod"
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
type CommentSummariesState =
  | { status: "available"; summaries: Record<string, ContentCommentSummary> }
  | { status: "unavailable" };
// The viewer's own reads of one load, as one pair. Each read keeps its own failed state.
type ViewerPair = {
  favorites: ViewerLoaded<FavoriteStudentLoaderData[] | null>;
  results: ViewerLoaded<RecruitmentResultState[]>;
};
type FutureContentsLoaderData = {
  contentsStatus: "available" | "unavailable";
  signedIn: boolean;
  hideRecruitmentOpinions: boolean;
  contents: FutureContentsLoaderContent[];
  favoritedCounts: FavoritedCountLoaderData[];
  // Deferred: each value resolves after the page renders. The viewer pair settles together, from one load.
  viewer: Promise<ViewerPair>;
  commentSummaries: Promise<CommentSummariesState>;
};
type AllCommentsState = Record<string, NestedComment[]>;
type FutureRecruitment = FutureContent["recruitments"][number];
type CompletedRecruitmentStudentState = { recruitmentGroupUid: string; studentUid: string };
type RecruitmentResultEditLinkState = { recruitmentGroupUid: string; link: string };
type RecruitmentResultFetcherData = {
  success?: boolean;
  result?: RecruitmentResultState | null;
  analyticsAction?: string;
};

function getEarliestUpcomingPickupAt(content: FutureContentsLoaderContent, now: string): string | null {
  const upcomingPickup = content.recruitments
    .filter(
      (recruitment) => recruitment.pickup && recruitment.student !== null && isInstantAfter(recruitment.since, now),
    )
    .sort((a, b) => compareInstantAsc(a.since, b.since))[0];

  return upcomingPickup?.since ?? null;
}

// Only one content shows the student-analysis banner: the one with the earliest upcoming pickup.
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

function readDismissedFeatureBanners(): FutureBannerId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(featureBannerDismissalStorageKey) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is FutureBannerId => featureBannerIds.includes(item as FutureBannerId))
      : [];
  } catch {
    return [];
  }
}

function describeSelectedFilters(filter: ContentFilterState): string[] {
  const labels: string[] = [];
  for (const option of [...eventFilterOptions, ...raidFilterOptions]) {
    if (option.types.some((type) => filter.types.includes(type))) {
      labels.push(option.label);
    }
  }
  if (filter.onlyPickups) {
    labels.push("학생 모집 컨텐츠만 보기");
  }
  return labels;
}

// Tabs for the three views. The skeleton and the screen share this, so the tab bar never changes shape.
type FutureTabView = "timeline" | "compact" | "table";
function buildFutureTabs(
  view: FutureTabView,
  onViewChange: (next: FutureTabView) => void,
): Parameters<typeof ScreenTabs>[0]["items"] {
  return [
    {
      key: "timeline",
      text: "타임라인",
      Icon: CalendarDaysIcon,
      active: view === "timeline",
      onClick: () => onViewChange("timeline"),
    },
    {
      key: "compact",
      text: "목록",
      Icon: Bars3BottomLeftIcon,
      active: view === "compact",
      onClick: () => onViewChange("compact"),
    },
    {
      key: "table",
      text: "일정표",
      Icon: TableCellsIcon,
      active: view === "table",
      onClick: () => onViewChange("table"),
      hiddenStacked: true,
    },
  ];
}

// Moves focus to the visible title of a panel. The desktop Aside and the stacked sheet both carry the title, and only
// one of them is laid out at a time.
function focusVisiblePanelTitle(panelId: string) {
  const titles = Array.from(document.querySelectorAll<HTMLElement>(`[data-panel-title="${panelId}"]`));
  titles.find((title) => title.getClientRects().length > 0)?.focus({ preventScroll: true });
}

// Key of one viewer-state entry: a content and a student (or favorite key) inside it.
function favoriteKeyOf(contentUid: string, studentKey: string): string {
  return `${contentUid}\u0000${studentKey}`;
}

type FutureViewState = ReturnType<typeof useFuturesViewState>;

// Route error boundary. A failed render keeps the header and shows the page's failure state, rather than the root
// boundary. The retry navigates to the same URL, which resets the boundary and runs the loaders again.
export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const navigate = useNavigate();
  const pathWithSearch = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    captureClientError(error, { source: "futures.error_boundary", location: location.pathname });
  }, [error, location.pathname]);

  return (
    <V2Page width="wide">
      <PageHeader title="미래시" description="일본 서버를 바탕으로 추정된 일정으로 추후 변경될 수 있어요" />
      <LoadFailureState onRetry={() => navigate(pathWithSearch, { replace: true })} />
    </V2Page>
  );
}

export default function FutureContents() {
  const location = useLocation();
  const loaderData = useLoaderData() as FutureContentsRouteData;
  // The view state sits above the boundary, so the skeleton and the screen share the same tabs and filter.
  const viewState = useFuturesViewState(location.key);
  return (
    <Suspense fallback={<FutureSkeletonPage viewState={viewState} />}>
      {/* A new visit remounts the screen, so the deferred viewer state of one visit never carries over to the next. */}
      <FutureContentsResolved key={location.key} loaderData={loaderData} viewState={viewState} />
    </Suspense>
  );
}

// Passes the data through, or suspends on a pending client-navigation result until it settles.
function FutureContentsResolved({
  loaderData,
  viewState,
}: {
  loaderData: FutureContentsRouteData;
  viewState: FutureViewState;
}) {
  const data = isPendingFutureContents(loaderData) ? use(loaderData.pending) : loaderData;
  return <FutureContentsScreen loaderData={data} viewState={viewState} />;
}

// Full skeleton for client navigation. The header and tabs are real. The meta, the main feed, and the aside's count and
// switch show skeletons, because their values arrive with the data.
function FutureSkeletonPage({ viewState }: { viewState: FutureViewState }) {
  return (
    <V2Page width="wide" onStackedChange={viewState.onStackedChange}>
      <PageHeader title="미래시" description="일본 서버를 바탕으로 추정된 일정으로 추후 변경될 수 있어요" />
      <PageToolbar>
        <ScreenTabs items={buildFutureTabs(viewState.view, viewState.setView)} />
      </PageToolbar>
      <PageAside>
        <PanelSheet
          panelId={FILTER_PANEL_ID}
          title="컨텐츠 필터"
          description={<Skeleton className="h-3 w-24" />}
          Icon={FunnelIcon}
        >
          {/* The chips and labels are real. Only the opinion switch value waits for the data. */}
          <FutureFilterPanel
            filter={viewState.filter}
            onFilterChange={viewState.setFilter}
            opinionSetting={null}
            opinionSettingFocusRequest={0}
          />
        </PanelSheet>
      </PageAside>
      <MobileActionBar panels={[{ panelId: FILTER_PANEL_ID, title: "필터", Icon: FunnelIcon }]} />
      <PageMain>
        <FutureSkeleton />
      </PageMain>
    </V2Page>
  );
}

function FutureContentsScreen({
  loaderData,
  viewState,
}: {
  loaderData: FutureContentsLoaderData;
  viewState: FutureViewState;
}) {
  const location = useLocation();
  const { filter, setFilter, view, setView, isMobile, visitState } = viewState;
  const [revealedSpoilerContentUids, setRevealedSpoilerContentUids] = useState<string[]>([]);
  const [isSpoilerHydrated, setIsSpoilerHydrated] = useState(false);
  const [dismissedBanners, setDismissedBanners] = useState<FutureBannerId[]>([]);
  const [isBannerHydrated, setIsBannerHydrated] = useState(false);

  const { showSignIn } = useSignIn();
  const timeZone = useDisplayTimeZone();

  useEffect(() => {
    setIsSpoilerHydrated(true);
    try {
      const savedSpoilers = localStorage.getItem(futuresRevealedSpoilerKey);
      setRevealedSpoilerContentUids(parseRevealedSpoilerContentUids(savedSpoilers));
    } catch {
      setRevealedSpoilerContentUids([]);
    }
  }, []);

  useEffect(() => {
    if (!isSpoilerHydrated) {
      return;
    }

    try {
      localStorage.setItem(futuresRevealedSpoilerKey, JSON.stringify(revealedSpoilerContentUids));
    } catch {
      // A blocked local store must not prevent spoiler controls from working in memory.
    }
  }, [isSpoilerHydrated, revealedSpoilerContentUids]);

  useEffect(() => {
    setDismissedBanners(readDismissedFeatureBanners());
    setIsBannerHydrated(true);
  }, []);

  useEffect(() => {
    if (!isBannerHydrated) {
      return;
    }
    try {
      localStorage.setItem(featureBannerDismissalStorageKey, JSON.stringify(dismissedBanners));
    } catch {
      // Keep the banners usable when local storage is blocked.
    }
  }, [dismissedBanners, isBannerHydrated]);

  const { contents, signedIn, contentsStatus } = loaderData;
  const revalidator = useRevalidator();

  // Feature-panel requests. A request id changes each time, so repeated requests still reach the panel.
  const [filterPanelRequest, setFilterPanelRequest] = useState<V2PanelRequest | null>(null);
  const [filterPanelCloseRequest, setFilterPanelCloseRequest] = useState<number | null>(null);
  const [opinionSettingFocusRequest, setOpinionSettingFocusRequest] = useState(0);
  const requestCounterRef = useRef(0);
  const openContentFilter = useCallback(() => {
    requestCounterRef.current += 1;
    setFilterPanelRequest({ panelId: FILTER_PANEL_ID, requestId: requestCounterRef.current });
  }, []);
  const openContentFilterForOpinionSetting = useCallback(() => {
    setOpinionSettingFocusRequest((request) => request + 1);
    openContentFilter();
  }, [openContentFilter]);
  const requestGuestOpinionSignIn = useCallback(() => {
    requestCounterRef.current += 1;
    setFilterPanelCloseRequest(requestCounterRef.current);
  }, []);

  // Viewer state and comment summaries stream in after the page renders. Own-state labels and actions wait for them.
  const resolvedViewer = useSettledValue(loaderData.viewer, UNAVAILABLE_VIEWER);
  const resolvedCommentSummaries = useSettledValue(loaderData.commentSummaries, UNAVAILABLE_COMMENT_SUMMARIES);
  const [viewerStatus, setViewerStatus] = useState<ViewerStatus>("pending");
  const viewerStateReady = viewerStatus === "ready";
  const [favoritedStudents, setFavoritedStudents] = useState<FavoritedStudentState[] | undefined>(undefined);
  const favoriteFetcher = useFetcher<ContentsActionData>();
  const submitFavorite = (data: ContentsActionData) =>
    favoriteFetcher.submit(data, { action: "/api/contents", method: "post", encType: "application/json" });
  // The counts follow each loader result while no favorite call is in flight. See syncFavoriteCounts.
  const loadedCounts = useMemo(() => toFavoritedCountEntries(loaderData.favoritedCounts), [loaderData.favoritedCounts]);
  const [favoritedCountsSync, setFavoritedCountsSync] = useState<FavoriteCountsSync>(() => ({
    source: loaderData.favoritedCounts,
    counts: loadedCounts,
  }));
  // Runs during render, so the stale counts never reach the screen.
  const nextFavoritedCountsSync = syncFavoriteCounts(
    favoritedCountsSync,
    { source: loaderData.favoritedCounts, counts: loadedCounts },
    favoriteFetcher.state,
  );
  if (nextFavoritedCountsSync !== favoritedCountsSync) {
    setFavoritedCountsSync(nextFavoritedCountsSync);
  }
  const favoritedCounts = nextFavoritedCountsSync.counts;
  const [allComments, setAllComments] = useState<AllCommentsState>({});
  const [commentUnavailable, setCommentUnavailable] = useState<Record<string, boolean>>({});
  const [loadedCommentContentUids, setLoadedCommentContentUids] = useState<string[]>([]);
  const [commentLoadRequest, setCommentLoadRequest] = useState<{
    uid: string;
    started: boolean;
  } | null>(null);
  const [recruitmentResults, setRecruitmentResults] = useState<RecruitmentResultState[]>([]);

  // Both viewer reads arrive as one pair from the same load, so the own-state labels never mix a fresh read with a stale
  // one. One failed read marks the own state failed, and nothing from the other read is applied.
  useEffect(() => {
    const favorites = resolvedViewer?.favorites;
    const results = resolvedViewer?.results;
    setViewerStatus(resolveViewerStatus(favorites, results));
    if (favorites?.status !== "available" || results?.status !== "available") return;
    setFavoritedStudents(
      favorites.value?.map(
        (favorite: { contentId: string; studentId: string }): FavoritedStudentState => ({
          contentUid: favorite.contentId,
          studentUid: favorite.studentId,
        }),
      ) ?? undefined,
    );
    setRecruitmentResults(results.value);
  }, [resolvedViewer]);

  const commentFetcher = useFetcher<CommentResponse>();
  useTrackCreatedCommentAnalyticsEvent(commentFetcher.state, commentFetcher.data, "future");
  const submitComment = (contentUid: string, data: CommentActionData) =>
    commentFetcher.submit(data, {
      action: `/api/contents/${contentUid}/comments`,
      method: "post",
      encType: "application/json",
    });
  const commentThreadFetcher = useFetcher<CommentResponse>();
  const previousCommentThreadDataRef = useRef<unknown>(null);
  const [openCommentContentUid, setOpenCommentContentUid] = useState<string | null>(null);
  // The opinion content stays in the sheet while it animates out, so its text does not blank during the exit.
  const [retainedOpinionContentUid, setRetainedOpinionContentUid] = useState<string | null>(null);
  const sheetCommentContentUid = openCommentContentUid ?? retainedOpinionContentUid;

  const loadCommentThread = (contentUid: string, force = false) => {
    setOpenCommentContentUid(contentUid);
    setRetainedOpinionContentUid(contentUid);
    if (!force && (loadedCommentContentUids.includes(contentUid) || commentLoadRequest?.uid === contentUid)) {
      return;
    }

    previousCommentThreadDataRef.current = commentThreadFetcher.data;
    setCommentLoadRequest({ uid: contentUid, started: false });
    commentThreadFetcher.load(`/api/contents/${contentUid}/comments`);
  };

  const refreshCommentsAfterFilterSave = useCallback(
    (_nextValue: boolean) => {
      setAllComments({});
      setCommentUnavailable({});
      setLoadedCommentContentUids([]);
      setCommentLoadRequest(null);
      revalidator.revalidate();

      if (!openCommentContentUid) return;
      previousCommentThreadDataRef.current = commentThreadFetcher.data;
      setCommentLoadRequest({ uid: openCommentContentUid, started: false });
      commentThreadFetcher.load(`/api/contents/${openCommentContentUid}/comments`);
    },
    [commentThreadFetcher, openCommentContentUid, revalidator],
  );

  // The opinion setting saves here, above the filter panel. The panel moves between the aside and the stacked sheet, so a
  // save held in the panel would be lost when it remounts. A saved value clears the opinion comments and reloads them.
  const opinionSetting = useRecruitmentOpinionSetting({
    initialValue: loaderData.hideRecruitmentOpinions,
    signedIn,
    onSaved: refreshCommentsAfterFilterSave,
    onSignedOut: requestGuestOpinionSignIn,
  });
  const hideRecruitmentOpinions = opinionSetting.value;

  const [pendingContentUid, setPendingContentUid] = useState<string | null>(null);

  const recruitmentResultFetcher = useFetcher<RecruitmentResultFetcherData>();
  const trackedRecruitmentResultRef = useRef<unknown>(null);
  const submitRecruitmentResult = (data: RecruitmentResultActionData) =>
    recruitmentResultFetcher.submit(data, {
      action: "/api/recruitment-results",
      method: "post",
      encType: "application/json",
    });

  useEffect(() => {
    const response = recruitmentResultFetcher.data;
    if (recruitmentResultFetcher.state !== "idle" || !response) return;

    if (!response.success) return;

    if (response !== trackedRecruitmentResultRef.current) {
      trackedRecruitmentResultRef.current = response;
      trackRecruitmentResultSubmitted(response.analyticsAction);
    }

    if (!response.result) return;

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
    const response = commentFetcher.data;
    if (
      (commentFetcher.state === "idle" || commentFetcher.state === "loading") &&
      response &&
      Array.isArray(response.comments) &&
      pendingContentUid
    ) {
      setAllComments(
        (prev: AllCommentsState): AllCommentsState => ({
          ...prev,
          [pendingContentUid]: response.comments,
        }),
      );
      setCommentUnavailable((prev) => ({ ...prev, [pendingContentUid]: response.unavailable }));
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
      !commentThreadFetcher.data ||
      !Array.isArray(commentThreadFetcher.data.comments)
    ) {
      return;
    }

    const contentUid = commentLoadRequest.uid;
    const response = commentThreadFetcher.data;
    if (!response) return;
    setAllComments((prev) => ({
      ...prev,
      [contentUid]: response.comments,
    }));
    setCommentUnavailable((prev) => ({
      ...prev,
      [contentUid]: response.unavailable,
    }));
    setLoadedCommentContentUids((prev) => (prev.includes(contentUid) ? prev : [...prev, contentUid]));
    setCommentLoadRequest(null);
  }, [commentLoadRequest, commentThreadFetcher.state, commentThreadFetcher.data]);

  // Opinion tutorial: shown once per visit and remembered in storage, as in the 1.x timeline.
  const [tutorialDismissalLoaded, setTutorialDismissalLoaded] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  useEffect(() => {
    const unsubscribe = subscribeToRecruitmentOpinionTutorialDismissal(() => setTutorialDismissed(true));
    try {
      setTutorialDismissed(
        isRecruitmentOpinionTutorialDismissedForCurrentVisit() ||
          localStorage.getItem(recruitmentOpinionTutorialStorageKey) === "dismissed",
      );
    } catch {
      setTutorialDismissed(isRecruitmentOpinionTutorialDismissedForCurrentVisit());
    } finally {
      setTutorialDismissalLoaded(true);
    }
    return unsubscribe;
  }, []);

  // The tutorial's settings action hands off to the filter panel after the comment sheet has exited.
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsHandoffRef = useRef(false);

  const dismissRecruitmentOpinionTutorial = (openFilter: boolean) => {
    const action = getRecruitmentOpinionTutorialDismissalAction(openFilter);
    setTutorialDismissed(true);
    try {
      localStorage.setItem(recruitmentOpinionTutorialStorageKey, "dismissed");
    } catch {
      // The state above keeps the current visit dismissed when storage is unavailable.
    }
    notifyRecruitmentOpinionTutorialDismissed();
    if (action.openFilter) {
      settingsHandoffRef.current = true;
    }
    if (action.closeCommentSheet) {
      setOpenCommentContentUid(null);
    }
    if (action.focusCommentEditor) {
      composerRef.current?.focus();
    }
  };

  const handleOpinionSheetExited = () => {
    setRetainedOpinionContentUid(null);
    if (!settingsHandoffRef.current) return;
    settingsHandoffRef.current = false;
    openContentFilterForOpinionSetting();
  };

  const revealSpoiler = (contentUid: string) => {
    if (revealedSpoilerContentUids.includes(contentUid)) return;
    setRevealedSpoilerContentUids((prev) => (prev.includes(contentUid) ? prev : [...prev, contentUid]));
    trackGoogleAnalyticsEvent("futures_spoiler_toggled", { state: "revealed" });
  };

  const hideSpoiler = (contentUid: string) => {
    if (!revealedSpoilerContentUids.includes(contentUid)) return;
    setRevealedSpoilerContentUids((prev) => prev.filter((uid) => uid !== contentUid));
    trackGoogleAnalyticsEvent("futures_spoiler_toggled", { state: "hidden" });
  };

  const dismissBanner = (bannerId: FutureBannerId) => {
    setDismissedBanners((prev) => (prev.includes(bannerId) ? prev : [...prev, bannerId]));
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

    if (!viewerStateReady) return;

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

    if (!viewerStateReady) return;
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

    setFavoritedCountsSync((prev: FavoriteCountsSync) => ({
      ...prev,
      counts: applyFavoriteCountChange(prev.counts, { contentUid, studentUid, favorited }),
    }));
  };

  const now = nowUtcIso();
  const filteredContents = useMemo<FutureContentsLoaderContent[]>(
    () => contents.filter((content) => matchesContentFilter(content, filter)),
    [contents, filter],
  );
  const studentAnalysisBannerContentUid = getStudentAnalysisFeatureBannerContentUid(filteredContents, now);

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
      recruitmentResults.filter(isRecordedRecruitmentResult).map((result) => ({
        recruitmentGroupUid: result.recruitmentGroupUid,
        link: result.uid.startsWith("optimistic-")
          ? `/my?path=pickups/edit/new?eventId=${encodeURIComponent(result.recruitmentGroupUid)}`
          : `/my?path=pickups/edit/${result.uid}`,
      })),
    [recruitmentResults],
  );

  const favoritedSet = useMemo(
    () => new Set((favoritedStudents ?? []).map((favorite) => favoriteKeyOf(favorite.contentUid, favorite.studentUid))),
    [favoritedStudents],
  );
  const favoriteCountByKey = useMemo(
    () =>
      new Map(
        favoritedCounts.map((favorite) => [favoriteKeyOf(favorite.contentUid, favorite.studentUid), favorite.count]),
      ),
    [favoritedCounts],
  );
  const completedSet = useMemo(
    () => new Set(completedRecruitmentStudents.map((item) => `${item.recruitmentGroupUid}\u0000${item.studentUid}`)),
    [completedRecruitmentStudents],
  );
  const resultLinkByGroup = useMemo(
    () => new Map(recruitmentResultEditLinks.map((item) => [item.recruitmentGroupUid, item.link])),
    [recruitmentResultEditLinks],
  );

  const contentSignature = filteredContents.map((content) => content.uid).join("\u0000");
  const { preserveCurrentPosition, saveBeforeContentNavigation } = useFuturesNavigation({
    entryKey: location.key,
    surface: isMobile ? "mobile" : "desktop",
    view,
    filter,
    visitState,
    contentSignature,
  });
  const handleViewChange = useCallback(
    (nextView: "timeline" | "table" | "compact") => {
      preserveCurrentPosition();
      setView(nextView);
    },
    [preserveCurrentPosition, setView],
  );
  const handleFilterChange = useCallback(
    (nextFilter: ContentFilterState) => {
      preserveCurrentPosition();
      setFilter(nextFilter);
    },
    [preserveCurrentPosition, setFilter],
  );
  const resetFilter = () => {
    handleFilterChange(defaultContentFilterState);
    // The reset control leaves the page once the filter is clear, so focus moves to the visible filter panel title.
    focusVisiblePanelTitle(FILTER_PANEL_ID);
  };
  const getContentNavigationState = useCallback(
    (contentUid: string) => {
      const sourceContent = contents.find((content) => content.uid === contentUid);
      const detailContentUid =
        sourceContent?.contentType === "raid" ? (sourceContent.contentUid ?? contentUid) : contentUid;
      return createFutureDetailNavigationState(location.key, detailContentUid);
    },
    [contents, location.key],
  );

  // Converts the loader content into the 2.0 view model. Viewer state comes from the local maps, so an optimistic update
  // shows at once.
  const viewContents: FutureViewContent[] = filteredContents.map((content): FutureViewContent => {
    const effectiveType = (content.raidInfo?.raidType ?? content.contentType) as EventType | RaidType;
    const students: FutureStudentEntry[] = content.recruitments.map((recruitment) => {
      const studentUid = recruitment.student?.uid ?? null;
      const favorited = favoritedSet.has(favoriteKeyOf(content.uid, recruitment.favoriteKey));
      const favoritedCount = favoriteCountByKey.get(favoriteKeyOf(content.uid, recruitment.favoriteKey)) ?? 0;
      const completed = Boolean(
        content.recruitmentGroupUid &&
          studentUid &&
          completedSet.has(`${content.recruitmentGroupUid}\u0000${studentUid}`),
      );
      // The loader carries no initial tier, so completion records the default tier, as the 1.x timeline did.
      const completionMeta: RecruitmentCompletionMeta = {
        tier: 3,
        pickup: recruitment.pickup && recruitment.recruitmentType !== "given",
        recruitmentType: recruitment.recruitmentType,
      };
      const canComplete = Boolean(
        completed ||
          (studentUid &&
            canCompleteRecruitmentStudent({
              recruitmentSince: recruitment.since,
              favorited,
              now,
            })),
      );
      return {
        favoriteKey: recruitment.favoriteKey,
        studentUid,
        studentName: recruitment.studentName,
        attackType: recruitment.student?.attackType,
        defenseType: recruitment.student?.defenseType,
        role: recruitment.student?.role,
        recruitmentLabel: recruitmentLabelLocale(recruitment),
        recruitmentType: recruitment.recruitmentType,
        pickup: recruitment.pickup,
        rerun: recruitment.rerun,
        since: recruitment.since,
        until: recruitment.until,
        favoritedCount,
        favorited,
        completed,
        canComplete,
        viewerPending: viewerStatus === "pending",
        viewerUnavailable: viewerStatus === "failed",
        completionMeta,
        resultEditLink: content.recruitmentGroupUid
          ? (resultLinkByGroup.get(content.recruitmentGroupUid) ?? null)
          : null,
        onToggleFavorite: (next) => toggleFavorite(content.uid, recruitment.favoriteKey, next),
        onToggleComplete: (next) => {
          if (content.recruitmentGroupUid && studentUid) {
            setRecruitmentCompleted(content.uid, content.recruitmentGroupUid, studentUid, next, completionMeta);
          }
        },
      };
    });

    // A hidden spoiler is not linkable: the row gates that itself, so the link check only reads the type.
    const linkable = isFutureContentLinkable({
      contentType: effectiveType,
      raidInfo: content.raidInfo,
    });
    const opinion: FutureOpinionState | null =
      content.recruitments.length > 0 || COMMENT_ENABLED_WITHOUT_RECRUITMENT_CONTENT_TYPES.includes(effectiveType)
        ? {
            summary:
              resolvedCommentSummaries === undefined
                ? undefined
                : resolvedCommentSummaries.status === "available"
                  ? (resolvedCommentSummaries.summaries[content.uid] ?? EMPTY_COMMENT_SUMMARY)
                  : null,
          }
        : null;
    const completedAny = students.some((student) => student.completed);
    const resultEditLink =
      completedAny && content.recruitmentGroupUid ? (resultLinkByGroup.get(content.recruitmentGroupUid) ?? null) : null;

    return {
      uid: content.uid,
      name: content.raidInfo ? content.raidInfo.name : content.name,
      contentType: effectiveType,
      runType: content.runType,
      since: content.startAt,
      until: content.endAt,
      endless: content.endless,
      confirmed: content.confirmed,
      isSpoiler: content.isSpoiler,
      tags: content.tags,
      minigameType: content.minigameType ?? null,
      logoContentUid: content.contentType !== "raid" ? (content.contentUid ?? null) : null,
      raid: content.raidInfo ?? null,
      link: getFutureContentLink({ contentType: content.contentType, raidInfo: content.raidInfo, uid: content.uid }),
      linkable,
      navigationState: getContentNavigationState(content.uid),
      recruitmentGroupUid: content.recruitmentGroupUid,
      recruitmentPeriod: content.recruitmentPeriod,
      students,
      opinion,
      resultEditLink,
      studentAnalysisFavoriteKey:
        content.uid === studentAnalysisBannerContentUid
          ? getFutureFavoriteKeyForStudentAnalysis(
              students.map((student) => ({
                pickup: student.pickup,
                since: student.since,
                favoriteKey: student.favoriteKey,
                student: student.studentUid,
              })),
              now,
            )
          : null,
      pendingFavoriteKey: getFuturePendingStudentFavoriteKey(
        students.map((student) => ({ student: student.studentUid, favoriteKey: student.favoriteKey })),
      ),
    };
  });

  const groups = groupFutureContents(viewContents, timeZone, now);
  const filterActive = isContentFilterActive(filter);
  const summary = getFilterSummary({
    total: contentsStatus === "available" ? contents.length : null,
    shown: filteredContents.length,
    active: filterActive,
  });
  const summaryText =
    summary === null
      ? undefined
      : summary.kind === "all"
        ? `전체 ${formatThousands(summary.total)}건`
        : `${formatThousands(summary.total)}건 중 ${formatThousands(summary.shown)}건 표시`;

  const openCommentContent = sheetCommentContentUid
    ? viewContents.find((content) => content.uid === sheetCommentContentUid)
    : undefined;
  const openCommentRecruitmentActive = Boolean(
    openCommentContent?.recruitmentPeriod &&
      !isInstantAfter(openCommentContent.recruitmentPeriod.startAt, now) &&
      (openCommentContent.recruitmentPeriod.endAt === null ||
        isInstantAfter(openCommentContent.recruitmentPeriod.endAt, now)),
  );
  const showOpinionTutorial =
    openCommentContent !== undefined &&
    isRecruitmentOpinionTutorialEligible({
      hideRecruitmentOpinions,
      contentType: openCommentContent.contentType,
      tutorialDismissalLoaded,
      tutorialDismissed,
      recruitmentActive: openCommentRecruitmentActive,
    });
  const openCommentThread = sheetCommentContentUid ? allComments[sheetCommentContentUid] : undefined;
  const openCommentUnavailable =
    resolvedCommentSummaries?.status === "unavailable" ||
    (sheetCommentContentUid ? commentUnavailable[sheetCommentContentUid] === true : false);

  const tabs = buildFutureTabs(view, handleViewChange);

  const emptyFiltered = contentsStatus === "available" && filteredContents.length === 0;
  const revealedSpoilerSet = new Set(revealedSpoilerContentUids);

  return (
    <V2Page
      width="wide"
      panelRequest={filterPanelRequest}
      panelCloseRequest={filterPanelCloseRequest}
      onPanelCloseRequestHandled={showSignIn}
      onStackedChange={viewState.onStackedChange}
    >
      <PageHeader title="미래시" description="일본 서버를 바탕으로 추정된 일정으로 추후 변경될 수 있어요" />
      <PageToolbar>
        <ScreenTabs items={tabs} />
      </PageToolbar>
      <PageAside>
        <PanelSheet
          panelId={FILTER_PANEL_ID}
          title="컨텐츠 필터"
          description={summaryText}
          Icon={FunnelIcon}
          headerAction={
            filterActive ? (
              <PanelAction variant="danger" onClick={resetFilter}>
                초기화
              </PanelAction>
            ) : undefined
          }
        >
          <FutureFilterPanel
            filter={filter}
            onFilterChange={handleFilterChange}
            opinionSetting={opinionSetting}
            opinionSettingFocusRequest={opinionSettingFocusRequest}
          />
        </PanelSheet>
      </PageAside>
      <MobileActionBar panels={[{ panelId: FILTER_PANEL_ID, title: "필터", Icon: FunnelIcon }]} />
      <PageMain>
        {viewerStatus === "failed" ? <ViewerFailureNotice onRetry={() => revalidator.revalidate()} /> : null}
        {contentsStatus === "unavailable" ? (
          <LoadFailureState onRetry={() => revalidator.revalidate()} />
        ) : emptyFiltered ? (
          <FilterEmptyState
            selectedLabels={describeSelectedFilters(filter)}
            filterActive={filterActive}
            onReset={resetFilter}
          />
        ) : view === "timeline" ? (
          <FutureTimeline
            groups={groups}
            now={now}
            timeZone={timeZone}
            signedIn={signedIn}
            revealedSpoilers={revealedSpoilerSet}
            dismissedBanners={isBannerHydrated ? new Set(dismissedBanners) : null}
            onRevealSpoiler={revealSpoiler}
            onHideSpoiler={hideSpoiler}
            onDismissBanner={dismissBanner}
            onOpenOpinion={loadCommentThread}
            onOpenContent={saveBeforeContentNavigation}
          />
        ) : view === "compact" ? (
          <FutureList
            groups={groups}
            now={now}
            timeZone={timeZone}
            revealedSpoilers={revealedSpoilerSet}
            onRevealSpoiler={revealSpoiler}
            onOpenContent={saveBeforeContentNavigation}
          />
        ) : (
          <FutureSchedule
            contents={viewContents}
            now={now}
            timeZone={timeZone}
            signedIn={signedIn}
            revealedSpoilers={revealedSpoilerSet}
            onRevealSpoiler={revealSpoiler}
            onOpenContent={saveBeforeContentNavigation}
          />
        )}
      </PageMain>
      <OpinionSheet
        open={openCommentContentUid !== null}
        contentUid={sheetCommentContentUid}
        isLive={openCommentContent?.contentType === "live"}
        contentName={openCommentContent?.name.replaceAll("\n", " ") ?? ""}
        commentCount={openCommentContent?.opinion?.summary?.count ?? 0}
        comments={openCommentThread}
        loading={commentLoadRequest?.uid === sheetCommentContentUid}
        unavailable={openCommentUnavailable}
        now={now}
        signedIn={signedIn}
        hideRecruitmentOpinions={hideRecruitmentOpinions}
        submitting={commentFetcher.state === "submitting"}
        tutorial={
          showOpinionTutorial
            ? {
                onOpenSettings: () => dismissRecruitmentOpinionTutorial(true),
                onDismiss: () => dismissRecruitmentOpinionTutorial(false),
              }
            : null
        }
        actions={{
          canReply: signedIn,
          onCreate: (body: string, visibility: CommentVisibility) => {
            if (!openCommentContentUid) return;
            setPendingContentUid(openCommentContentUid);
            submitComment(openCommentContentUid, { action: "create", body, visibility });
          },
          onReply: (parentCommentUid, body, visibility) => {
            if (!openCommentContentUid) return;
            setPendingContentUid(openCommentContentUid);
            submitComment(openCommentContentUid, { action: "createSubcomment", parentCommentUid, body, visibility });
          },
          onUpdate: (commentUid, body, visibility) => {
            if (!openCommentContentUid) return;
            setPendingContentUid(openCommentContentUid);
            submitComment(openCommentContentUid, { action: "update", commentUid, body, visibility });
          },
          onDelete: (commentUid) => {
            if (!openCommentContentUid) return;
            setPendingContentUid(openCommentContentUid);
            submitComment(openCommentContentUid, { action: "delete", commentUid });
          },
          onPin: (commentUid) => {
            if (!openCommentContentUid) return;
            setPendingContentUid(openCommentContentUid);
            submitComment(openCommentContentUid, { action: "pin", commentUid });
          },
          onUnpin: () => {
            if (!openCommentContentUid) return;
            setPendingContentUid(openCommentContentUid);
            submitComment(openCommentContentUid, { action: "unpin" });
          },
        }}
        onRetry={() => {
          if (openCommentContentUid) loadCommentThread(openCommentContentUid, true);
        }}
        onRequestSignIn={showSignIn}
        onClose={() => setOpenCommentContentUid(null)}
        onExited={handleOpinionSheetExited}
        composerRef={composerRef}
      />
    </V2Page>
  );
}
