import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  type ContentFilterState,
  defaultContentFilterState,
  normalizeContentFilterState,
} from "~/components/features/futures/content-filter-state";
import {
  type FutureContentView,
  type FuturesVisitState,
  futuresContentFilterKey,
  futuresContentViewKey,
  futuresMobileContentViewKey,
  getBrowserStorage,
  getMobileFallbackView,
  type MobileFutureContentView,
  readFutureVisitState,
  readStoredContentFilter,
  readStoredContentView,
  resolveInitialFutureView,
} from "./futures-navigation";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useFuturesViewState(entryKey: string) {
  const [filter, setFilterState] = useState<ContentFilterState>(defaultContentFilterState);
  const [desktopView, setDesktopView] = useState<FutureContentView>("timeline");
  const [mobileView, setMobileView] = useState<MobileFutureContentView>("timeline");
  const [isMobile, setIsMobile] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [visitState, setVisitState] = useState<FuturesVisitState | null>(null);

  useIsomorphicLayoutEffect(() => {
    const localStorage = getBrowserStorage("localStorage");
    const sessionStorage = getBrowserStorage("sessionStorage");
    const desktopStoredView = readStoredContentView(localStorage, futuresContentViewKey);
    const mobileStoredView = readStoredContentView(localStorage, futuresMobileContentViewKey, true);
    const visit = readFutureVisitState(sessionStorage, entryKey);
    const mobileMedia =
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? null
        : window.matchMedia("(max-width: 1023px)");
    const mobile = mobileMedia?.matches ?? false;

    setIsMobile(mobile);
    setDesktopView(
      resolveInitialFutureView({
        surface: "desktop",
        visitState: visit,
        storedView: desktopStoredView,
      }) as FutureContentView,
    );
    setMobileView(
      resolveInitialFutureView({
        surface: "mobile",
        visitState: visit,
        storedView: mobileStoredView ?? desktopStoredView,
      }) as MobileFutureContentView,
    );
    setFilterState(visit?.filter ?? readStoredContentFilter(localStorage));
    setVisitState(visit);
    setIsHydrated(true);

    if (!mobileMedia) {
      return;
    }

    const updateMobileState = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    return subscribeToMediaQueryChanges(mobileMedia, updateMobileState);
  }, [entryKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const storage = getBrowserStorage("localStorage");
    try {
      storage?.setItem(futuresContentViewKey, desktopView);
    } catch {
      // Keep the screen usable when local storage is blocked.
    }
  }, [desktopView, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const storage = getBrowserStorage("localStorage");
    try {
      storage?.setItem(futuresMobileContentViewKey, mobileView);
    } catch {
      // Keep the screen usable when local storage is blocked.
    }
  }, [isHydrated, mobileView]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const storage = getBrowserStorage("localStorage");
    try {
      storage?.setItem(futuresContentFilterKey, JSON.stringify(normalizeContentFilterState(filter)));
    } catch {
      // Keep the screen usable when local storage is blocked.
    }
  }, [filter, isHydrated]);

  const setFilter = useCallback((nextFilter: ContentFilterState) => {
    setFilterState(normalizeContentFilterState(nextFilter));
  }, []);

  const setView = useCallback(
    (nextView: FutureContentView) => {
      if (isMobile) {
        setMobileView(getMobileFallbackView(nextView));
      } else {
        setDesktopView(nextView);
      }
    },
    [isMobile],
  );

  return {
    filter,
    setFilter,
    view: isMobile ? mobileView : desktopView,
    desktopView,
    mobileView,
    setView,
    isHydrated,
    isMobile,
    visitState,
  };
}

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

export function subscribeToMediaQueryChanges(
  media: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
): () => void {
  const compatibleMedia = media as LegacyMediaQueryList;
  if (typeof compatibleMedia.addEventListener === "function") {
    compatibleMedia.addEventListener("change", listener);
    return () => compatibleMedia.removeEventListener?.("change", listener);
  }

  if (typeof compatibleMedia.addListener === "function") {
    compatibleMedia.addListener(listener);
    return () => compatibleMedia.removeListener?.(listener);
  }

  return () => undefined;
}
