import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router";
import { commitV2Navigation, handleV2PopState, settleV2LinkTransition } from "./screen-transition";

export type V2PageWidth = "reading" | "wide" | "full";

export type V2PanelRequest = { panelId: string; requestId: number };

type V2PageContextValue = {
  width: V2PageWidth;
  stacked: boolean;
  sheetPanelId: string | null;
  openSheet: (panelId: string) => void;
  closeSheet: () => void;
  onSheetExited: () => void;
  revealRequest: V2PanelRequest | null;
};

const V2PageContext = createContext<V2PageContextValue | null>(null);

export function useV2Page(): V2PageContextValue {
  const context = useContext(V2PageContext);
  if (!context) {
    throw new Error("PageHeader, PageToolbar, PageMain, PageAside, and PanelSheet must render inside V2Page.");
  }
  return context;
}

// Side-by-side starts at 48rem of the page-available container. The breakpoint follows the root font size.
const sideBySideRem = 48;

function getSideBySideBreakpointPx(): number {
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return sideBySideRem * (Number.isFinite(rootFontSize) ? rootFontSize : 16);
}

function getPageMaxWidth(width: V2PageWidth): "default" | "wide" | "full" {
  if (width === "reading") {
    return "default";
  }
  return width;
}

export type V2PageProps = {
  width: V2PageWidth;
  panelRequest?: V2PanelRequest | null;
  panelCloseRequest?: number | null;
  onPanelCloseRequestHandled?: () => void;
  children: ReactNode;
};

export function V2Page({ width, panelRequest, panelCloseRequest, onPanelCloseRequestHandled, children }: V2PageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Mobile-first until the first measurement, so no desktop-only body mounts into a hidden aside.
  const [stacked, setStacked] = useState(true);
  // A program request waits for the first measurement. Otherwise a desktop request would open the stacked sheet.
  const [measured, setMeasured] = useState(false);
  const [sheetPanelId, setSheetPanelId] = useState<string | null>(null);
  const [revealRequest, setRevealRequest] = useState<V2PanelRequest | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusOnCloseRef = useRef(true);
  const lastPanelRequestIdRef = useRef<number | null>(null);
  const lastPanelCloseRequestRef = useRef<number | null>(null);
  const location = useLocation();
  const navigationType = useNavigationType();
  const locationSignature = `${location.pathname}${location.search}${location.hash}`;
  // A commit settles a pending link or back kind. A POP that the v2 back action did not start drops a pending link kind.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new location key is the trigger
  useEffect(() => {
    commitV2Navigation(navigationType);
  }, [location.key]);
  // A browser popstate fires before React Router starts its POP transition, so a pending link kind goes there first.
  useEffect(() => {
    window.addEventListener("popstate", handleV2PopState);
    return () => window.removeEventListener("popstate", handleV2PopState);
  }, []);
  // Leaving the page for a route that does not render V2Page settles a pending link transition too. This runs after that navigation commits.
  useEffect(() => () => settleV2LinkTransition(), []);
  const previousLocationSignatureRef = useRef(locationSignature);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setStacked(entry.contentRect.width < getSideBySideBreakpointPx());
      setMeasured(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const openSheet = useCallback((panelId: string) => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    restoreFocusOnCloseRef.current = true;
    setSheetPanelId(panelId);
  }, []);

  const closeSheet = useCallback(() => {
    restoreFocusOnCloseRef.current = true;
    setSheetPanelId(null);
  }, []);

  // Location and mode changes close the sheet without returning focus to the trigger.
  const closeSheetWithoutFocusReturn = useCallback(() => {
    restoreFocusOnCloseRef.current = false;
    setSheetPanelId(null);
  }, []);

  const onSheetExited = useCallback(() => {
    if (restoreFocusOnCloseRef.current) {
      return;
    }
    const opener = openerRef.current;
    openerRef.current = null;
    // Headless UI restores focus to the opener while the dialog unmounts. Blur it after that for the silent close.
    setTimeout(() => {
      if (opener && document.activeElement === opener) {
        opener.blur();
      }
    }, 0);
  }, []);

  useEffect(() => {
    if (previousLocationSignatureRef.current === locationSignature) {
      return;
    }
    previousLocationSignatureRef.current = locationSignature;
    closeSheetWithoutFocusReturn();
  }, [locationSignature, closeSheetWithoutFocusReturn]);

  useEffect(() => {
    if (!stacked) {
      closeSheetWithoutFocusReturn();
    }
  }, [stacked, closeSheetWithoutFocusReturn]);

  useEffect(() => {
    if (!measured || !panelRequest || panelRequest.requestId === lastPanelRequestIdRef.current) {
      return;
    }
    lastPanelRequestIdRef.current = panelRequest.requestId;
    if (stacked) {
      openSheet(panelRequest.panelId);
    } else {
      setRevealRequest(panelRequest);
    }
  }, [panelRequest, measured, stacked, openSheet]);

  useEffect(() => {
    if (panelCloseRequest == null || panelCloseRequest === lastPanelCloseRequestRef.current) {
      return;
    }
    lastPanelCloseRequestRef.current = panelCloseRequest;
    closeSheetWithoutFocusReturn();
    onPanelCloseRequestHandled?.();
  }, [panelCloseRequest, closeSheetWithoutFocusReturn, onPanelCloseRequestHandled]);

  const contextValue = useMemo<V2PageContextValue>(
    () => ({
      width,
      stacked,
      sheetPanelId,
      openSheet,
      closeSheet,
      onSheetExited,
      revealRequest,
    }),
    [width, stacked, sheetPanelId, openSheet, closeSheet, onSheetExited, revealRequest],
  );

  return (
    <V2PageContext.Provider value={contextValue}>
      <div
        ref={rootRef}
        data-v2-layout="true"
        data-page-max-width={getPageMaxWidth(width)}
        data-width={width}
        data-stacked={stacked ? "true" : "false"}
        className="min-w-0"
      >
        {children}
      </div>
    </V2PageContext.Provider>
  );
}
