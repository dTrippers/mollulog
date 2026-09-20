import {
  type ContentFilterState,
  defaultContentFilterState,
  normalizeContentFilterState,
} from "~/components/features/futures/content-filter-state";

export type FutureContentView = "timeline" | "table" | "compact";
export type MobileFutureContentView = Exclude<FutureContentView, "table">;
export type FutureContentSurface = "mobile" | "desktop";

export const futuresContentFilterKey = "futures::content-filter";
export const futuresContentViewKey = "futures::content-view";
export const futuresMobileContentViewKey = "futures::mobile-content-view";
export const futuresVisitStateKey = "futures::visit-state";

const FUTURES_NAVIGATION_STATE_VERSION = 1;
const FUTURES_VISIT_STATE_VERSION = 2;
const MAX_FUTURES_VISIT_STATES = 8;
const MAX_FUTURES_NEIGHBOR_UIDS = 4;
const MAX_FUTURES_VISIT_AGE_MS = 12 * 60 * 60 * 1000;

export type FutureNavigationDirection = "forward" | "reverse";

type FutureViewTransitionDocument = Pick<Document, "visibilityState"> & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
};

let pendingNavigationDirection: FutureNavigationDirection | null = null;

export type FuturesScrollAnchor = {
  contentUid: string | null;
  neighborContentUids: string[];
  relativeOffset: number;
};

export type FuturesVisitState = FuturesScrollAnchor & {
  version: typeof FUTURES_VISIT_STATE_VERSION;
  entryKey: string;
  surface: FutureContentSurface;
  view: FutureContentView;
  filter: ContentFilterState;
  savedAt: number;
};

export type FutureDetailNavigationState = {
  __mllg: {
    source: "futures";
    version: typeof FUTURES_NAVIGATION_STATE_VERSION;
    entryKey: string;
    contentUid: string;
    sourceHistoryIndex?: number;
  };
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function normalizeFutureContentView(value: unknown): FutureContentView | null {
  return value === "timeline" || value === "table" || value === "compact" ? value : null;
}

export function normalizeMobileFutureContentView(value: unknown): MobileFutureContentView | null {
  return value === "timeline" || value === "compact" ? value : null;
}

export function getMobileFallbackView(value: unknown): MobileFutureContentView {
  return normalizeMobileFutureContentView(value) ?? "timeline";
}

export function getFutureVisitStateForSurface(
  visitState: FuturesVisitState | null,
  surface: FutureContentSurface,
): FuturesVisitState | null {
  return visitState?.surface === surface ? visitState : null;
}

export function resolveInitialFutureView({
  surface,
  visitState,
  storedView,
  defaultView = "timeline",
}: {
  surface: FutureContentSurface;
  visitState: FuturesVisitState | null;
  storedView: FutureContentView | MobileFutureContentView | null;
  defaultView?: FutureContentView;
}): FutureContentView | MobileFutureContentView {
  const visitView = getFutureVisitStateForSurface(visitState, surface)?.view ?? null;
  const resolvedView = visitView ?? storedView ?? defaultView;
  return surface === "mobile"
    ? getMobileFallbackView(resolvedView)
    : (normalizeFutureContentView(resolvedView) ?? defaultView);
}

export function getFutureAnchorNeighborUids(contentUids: readonly (string | null)[], anchorIndex: number): string[] {
  if (!Number.isInteger(anchorIndex) || anchorIndex < 0 || anchorIndex >= contentUids.length) {
    return [];
  }

  const neighbors: string[] = [];
  for (let offset = 1; neighbors.length < MAX_FUTURES_NEIGHBOR_UIDS; offset += 1) {
    const previous = contentUids[anchorIndex - offset];
    if (previous) {
      neighbors.push(previous);
    }

    if (neighbors.length >= MAX_FUTURES_NEIGHBOR_UIDS) {
      break;
    }

    const next = contentUids[anchorIndex + offset];
    if (next) {
      neighbors.push(next);
    }

    if (anchorIndex - offset < 0 && anchorIndex + offset >= contentUids.length) {
      break;
    }
  }

  return neighbors;
}

export function readStoredContentFilter(storage: StorageLike | null): ContentFilterState {
  const saved = readStorageValue(storage, futuresContentFilterKey);
  if (!saved) {
    return defaultContentFilterState;
  }

  try {
    return normalizeContentFilterState(JSON.parse(saved));
  } catch {
    return defaultContentFilterState;
  }
}

export function readStoredContentView(
  storage: StorageLike | null,
  key: string,
  mobile = false,
): FutureContentView | MobileFutureContentView | null {
  const saved = readStorageValue(storage, key);
  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved);
    return mobile ? normalizeMobileFutureContentView(parsed) : normalizeFutureContentView(parsed);
  } catch {
    return normalizeFutureContentView(saved);
  }
}

