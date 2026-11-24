import { CalendarIcon, CreditCardIcon, FlagIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { getFutureMediaTypeLabel } from "~/components/v2/features/futures/labels";
import { RecruitCriteria, RecruitGoalChoice } from "~/components/v2/features/recruit-recommendation/RecruitPanels";
import {
  RecruitAllRecruited,
  RecruitGoalCards,
  RecruitLoadFailure,
  RecruitNoPickups,
  RecruitTimelineSkeleton,
  RecruitViewerNotice,
} from "~/components/v2/features/recruit-recommendation/RecruitStates";
import { RecruitTimeline } from "~/components/v2/features/recruit-recommendation/RecruitTimeline";
import type {
  RecruitContentView,
  RecruitPickupFavorite,
  RecruitPickupView,
} from "~/components/v2/features/recruit-recommendation/types";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import {
  AsideLinks,
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  PanelSheet,
  PLAN_SHEET_PANEL_ID,
  PlanSheet,
  V2Page,
} from "~/components/v2/layout";
import { useSignIn } from "~/contexts/SignInProvider";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import {
  getCautionText,
  getFutureContentLink,
  getFutureSpecialCases,
  isFutureContentLinkable,
  isNewRecruitment,
  selectFutureMediaSource,
} from "~/domain/futures/futures-view-model";
import {
  isRecruitGoal,
  RECRUIT_GOAL_STORAGE_KEY,
  type RecruitGoal,
  recruitCriteriaSummary,
  recruitGoalLabels,
} from "~/domain/recruit-recommendation";
import { buildRecruitTimeline } from "~/domain/recruit-recommendation-timeline";
import { isInstantAfter, nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import { createLatestSaveQueue } from "~/lib/latest-save-queue";
import { captureClientError } from "~/lib/observability.client";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { canonicalLink, socialMeta } from "~/lib/seo";
import { recruitmentLabelLocale } from "~/locales/ko";
import type { EventType, RaidType } from "~/models/content.d";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { getRecruitGoal } from "~/models/recruit-recommendation-profile";
import { type FutureContent, getFutureContents } from "~/views/futures";
import type { ActionData as ContentsActionData } from "./api.contents";
import type { RecruitGoalActionData, RecruitRecommendationsLoaderData } from "./api.recruit-recommendations";
import {
  applyFavoriteCountChange,
  equalFavorites,
  type FavoriteCountsSync,
  type FavoritedCountEntry,
  syncFavoriteCounts,
} from "./futures._components/favorited-counts";
import { settleViewerState, useSettledValue, type ViewerLoaded } from "./futures._components/viewer-state";

// The screen is in beta, which its header title says; the browser title keeps the plain name.
const PAGE_TITLE = "모집 추천 (β)";
const PAGE_DESCRIPTION = "다가오는 픽업 학생의 모집 우선순위를 확인해보세요";

export const meta: MetaFunction = ({ location }) => {
  const title = "모집 추천";
  const description = "목표에 맞춰 다가오는 픽업 학생의 모집 우선순위와 근거를 확인해보세요";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
    canonicalLink(location.pathname),
  ];
};

// A failed render keeps the header and shows the page's failure state. The retry navigates to the same URL, which resets
// the boundary and runs the loader again.
export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const navigate = useNavigate();
  const pathWithSearch = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    captureClientError(error, { source: "ai.recruit.error_boundary", location: location.pathname });
  }, [error, location.pathname]);

  return (
    <V2Page width="wide">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
      <RecruitLoadFailure onRetry={() => navigate(pathWithSearch, { replace: true })} />
    </V2Page>
  );
}

const GOAL_PANEL_ID = "goal";

type RecruitPickupLoaderData = {
  favoriteKey: string;
  studentUid: string | null;
  studentName: string;
  recruitmentLabel: string;
  isNew: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
};

type RecruitContentLoaderData = {
  uid: string;
  name: string;
  contentType: EventType | RaidType;
  runType: "first" | "rerun" | "permanent";
  since: UtcIsoString;
  until: UtcIsoString | null;
  endless: boolean;
  isSpoiler: boolean;
  tags: string[];
  recruitmentGroupUid: string | null;
  recruitmentPeriod: FutureContent["recruitmentPeriod"];
  logoContentUid: string | null;
  boss: string | null;
  link: string;
  linkable: boolean;
  pickups: RecruitPickupLoaderData[];
};

type FavoriteKey = { contentUid: string; studentUid: string };

