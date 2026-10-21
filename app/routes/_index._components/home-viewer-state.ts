import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import type { RecruitmentCompletionMeta, RecruitmentResult } from "~/models/recruitment-result";
import type { ActionData as ContentsActionData } from "~/routes/api.contents";
import type { ActionData as RecruitmentResultActionData } from "~/routes/api.recruitment-results";
import { trackRecruitmentResultSubmitted } from "~/lib/google-analytics-events.client";
import {
  applyFavoriteCountChange,
  equalFavorites,
  type FavoriteCountsSync,
  type FavoritedCountEntry,
  syncFavoriteCounts,
} from "~/routes/futures._components/favorited-counts";
import {
  resolveViewerStatus,
  useSettledValue,
  type ViewerLoaded,
  type ViewerStatus,
} from "~/routes/futures._components/viewer-state";
import type { HomeFavoritedCount, HomeSourceResult } from "~/views/home";

export type HomeFavoriteRow = { contentId: string; studentId: string };

// The viewer's own state, read after the page renders. Both reads settle as one pair. A guest's state is empty, not unknown.
export type HomeViewerData = {
  favorites: ViewerLoaded<HomeFavoriteRow[]>;
  results: ViewerLoaded<RecruitmentResult[]>;
};

const UNAVAILABLE_VIEWER: HomeViewerData = {
  favorites: { status: "unavailable" },
  results: { status: "unavailable" },
};

// Until the counts load, and when they fail, the count stays hidden. A count is never shown as zero.
const UNKNOWN_COUNTS: HomeSourceResult<HomeFavoritedCount[]> = { status: "error" };

const favoriteKey = (contentUid: string, studentKey: string) => `${contentUid}|${studentKey}`;

// An optimistic value. It holds from the moment the viewer chooses it. A failed write removes it, so the screen shows the server
// state. A confirmed write keeps it until fresh viewer data replaces the data it was confirmed against.
type Override = { value: boolean; requestId: number; confirmedAgainst: object | null };
type Overrides = Record<string, Override>;

function withOverride(overrides: Overrides, key: string, override: Override): Overrides {
  return { ...overrides, [key]: override };
}

function confirmOverride(overrides: Overrides, key: string, requestId: number, settled: object | null): Overrides {
  const override = overrides[key];
  if (!override || override.requestId !== requestId) return overrides;
  return withOverride(overrides, key, { ...override, confirmedAgainst: settled });
}

function withoutOverride(overrides: Overrides, key: string, requestId: number): Overrides {
  const override = overrides[key];
  if (!override || override.requestId !== requestId) return overrides;
  const { [key]: _removed, ...rest } = overrides;
  return rest;
}

// Fresh viewer data drops the confirmed overrides that were confirmed against the data before it.
function dropConfirmedBefore(overrides: Overrides, settled: object): Overrides {
  const entries = Object.entries(overrides);
  const kept = entries.filter(
    ([, override]) => override.confirmedAgainst === null || override.confirmedAgainst === settled,
  );
  return kept.length === entries.length ? overrides : Object.fromEntries(kept);
}

function entriesOf(result: HomeSourceResult<HomeFavoritedCount[]>): FavoritedCountEntry[] {
  return result.status === "success"
    ? result.data.map((count) => ({ contentUid: count.contentId, studentUid: count.studentId, count: count.count }))
    : [];
}

// One write, sent as its own request. Its outcome is read in its own closure, so a second write never replaces the first one's
// outcome. A redirect is not followed: the write comes back as the redirect itself, so the page it leads to (for example the
// sign-in page, when the session has expired) is never read as the answer. A network failure reads as a failed write.
async function sendWrite(
  url: string,
  body: ContentsActionData | RecruitmentResultActionData,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  } catch {
    return null;
  }
}

