import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ContentFilterState } from "~/components/features/futures/content-filter-state";
import {
  type FutureContentSurface,
  type FutureContentView,
  type FuturesScrollAnchor,
  type FuturesVisitState,
  getBrowserStorage,
  getFutureAnchorNeighborUids,
  getFutureDetailReturnDelta,
  getFutureVisitStateForSurface,
  isVerifiedFutureDetailReturn,
  navigateBackWithViewTransition,
  readFutureDetailNavigationState,
  readFutureVisitState,
  saveFutureVisitState,
  setNavigationDirection,
} from "./futures-navigation";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useVerifiedFutureDetailReturn(currentContentUid: string | undefined, locationState: unknown) {
  const navigationState = readFutureDetailNavigationState(locationState);
  const [verifiedFutureReturn, setVerifiedFutureReturn] = useState(false);

  useIsomorphicLayoutEffect(() => {
    if (!navigationState) {
      setVerifiedFutureReturn(false);
      return;
    }

    const visitState = readFutureVisitState(getBrowserStorage("sessionStorage"), navigationState.entryKey);
    setVerifiedFutureReturn(isVerifiedFutureDetailReturn(navigationState, currentContentUid, visitState));
  }, [currentContentUid, navigationState]);

  return { navigationState, verifiedFutureReturn };
}

export function useFutureDetailReturn(
  currentContentUid: string | undefined,
  locationState: unknown,
  navigate: (delta: number) => void | Promise<void>,
) {
  const { navigationState, verifiedFutureReturn } = useVerifiedFutureDetailReturn(currentContentUid, locationState);
  const returnToFutures = useCallback(() => {
    setNavigationDirection("reverse");
    void navigateBackWithViewTransition(navigate, getFutureDetailReturnDelta(navigationState) ?? -1);
  }, [navigate, navigationState]);

  return { navigationState, verifiedFutureReturn, returnToFutures };
}

type FuturesNavigationOptions = {
  entryKey: string;
  surface: FutureContentSurface;
  view: FutureContentView;
  filter: ContentFilterState;
  visitState: FuturesVisitState | null;
  contentSignature: string;
};

export function useFuturesNavigation({
  entryKey,
  surface,
  view,
  filter,
  visitState,
  contentSignature,
}: FuturesNavigationOptions) {
  const pendingAnchorRef = useRef<FuturesScrollAnchor | null>(null);
  const restoredVisitSignatureRef = useRef<string | null>(null);

  const captureCurrentAnchor = useCallback((): FuturesScrollAnchor => {
    const container = getScrollContainer();
    if (!container) {
      return { contentUid: null, neighborContentUids: [], relativeOffset: 0 };
    }

    return readScrollAnchor(container);
  }, []);

  const preserveCurrentPosition = useCallback(() => {
    pendingAnchorRef.current = captureCurrentAnchor();
  }, [captureCurrentAnchor]);

  const saveBeforeContentNavigation = useCallback(() => {
    const anchor = captureCurrentAnchor();
    saveFutureVisitState(getBrowserStorage("sessionStorage"), {
      version: 2,
      entryKey,
      surface,
      view,
      filter,
      ...anchor,
      savedAt: Date.now(),
    });
    setNavigationDirection("forward");
  }, [captureCurrentAnchor, entryKey, filter, surface, view]);

  useIsomorphicLayoutEffect(() => {
    const restorableVisitState = getFutureVisitStateForSurface(visitState, surface);
    const anchor = pendingAnchorRef.current ?? restorableVisitState;
    if (!anchor) {
      return;
    }

    const visitSignature = restorableVisitState
      ? `${restorableVisitState.entryKey}:${restorableVisitState.surface}:${restorableVisitState.contentUid ?? ""}:${restorableVisitState.neighborContentUids.join(",")}:${restorableVisitState.relativeOffset}`
      : null;
    if (!pendingAnchorRef.current && visitSignature && restoredVisitSignatureRef.current === visitSignature) {
      return;
    }

    const container = getScrollContainer();
    if (!container) {
      return;
    }

    const items = getScrollItems(container);
    if (items.length === 0) {
      container.scrollTop = 0;
      if (pendingAnchorRef.current) {
        pendingAnchorRef.current = null;
      }
      if (visitSignature) {
        restoredVisitSignatureRef.current = visitSignature;
      }
      return;
    }

    restoreScrollAnchor(container, anchor);
    pendingAnchorRef.current = null;
    if (visitSignature) {
      restoredVisitSignatureRef.current = visitSignature;
    }
  }, [contentSignature, entryKey, filter, surface, view, visitState]);

  return {
    preserveCurrentPosition,
    saveBeforeContentNavigation,
  };
}

function getScrollContainer(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector<HTMLElement>(".mllg-content-area");
}

function getScrollItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-futures-content-uid]")).filter(
    (item) => item.getClientRects().length > 0 && item.getBoundingClientRect().height > 0,
  );
}

function readScrollAnchor(container: HTMLElement): FuturesScrollAnchor {
  const items = getScrollItems(container);
  if (items.length === 0) {
    return { contentUid: null, neighborContentUids: [], relativeOffset: 0 };
  }

  const containerRect = container.getBoundingClientRect();
  const index = items.findIndex((item) => item.getBoundingClientRect().bottom > containerRect.top + 1);
  const itemIndex = index >= 0 ? index : items.length - 1;
  const item = items[itemIndex];
  const contentUid = item.dataset.futuresContentUid ?? null;
  const relativeOffset = item.getBoundingClientRect().top - containerRect.top;
  const neighborContentUids = getFutureAnchorNeighborUids(
    items.map((scrollItem) => scrollItem.dataset.futuresContentUid ?? null),
    itemIndex,
  );

  return {
    contentUid,
    neighborContentUids,
    relativeOffset,
  };
}

function restoreScrollAnchor(container: HTMLElement, anchor: FuturesScrollAnchor): void {
  const items = getScrollItems(container);
  if (items.length === 0) {
    container.scrollTop = 0;
    return;
  }

  const target =
    (anchor.contentUid ? items.find((item) => item.dataset.futuresContentUid === anchor.contentUid) : undefined) ??
    anchor.neighborContentUids
      .map((contentUid) => items.find((item) => item.dataset.futuresContentUid === contentUid))
      .find((item): item is HTMLElement => Boolean(item)) ??
    items[0];
  if (!target) {
    container.scrollTop = 0;
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextScrollTop = container.scrollTop + targetRect.top - containerRect.top - anchor.relativeOffset;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.min(maxScrollTop, Math.max(0, nextScrollTop));
}