export function readFutureVisitState(storage: StorageLike | null, entryKey: string): FuturesVisitState | null {
  if (!entryKey) {
    return null;
  }

  const saved = readStorageValue(storage, futuresVisitStateKey);
  if (!saved) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const state = parsed.find((item): item is Record<string, unknown> => {
      if (!item || typeof item !== "object") {
        return false;
      }
      return "entryKey" in item && item.entryKey === entryKey;
    });
    if (!state || !isRecentFutureVisitState(state)) {
      return null;
    }

    return {
      version: FUTURES_VISIT_STATE_VERSION,
      entryKey,
      surface: state.surface,
      view: state.view,
      filter: normalizeContentFilterState(state.filter),
      contentUid: typeof state.contentUid === "string" && state.contentUid.length > 0 ? state.contentUid : null,
      neighborContentUids: normalizeNeighborContentUids(state.neighborContentUids),
      relativeOffset:
        typeof state.relativeOffset === "number" && Number.isFinite(state.relativeOffset) ? state.relativeOffset : 0,
      savedAt: state.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveFutureVisitState(storage: StorageLike | null, nextState: FuturesVisitState): void {
  if (!storage) {
    return;
  }

  try {
    const saved = readStorageValue(storage, futuresVisitStateKey);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    const existing = Array.isArray(parsed) ? parsed.filter(isRecentFutureVisitState) : [];
    const next = [...existing.filter((state) => state.entryKey !== nextState.entryKey), nextState].slice(
      -MAX_FUTURES_VISIT_STATES,
    );
    storage.setItem(futuresVisitStateKey, JSON.stringify(next));
  } catch {
    // A blocked or unavailable session store must not prevent navigation.
  }
}

export function createFutureDetailNavigationState(entryKey: string, contentUid: string): FutureDetailNavigationState {
  const sourceHistoryIndex = getBrowserHistoryIndex();
  return {
    __mllg: {
      source: "futures",
      version: FUTURES_NAVIGATION_STATE_VERSION,
      entryKey,
      contentUid,
      ...(sourceHistoryIndex === null ? {} : { sourceHistoryIndex }),
    },
  };
}

export function readFutureDetailNavigationState(value: unknown): FutureDetailNavigationState["__mllg"] | null {
  if (!value || typeof value !== "object" || !("__mllg" in value)) {
    return null;
  }

  const marker = value.__mllg;
  if (!marker || typeof marker !== "object") {
    return null;
  }

  if (
    !(
      "source" in marker &&
      marker.source === "futures" &&
      "version" in marker &&
      marker.version === FUTURES_NAVIGATION_STATE_VERSION &&
      "entryKey" in marker &&
      typeof marker.entryKey === "string" &&
      marker.entryKey.length > 0 &&
      "contentUid" in marker &&
      typeof marker.contentUid === "string" &&
      marker.contentUid.length > 0 &&
      (!("sourceHistoryIndex" in marker) || isNonNegativeInteger(marker.sourceHistoryIndex))
    )
  ) {
    return null;
  }

  return marker as FutureDetailNavigationState["__mllg"];
}

export function isVerifiedFutureDetailReturn(
  navigationState: FutureDetailNavigationState["__mllg"] | null,
  currentContentUid: string | undefined,
  visitState: FuturesVisitState | null,
): boolean {
  return Boolean(
    navigationState &&
      currentContentUid &&
      navigationState.contentUid === currentContentUid &&
      visitState &&
      visitState.entryKey === navigationState.entryKey,
  );
}

export function getBrowserStorage(type: "localStorage" | "sessionStorage"): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[type];
  } catch {
    return null;
  }
}