type RecruitPageLoaderData =
  | { status: "unavailable" }
  | {
      status: "available";
      signedIn: boolean;
      // The signed-in Sensei's saved goal. A guest's goal lives in the browser.
      savedGoal: RecruitGoal | null;
      contents: RecruitContentLoaderData[];
      // Null when the public counts could not be read: the hearts then show no count.
      favoritedCounts: FavoritedCountEntry[] | null;
      // Deferred: the viewer's own favorites. Null for a guest.
      favorites: Promise<ViewerLoaded<FavoriteKey[] | null>>;
    };

// The contents with a pickup student that can still be recruited. The pickups keep the content's order.
function toRecruitContents(contents: FutureContent[], now: UtcIsoString): RecruitContentLoaderData[] {
  return contents.flatMap((content): RecruitContentLoaderData[] => {
    if (content.endAt !== null && !isInstantAfter(content.endAt, now)) return [];
    const pickups = content.recruitments
      .filter(
        (recruitment) => recruitment.pickup && (recruitment.until === null || isInstantAfter(recruitment.until, now)),
      )
      .map(
        (recruitment): RecruitPickupLoaderData => ({
          favoriteKey: recruitment.favoriteKey,
          studentUid: recruitment.student?.uid ?? null,
          studentName: recruitment.studentName,
          recruitmentLabel: recruitmentLabelLocale(recruitment),
          isNew: isNewRecruitment(recruitment),
          since: recruitment.since,
          until: recruitment.until,
        }),
      );
    if (pickups.length === 0) return [];
    const contentType = (content.raidInfo?.raidType ?? content.contentType) as EventType | RaidType;
    return [
      {
        uid: content.uid,
        name: content.raidInfo ? content.raidInfo.name : content.name,
        contentType,
        runType: content.runType,
        since: content.startAt,
        until: content.endAt,
        endless: content.endless,
        isSpoiler: content.isSpoiler,
        tags: content.tags,
        recruitmentGroupUid: content.recruitmentGroupUid,
        recruitmentPeriod: content.recruitmentPeriod,
        logoContentUid: content.contentType !== "raid" ? (content.contentUid ?? null) : null,
        boss: content.raidInfo?.boss ?? null,
        link: getFutureContentLink({ contentType: content.contentType, raidInfo: content.raidInfo, uid: content.uid }),
        linkable: isFutureContentLinkable({ contentType, raidInfo: content.raidInfo }),
        pickups,
      },
    ];
  });
}

export const loader = async ({ request, context }: LoaderFunctionArgs): Promise<RecruitPageLoaderData> => {
  const { env } = context.cloudflare;
  const ctx: ExecutionContext = context.cloudflare.ctx;
  const logger = getLogger(env, ctx, { route: "ai.recruit.loader" });
  const report = (error: unknown, operation: string) => {
    const errorContext = { route: "ai.recruit.loader", operation };
    logger.error("Failed to load recruit recommendation page data", error, errorContext);
    captureServerError(error, errorContext);
  };

  let sensei: Awaited<ReturnType<typeof getActiveSensei>>;
  let rawContents: FutureContent[];
  let savedGoal: RecruitGoal | null;
  try {
    [sensei, rawContents] = await Promise.all([getActiveSensei(env, request, ctx), getFutureContents(env, false, ctx)]);
    savedGoal = sensei ? await getRecruitGoal(env, sensei.id, { ctx }) : null;
  } catch (error) {
    report(error, "page");
    return { status: "unavailable" };
  }

  const contents = toRecruitContents(rawContents, nowUtcIso());
  const favoriteKeys = [...new Set(contents.flatMap((content) => content.pickups.map((pickup) => pickup.favoriteKey)))];
  const favoritedCounts = await getFavoritedCounts(env, favoriteKeys, { ctx }).then(
    (counts): FavoritedCountEntry[] =>
      counts.map((favorite) => ({
        contentUid: favorite.contentId,
        studentUid: favorite.studentId,
        count: favorite.count,
      })),
    (error: unknown) => {
      report(error, "favorited_counts");
      return null;
    },
  );
  const favorites = settleViewerState<FavoriteKey[] | null>(
    sensei
      ? getUserFavoritedStudents(env, sensei.id, undefined, { ctx }).then((rows) =>
          rows.map((row) => ({ contentUid: row.contentId, studentUid: row.studentId })),
        )
      : Promise.resolve(null),
    "favorited_students",
    report,
  );

  return { status: "available", signedIn: sensei !== null, savedGoal, contents, favoritedCounts, favorites };
};

function readStoredGoal(): RecruitGoal | null {
  try {
    const value = localStorage.getItem(RECRUIT_GOAL_STORAGE_KEY);
    return isRecruitGoal(value) ? value : null;
  } catch {
    return null;
  }
}