// A write succeeded only when the route answered 200 with JSON, without a redirect, and the body is the one its action returns.
// A resource route returns `null` as `Response.json(null)`, so a favorite write answers the body `null`. A completion write answers
// `{ success: true, ... }`. A followed redirect to an HTML page and an error status both fail this check.
async function writeSucceeded(
  response: Response | null,
  isSuccessBody: (json: unknown) => boolean,
  onSuccess?: (json: unknown) => void,
): Promise<boolean> {
  if (!response || response.redirected || response.type === "opaqueredirect" || response.status !== 200) return false;
  if (!response.headers.get("content-type")?.includes("application/json")) return false;
  const json: unknown = await response.json().catch(() => undefined);
  if (json === undefined || !isSuccessBody(json)) return false;
  onSuccess?.(json);
  return true;
}

const isFavoriteWriteBody = (json: unknown) => json === null;
const isCompletionWriteBody = (json: unknown) => (json as { success?: unknown } | null)?.success === true;

// Own state and public counts of the home. The favorites and completions the viewer has, plus optimistic changes until the
// server confirms them. The counts follow each loaded result while no write is in flight, as on /futures. Guests and a pending
// or failed read never show a personal mark as known.
export function useHomeViewerState({
  signedIn,
  viewer,
  favoritedCounts,
}: {
  signedIn: boolean;
  viewer: Promise<HomeViewerData>;
  favoritedCounts: Promise<HomeSourceResult<HomeFavoritedCount[]>>;
}) {
  const { showSignIn } = useSignIn();
  const revalidator = useRevalidator();
  const settled = useSettledValue(viewer, UNAVAILABLE_VIEWER);
  const settledCounts = useSettledValue(favoritedCounts, UNKNOWN_COUNTS) ?? UNKNOWN_COUNTS;
  const status: ViewerStatus = resolveViewerStatus(settled?.favorites, settled?.results);
  const ready = status === "ready";

  const [favoriteOverrides, setFavoriteOverrides] = useState<Overrides>({});
  const [completionOverrides, setCompletionOverrides] = useState<Overrides>({});
  const [writesInFlight, setWritesInFlight] = useState(0);
  // The newest request per key. Only the newest request of a key may change that key's override or count.
  const requestSequence = useRef(0);
  const newestRequest = useRef(new Map<string, number>());
  const latestSettled = useRef(settled);

  useEffect(() => {
    latestSettled.current = settled;
    if (!settled) return;
    setFavoriteOverrides((prev) => dropConfirmedBefore(prev, settled));
    setCompletionOverrides((prev) => dropConfirmedBefore(prev, settled));
  }, [settled]);

  const serverFavorites = new Set(
    ready && settled?.favorites.status === "available"
      ? settled.favorites.value.map((row) => favoriteKey(row.contentId, row.studentId))
      : [],
  );
  // A completion counts once its result is completed, for the recruited and the exchanged students alike.
  const serverCompletions = new Set(
    ready && settled?.results.status === "available"
      ? settled.results.value
          .filter((result) => result.completedAt !== null)
          .flatMap((result) =>
            [...result.recruitedStudents, ...result.exchangedStudents].map((student) =>
              favoriteKey(result.recruitmentGroupUid, student.studentUid),
            ),
          )
      : [],
  );

  // The counts shown: the loaded result, with the optimistic changes of the writes that are in flight.
  const loadedCounts: FavoriteCountsSync = { source: settledCounts, counts: entriesOf(settledCounts) };
  const [countsSync, setCountsSync] = useState<FavoriteCountsSync>(loadedCounts);
  // Runs during render, so the stale counts never reach the screen. See syncFavoriteCounts.
  const nextCountsSync = syncFavoriteCounts(countsSync, loadedCounts, writesInFlight > 0 ? "submitting" : "idle");
  if (nextCountsSync !== countsSync) {
    setCountsSync(nextCountsSync);
  }

  const isFavorited = (contentUid: string, studentKey: string) => {
    const key = favoriteKey(contentUid, studentKey);
    if (!signedIn || !ready) return false;
    const override = favoriteOverrides[key];
    return override ? override.value : serverFavorites.has(key);
  };

  // The favorited count of a content's student. Null while it is hidden: the counts are still loading, or they failed.
  const favoriteCount = (contentUid: string, studentKey: string): number | null => {
    if (settledCounts.status !== "success") return null;
    const entry = nextCountsSync.counts.find((count) => equalFavorites(count, { contentUid, studentUid: studentKey }));
    return entry?.count ?? 0;
  };

  const isCompleted = (groupUid: string, studentUid: string) => {
    const key = favoriteKey(groupUid, studentUid);
    if (!signedIn || !ready) return false;
    const override = completionOverrides[key];
    return override ? override.value : serverCompletions.has(key);
  };

  const startRequest = (key: string) => {
    requestSequence.current += 1;
    newestRequest.current.set(key, requestSequence.current);
    return requestSequence.current;
  };
  const isNewest = (key: string, requestId: number) => newestRequest.current.get(key) === requestId;

  const toggleFavorite = (contentUid: string, studentKey: string, favorited: boolean) => {
    if (!signedIn) {
      showSignIn();
      return;
    }
    if (!ready) return;
    const key = favoriteKey(contentUid, studentKey);
    const change = { contentUid, studentUid: studentKey, favorited };
    const requestId = startRequest(key);
    setFavoriteOverrides((prev) => withOverride(prev, key, { value: favorited, requestId, confirmedAgainst: null }));
    setCountsSync((prev) => ({ ...prev, counts: applyFavoriteCountChange(prev.counts, change) }));
    setWritesInFlight((count) => count + 1);
    void sendWrite("/api/contents", { favorite: change }).then(async (response) => {
      const succeeded = await writeSucceeded(response, isFavoriteWriteBody);
      setWritesInFlight((count) => count - 1);
      if (succeeded) {
        setFavoriteOverrides((prev) => confirmOverride(prev, key, requestId, latestSettled.current ?? null));
      } else if (isNewest(key, requestId)) {
        setFavoriteOverrides((prev) => withoutOverride(prev, key, requestId));
        setCountsSync((prev) => ({
          ...prev,
          counts: applyFavoriteCountChange(prev.counts, { ...change, favorited: !favorited }),
        }));
      }
      revalidator.revalidate();
    });
  };

  const toggleComplete = (
    groupUid: string,
    contentUid: string,
    studentUid: string,
    completed: boolean,
    meta: RecruitmentCompletionMeta,
  ) => {
    if (!signedIn) {
      showSignIn();
      return;
    }
    if (!ready) return;
    const key = favoriteKey(groupUid, studentUid);
    const requestId = startRequest(key);
    setCompletionOverrides((prev) => withOverride(prev, key, { value: completed, requestId, confirmedAgainst: null }));
    setWritesInFlight((count) => count + 1);
    const body: RecruitmentResultActionData = completed
      ? {
          action: "completeStudent",
          contentUid,
          recruitmentGroupUid: groupUid,
          studentUid,
          tier: meta.tier,
          pickup: meta.pickup,
        }
      : { action: "uncompleteStudent", recruitmentGroupUid: groupUid, studentUid };
    void sendWrite("/api/recruitment-results", body).then(async (response) => {
      const succeeded = await writeSucceeded(response, isCompletionWriteBody, (json) => {
        trackRecruitmentResultSubmitted((json as { analyticsAction?: unknown }).analyticsAction);
      });
      setWritesInFlight((count) => count - 1);
      if (succeeded) {
        setCompletionOverrides((prev) => confirmOverride(prev, key, requestId, latestSettled.current ?? null));
      } else if (isNewest(key, requestId)) {
        setCompletionOverrides((prev) => withoutOverride(prev, key, requestId));
      }
      revalidator.revalidate();
    });
  };

  return {
    status,
    signedIn,
    isFavorited,
    favoriteCount,
    isCompleted,
    toggleFavorite,
    toggleComplete,
  };
}

export type HomeViewerState = ReturnType<typeof useHomeViewerState>;
