import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  type ContentFilterState,
  defaultContentFilterState,
  normalizeContentFilterState,
} from "~/domain/futures/content-filter-state";
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
  // The stacked layout as V2Page measures it, the same signal that shows and hides the tabs. Stacked until the first
  // measurement, as V2Page starts.
  const [isMobile, setIsMobile] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [visitState, setVisitState] = useState<FuturesVisitState | null>(null);

  useIsomorphicLayoutEffect(() => {
    const localStorage = getBrowserStorage("localStorage");
    const sessionStorage = getBrowserStorage("sessionStorage");
    const desktopStoredView = readStoredContentView(localStorage, futuresContentViewKey);
    const mobileStoredView = readStoredContentView(localStorage, futuresMobileContentViewKey, true);
    const visit = readFutureVisitState(sessionStorage, entryKey);

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
    // Pass to V2Page's onStackedChange. The setter is stable, so V2Page's effect runs only when the layout changes.
    onStackedChange: setIsMobile,
    visitState,
  };
}