function storeGoal(goal: RecruitGoal) {
  try {
    localStorage.setItem(RECRUIT_GOAL_STORAGE_KEY, goal);
  } catch {
    // The goal still applies to this visit.
  }
}

// A signed-in Sensei's goal saves, one at a time with the last goal picked sent last. The queue sits outside the page,
// so a goal still waiting when the Sensei leaves is saved too. The page sets the sender each time it mounts.
const GOAL_SAVE_FETCHER_KEY = "recruit-goal-save";
let submitGoalSave: ((goal: RecruitGoal) => Promise<void>) | null = null;
const goalSaves = createLatestSaveQueue<RecruitGoal>(async (goal) => {
  await submitGoalSave?.(goal);
});

const UNAVAILABLE_FAVORITES: ViewerLoaded<FavoriteKey[] | null> = { status: "unavailable" };
const NO_FAVORITES: Promise<ViewerLoaded<FavoriteKey[] | null>> = Promise.resolve({ status: "available", value: null });

export default function RecruitRecommendationPage() {
  const loaderData = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const timeZone = useDisplayTimeZone();
  const { showSignIn } = useSignIn();
  const available = loaderData.status === "available";
  const signedIn = available && loaderData.signedIn;

  // A signed-in Sensei's goal comes from the loader. A guest's is read after hydration, so the first paint shows the
  // loading state, not the goal cards.
  const [goal, setGoal] = useState<RecruitGoal | null>(available ? loaderData.savedGoal : null);
  const [goalReady, setGoalReady] = useState(signedIn || !available);
  useEffect(() => {
    if (!available || loaderData.signedIn) return;
    setGoal(readStoredGoal());
    setGoalReady(true);
  }, [available, loaderData]);
  // A page that first failed to load gets the saved goal when a retry succeeds. A goal the Sensei already picked stays.
  const [goalLoaderData, setGoalLoaderData] = useState(loaderData);
  if (goalLoaderData !== loaderData) {
    setGoalLoaderData(loaderData);
    if (goal === null && loaderData.status === "available" && loaderData.signedIn) setGoal(loaderData.savedGoal);
  }

  // The saves go through the module's queue, which outlives the page. A failure shows once no goal waits behind it,
  // and a new save hides the notice until its own result.
  const goalFetcher = useFetcher<RecruitGoalActionData>({ key: GOAL_SAVE_FETCHER_KEY });
  useEffect(() => {
    submitGoalSave = (next) =>
      goalFetcher.submit(
        { goal: next },
        { action: "/api/recruit-recommendations", method: "post", encType: "application/json" },
      );
  }, [goalFetcher.submit]);
  const [goalSaveFailed, setGoalSaveFailed] = useState(false);
  useEffect(() => {
    if (goalFetcher.state === "idle" && goalFetcher.data && !goalSaves.hasWaiting()) {
      setGoalSaveFailed(!goalFetcher.data.ok);
    }
  }, [goalFetcher.state, goalFetcher.data]);
  const saveGoal = (next: RecruitGoal) => {
    setGoalSaveFailed(false);
    goalSaves.save(next);
  };
  const handleGoalChange = (next: RecruitGoal) => {
    setGoal(next);
    if (signedIn) {
      saveGoal(next);
    } else {
      storeGoal(next);
    }
  };

  // The recommendations of the chosen goal. A goal change, or a retry, loads them again. Each goal has its own fetcher,
  // so a previous goal's result never shows under the new one, and a reload after a favorite change keeps the timeline
  // on screen. A retry after a failure shows the skeleton until the new result arrives.
  const recommendationFetcher = useFetcher<RecruitRecommendationsLoaderData>({
    key: `recruit-recommendations:${goal ?? "none"}`,
  });
  const loadRecommendationsRef = useRef(recommendationFetcher.load);
  loadRecommendationsRef.current = recommendationFetcher.load;
  const [recommendationRequest, setRecommendationRequest] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry bumps the request count to load the goal again
  useEffect(() => {
    if (goal === null) return;
    void loadRecommendationsRef.current(`/api/recruit-recommendations?goal=${goal}`);
  }, [goal, recommendationRequest]);
  const recommendations = recommendationFetcher.data;
  const recommendationsReady =
    recommendations !== undefined && (recommendations.status === "ok" || recommendationFetcher.state === "idle");

  // Favorites: the counts follow each loader result while no favorite call is in flight, and the viewer's own state
  // streams in after the page renders.
  const favoriteFetcher = useFetcher<ContentsActionData>();
  const loadedCounts = available ? loaderData.favoritedCounts : null;
  const [countsSync, setCountsSync] = useState<FavoriteCountsSync>(() => ({
    source: loaderData,
    counts: loadedCounts ?? [],
  }));
  const nextCountsSync = syncFavoriteCounts(
    countsSync,
    { source: loaderData, counts: loadedCounts ?? [] },
    favoriteFetcher.state,
  );
  if (nextCountsSync !== countsSync) setCountsSync(nextCountsSync);
  const resolvedFavorites = useSettledValue(available ? loaderData.favorites : NO_FAVORITES, UNAVAILABLE_FAVORITES);
  const [favorites, setFavorites] = useState<FavoriteKey[]>([]);
  useEffect(() => {
    if (resolvedFavorites?.status === "available") setFavorites(resolvedFavorites.value ?? []);
  }, [resolvedFavorites]);
  // The recruitment records and the favorites are the viewer's own records: when the records fail, the hearts are off
  // as when the favorites fail, and one notice above the timeline says so.
  const recordsUnavailable = recommendations?.status === "ok" && recommendations.recruited === "unavailable";
  const ownState: RecruitPickupFavorite["ownState"] = !signedIn
    ? "guest"
    : recordsUnavailable
      ? "unavailable"
      : resolvedFavorites === undefined
        ? "pending"
        : resolvedFavorites.status === "available"
          ? "ready"
          : "unavailable";

  const toggleFavorite = (contentUid: string, studentUid: string, favorited: boolean) => {
    if (!signedIn) {
      showSignIn();
      return;
    }
    if (ownState !== "ready") return;
    favoriteFetcher.submit(
      { favorite: { contentUid, studentUid, favorited } },
      { action: "/api/contents", method: "post", encType: "application/json" },
    );
    setFavorites((current) => {
      const has = current.some((favorite) => equalFavorites(favorite, { contentUid, studentUid }));
      if (favorited && !has) return [...current, { contentUid, studentUid }];
      if (!favorited && has) return current.filter((favorite) => !equalFavorites(favorite, { contentUid, studentUid }));
      return current;
    });
    setCountsSync((current) => ({
      ...current,
      counts: applyFavoriteCountChange(current.counts, { contentUid, studentUid, favorited }),
    }));
  };

  // Spoilers share the 미래시 reveals, so a content revealed on either screen is revealed on both.
  const [revealedSpoilers, setRevealedSpoilers] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRevealedSpoilers(parseRevealedSpoilerContentUids(localStorage.getItem(futuresRevealedSpoilerKey)));
    } catch {
      setRevealedSpoilers([]);
    }
  }, []);
  const revealSpoiler = (contentUid: string) => {
    setRevealedSpoilers((current) => {
      const next = current.includes(contentUid) ? current : [...current, contentUid];
      try {
        localStorage.setItem(futuresRevealedSpoilerKey, JSON.stringify(next));
      } catch {
        // The reveal still applies to this visit.
      }
      return next;
    });
  };

  const now = nowUtcIso();
  const favoritedSet = useMemo(
    () => new Set(favorites.map((favorite) => `${favorite.contentUid}\u0000${favorite.studentUid}`)),
    [favorites],
  );
  const countByKey = useMemo(
    () => new Map(countsSync.counts.map((entry) => [`${entry.contentUid}\u0000${entry.studentUid}`, entry.count])),
    [countsSync.counts],
  );

  const contentViews: RecruitContentView[] = (available ? loaderData.contents : []).map((content) => {
    const hidden = content.isSpoiler && !revealedSpoilers.includes(content.uid);
    const cautionText =
      getFutureSpecialCases({
        contentType: content.contentType,
        tags: content.tags,
        recruitments: content.pickups,
        recruitmentGroupUid: content.recruitmentGroupUid,
        recruitmentPeriod: content.recruitmentPeriod,
        since: content.since,
        until: content.until,
        endless: content.endless,
        now,
        timeZone,
      })
        .map(getCautionText)
        .find((text): text is string => text !== null) ?? null;
    return {
      uid: content.uid,
      name: content.name,
      contentType: content.contentType,
      runType: content.runType,
      since: content.since,
      until: content.until,
      endless: content.endless,
      typeLabel: getFutureMediaTypeLabel(content),
      mediaSource: selectFutureMediaSource({
        hidden,
        isRaid: content.boss !== null,
        boss: content.boss,
        logoContentUid: content.logoContentUid,
      }),
      link: content.link,
      linkable: content.linkable && !hidden,
      cautionText,
      hidden,
      pickups: content.pickups.map((pickup): RecruitPickupView => {
        const key = `${content.uid}\u0000${pickup.favoriteKey}`;
        const { name, variant } = splitVisibleStudentName(pickup.studentName);
        return {
          favoriteKey: pickup.favoriteKey,
          studentUid: pickup.studentUid,
          name,
          variant,
          recruitmentLabel: pickup.recruitmentLabel,
          isNew: pickup.isNew,
          since: pickup.since,
          until: pickup.until,
          favorite: {
            count: loadedCounts === null ? null : (countByKey.get(key) ?? 0),
            favorited: favoritedSet.has(key),
            ownState,
            onToggle: (favorited) => toggleFavorite(content.uid, pickup.favoriteKey, favorited),
          },
        };
      }),
    };
  });

  const answer = recommendationsReady && recommendations?.status === "ok" ? recommendations : null;
  const timeline = answer
    ? buildRecruitTimeline<RecruitContentView, RecruitPickupView>({
        goal: answer.goal,
        answer: answer.answer,
        contents: contentViews,
        recruitedStudentUids: new Set(answer.recruitedStudentUids),
        now,
      })
    : null;
  const substituteNames = useMemo(
    () => new Map(Object.entries(answer?.substituteNames ?? {})),
    [answer?.substituteNames],
  );

  const retryAll = () => {
    revalidator.revalidate();
    setRecommendationRequest((request) => request + 1);
  };

  let main: ReactNode;
  if (!available) {
    main = <RecruitLoadFailure onRetry={() => revalidator.revalidate()} />;
  } else if (!goalReady) {
    main = <RecruitTimelineSkeleton />;
  } else if (goal === null) {
    main = <RecruitGoalCards onSelect={handleGoalChange} />;
  } else if (!recommendationsReady) {
    main = <RecruitTimelineSkeleton />;
  } else if (answer === null || timeline === null) {
    main = <RecruitLoadFailure onRetry={() => setRecommendationRequest((request) => request + 1)} />;
  } else {
    const viewerMessage =
      answer.recruited === "unavailable"
        ? "모집 기록을 불러오지 못해 모집한 학생도 함께 보여요"
        : ownState === "unavailable"
          ? "관심 학생을 불러오지 못했어요"
          : null;
    main = (
      <>
        {goalSaveFailed ? (
          <RecruitViewerNotice message="목표를 저장하지 못했어요" onRetry={() => saveGoal(goal)} />
        ) : null}
        {viewerMessage ? <RecruitViewerNotice message={viewerMessage} onRetry={retryAll} /> : null}
        {timeline.allRecommendedRecruited ? <RecruitAllRecruited /> : null}
        {timeline.contents.length === 0 ? (
          <RecruitNoPickups />
        ) : (
          <RecruitTimeline
            goal={answer.goal}
            contents={timeline.contents}
            substituteNames={substituteNames}
            now={now}
            timeZone={timeZone}
            onRevealSpoiler={revealSpoiler}
          />
        )}
      </>
    );
  }

  const goalChoice = <RecruitGoalChoice value={goal} onChange={handleGoalChange} />;
  const criteria = <RecruitCriteria />;
  return (
    <V2Page width="wide">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
      <PageMain>{main}</PageMain>
      <PageAside>
        <PanelSheet panelId={GOAL_PANEL_ID} title="목표" Icon={FlagIcon}>
          {goalChoice}
        </PanelSheet>
        <PanelSheet
          panelId="criteria"
          title="추천 기준"
          description={goal ? recruitCriteriaSummary(goal) : undefined}
          Icon={InformationCircleIcon}
          collapsible
        >
          {criteria}
        </PanelSheet>
        <AsideLinks
          items={[
            {
              key: "futures",
              title: "미래시",
              description: "다가오는 컨텐츠 일정",
              Icon: CalendarIcon,
              to: "/futures",
            },
            {
              key: "pyroxene",
              title: "청휘석 플래너",
              description: "모집 시점의 청휘석 계산",
              Icon: CreditCardIcon,
              to: "/utils/pyroxene",
            },
          ]}
        />
      </PageAside>
      <MobileActionBar
        links={[{ key: "futures", title: "미래시", Icon: CalendarIcon, to: "/futures" }]}
        panels={[
          { panelId: PLAN_SHEET_PANEL_ID, title: goal ? `목표: ${recruitGoalLabels[goal]}` : "목표", Icon: FlagIcon },
        ]}
      />
      <PlanSheet
        title="목표"
        Icon={FlagIcon}
        sections={[
          { key: "goal", content: goalChoice },
          { key: "criteria", title: "추천 기준", Icon: InformationCircleIcon, content: criteria },
        ]}
      />
    </V2Page>
  );
}