export function getBrowserHistoryIndex(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const index = window.history.state?.idx;
    return isNonNegativeInteger(index) ? index : null;
  } catch {
    return null;
  }
}

export function getFutureHistoryReturnDelta(
  sourceHistoryIndex: number | undefined,
  currentHistoryIndex: number | null,
): number | null {
  if (
    !isNonNegativeInteger(sourceHistoryIndex) ||
    !isNonNegativeInteger(currentHistoryIndex) ||
    sourceHistoryIndex >= currentHistoryIndex
  ) {
    return null;
  }

  return sourceHistoryIndex - currentHistoryIndex;
}

export function getFutureDetailReturnDelta(
  navigationState: FutureDetailNavigationState["__mllg"] | null,
): number | null {
  return getFutureHistoryReturnDelta(navigationState?.sourceHistoryIndex, getBrowserHistoryIndex());
}

export function setNavigationDirection(direction: FutureNavigationDirection): void {
  pendingNavigationDirection = direction;
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.mllgViewTransitionDirection = direction;
}

export function consumeNavigationDirection(): FutureNavigationDirection | null {
  const direction = pendingNavigationDirection;
  pendingNavigationDirection = null;
  return direction;
}

export function clearNavigationDirection(): void {
  pendingNavigationDirection = null;
  if (typeof document === "undefined") {
    return;
  }

  delete document.documentElement.dataset.mllgViewTransitionDirection;
}

export function canUseFutureViewTransition(documentLike: FutureViewTransitionDocument | null): boolean {
  return Boolean(
    documentLike && documentLike.visibilityState !== "hidden" && typeof documentLike.startViewTransition === "function",
  );
}

export async function navigateBackWithViewTransition(
  navigate: (delta: number) => void | Promise<void>,
  delta = -1,
): Promise<void> {
  if (typeof document === "undefined" || !canUseFutureViewTransition(document)) {
    await navigate(delta);
    return;
  }

  let navigationStarted = false;
  let navigationPromise: Promise<void> | undefined;
  try {
    const transition = document.startViewTransition?.(() => {
      navigationStarted = true;
      navigationPromise = Promise.resolve(navigate(delta));
      return navigationPromise;
    });
    await navigationPromise;
    await transition?.finished;
  } catch {
    if (!navigationStarted) {
      await navigate(delta);
    }
  }
}

function readStorageValue(storage: StorageLike | null, key: string): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function isRecentFutureVisitState(value: unknown): value is Record<string, unknown> & {
  version: typeof FUTURES_VISIT_STATE_VERSION;
  entryKey: string;
  surface: FutureContentSurface;
  view: FutureContentView;
  filter: unknown;
  contentUid?: unknown;
  neighborContentUids: unknown;
  relativeOffset?: unknown;
  savedAt: number;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Record<string, unknown>;
  const view = normalizeFutureContentView(state.view);
  const savedAt = state.savedAt;
  return (
    state.version === FUTURES_VISIT_STATE_VERSION &&
    typeof state.entryKey === "string" &&
    state.entryKey.length > 0 &&
    (state.surface === "mobile" || state.surface === "desktop") &&
    view !== null &&
    Array.isArray(state.neighborContentUids) &&
    state.neighborContentUids.length <= MAX_FUTURES_NEIGHBOR_UIDS &&
    state.neighborContentUids.every((uid) => typeof uid === "string" && uid.length > 0) &&
    typeof savedAt === "number" &&
    Number.isFinite(savedAt) &&
    Math.abs(Date.now() - savedAt) <= MAX_FUTURES_VISIT_AGE_MS
  );
}

function normalizeNeighborContentUids(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((uid): uid is string => typeof uid === "string" && uid.length > 0)
    .slice(0, MAX_FUTURES_NEIGHBOR_UIDS);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
