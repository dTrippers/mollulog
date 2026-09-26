import { QuestionMarkCircleIcon } from "@heroicons/react/16/solid";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { annotateKnowledgeDescriptionParts, annotateKnowledgeText } from "~/domain/knowledge-annotation";
import { cn } from "~/lib/utils";
import type { KnowledgeAnnotationSegment, PublicKnowledgeEntry } from "~/models/knowledge-entry";

type OpenReason = "triggerHover" | "popoverHover" | "focus" | "touch";

type OpenReasons = Record<OpenReason, boolean>;

type ActiveTerm = {
  key: string;
  entry: PublicKnowledgeEntry;
  termText: string;
  triggerRoot: HTMLElement;
  focusTarget: HTMLButtonElement;
  reasons: OpenReasons;
};

type PopoverPosition = { key: string; top: number; left: number };
type ScheduledClose = { timeoutId: number; key: string; reason: OpenReason };

type StudentKnowledgePopoverContextValue = {
  activeKey: string | null;
  popoverId: string;
  setReason: (term: Omit<ActiveTerm, "reasons">, reason: OpenReason, value: boolean) => void;
  toggleTouch: (term: Omit<ActiveTerm, "reasons">) => void;
  toggleKeyboard: (term: Omit<ActiveTerm, "reasons">) => void;
  scheduleReasonEnd: (key: string, reason: OpenReason) => void;
  cancelScheduledClose: () => void;
  close: () => void;
};

const StudentKnowledgePopoverContext = createContext<StudentKnowledgePopoverContextValue | null>(null);

const HOVER_OPEN_DELAY_MS = 125;
const HOVER_CLOSE_DELAY_MS = 175;
const VIEWPORT_PADDING_PX = 12;
const POPOVER_GAP_PX = 6;

const emptyReasons = (): OpenReasons => ({
  triggerHover: false,
  popoverHover: false,
  focus: false,
  touch: false,
});

export function toggleKeyboardPopoverKey(activeKey: string | null, termKey: string): string | null {
  return activeKey === termKey ? null : termKey;
}

export function StudentKnowledgePopoverProvider({ children }: { children: React.ReactNode }) {
  const popoverId = useId();
  const [active, setActive] = useState<ActiveTerm | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const activeRef = useRef<ActiveTerm | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ScheduledClose | null>(null);
  const popoverTouchYRef = useRef<number | null>(null);
  const activeKey = active?.key ?? null;

  const replaceActive = useCallback((next: ActiveTerm | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  const cancelScheduledClose = useCallback(() => {
    const scheduled = closeTimerRef.current;
    if (scheduled) {
      window.clearTimeout(scheduled.timeoutId);
      closeTimerRef.current = null;
      const current = activeRef.current;
      if (current?.key === scheduled.key) {
        const reasons = { ...current.reasons, [scheduled.reason]: false };
        replaceActive(Object.values(reasons).some(Boolean) ? { ...current, reasons } : null);
      }
    }
  }, [replaceActive]);

  const setReason = useCallback(
    (term: Omit<ActiveTerm, "reasons">, reason: OpenReason, value: boolean) => {
      const current = activeRef.current;
      if (!value && current?.key !== term.key) return;
      const next: ActiveTerm =
        current?.key === term.key
          ? { ...current, ...term, reasons: { ...current.reasons, [reason]: value } }
          : { ...term, reasons: { ...emptyReasons(), [reason]: value } };
      replaceActive(Object.values(next.reasons).some(Boolean) ? next : null);
    },
    [replaceActive],
  );

  const toggleTouch = useCallback(
    (term: Omit<ActiveTerm, "reasons">) => {
      const current = activeRef.current;
      if (current?.key === term.key && current.reasons.touch) {
        replaceActive(null);
        return;
      }
      replaceActive({ ...term, reasons: { ...emptyReasons(), touch: true } });
    },
    [replaceActive],
  );

  const toggleKeyboard = useCallback(
    (term: Omit<ActiveTerm, "reasons">) => {
      const current = activeRef.current;
      if (toggleKeyboardPopoverKey(current?.key ?? null, term.key) === null) {
        replaceActive(null);
        return;
      }
      replaceActive({ ...term, reasons: { ...emptyReasons(), focus: true } });
    },
    [replaceActive],
  );

  const scheduleReasonEnd = useCallback(
    (key: string, reason: OpenReason) => {
      cancelScheduledClose();
      const timeoutId = window.setTimeout(() => {
        const scheduled = closeTimerRef.current;
        if (!scheduled || scheduled.key !== key || scheduled.reason !== reason) return;
        closeTimerRef.current = null;
        const current = activeRef.current;
        if (!current || current.key !== key) return;
        setReason(current, reason, false);
      }, HOVER_CLOSE_DELAY_MS);
      closeTimerRef.current = { timeoutId, key, reason };
    },
    [cancelScheduledClose, setReason],
  );

  const close = useCallback(() => {
    cancelScheduledClose();
    replaceActive(null);
  }, [cancelScheduledClose, replaceActive]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const current = activeRef.current;
      const target = event.target;
      if (!current || !(target instanceof Node)) return;
      if (current.triggerRoot.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = activeRef.current;
      if (!current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        current.focusTarget.focus();
      } else if (event.key === "Tab" && document.activeElement === current.focusTarget) {
        window.setTimeout(() => {
          const latest = activeRef.current;
          if (latest?.key === current.key && document.activeElement !== current.focusTarget) close();
        }, 0);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close]);

  useEffect(
    () => () => {
      cancelScheduledClose();
    },
    [cancelScheduledClose],
  );

  useEffect(() => {
    const popover = popoverRef.current;
    if (!activeKey || !popover) return;

    const handleWheel = (event: WheelEvent) => {
      const scrollArea = document.querySelector<HTMLElement>(".mllg-content-area");
      if (scrollArea) {
        event.preventDefault();
        const multiplier =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? scrollArea.clientHeight
              : 1;
        scrollArea.scrollTop += event.deltaY * multiplier;
        scrollArea.scrollLeft += event.deltaX * multiplier;
      }
      close();
    };

    const handleTouchStart = (event: TouchEvent) => {
      popoverTouchYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY;
      const previousY = popoverTouchYRef.current;
      if (currentY === undefined) return;
      if (previousY !== null) {
        const scrollArea = document.querySelector<HTMLElement>(".mllg-content-area");
        if (scrollArea) {
          event.preventDefault();
          scrollArea.scrollTop += previousY - currentY;
        }
        close();
      }
      popoverTouchYRef.current = currentY;
    };

    const clearTouchPosition = () => {
      popoverTouchYRef.current = null;
    };

    popover.addEventListener("wheel", handleWheel, { passive: false });
    popover.addEventListener("touchstart", handleTouchStart, { passive: true });
    popover.addEventListener("touchmove", handleTouchMove, { passive: false });
    popover.addEventListener("touchend", clearTouchPosition);
    popover.addEventListener("touchcancel", clearTouchPosition);

    return () => {
      popover.removeEventListener("wheel", handleWheel);
      popover.removeEventListener("touchstart", handleTouchStart);
      popover.removeEventListener("touchmove", handleTouchMove);
      popover.removeEventListener("touchend", clearTouchPosition);
      popover.removeEventListener("touchcancel", clearTouchPosition);
      popoverTouchYRef.current = null;
    };
  }, [activeKey, close]);

  const activeTriggerRoot = active?.triggerRoot ?? null;

  useLayoutEffect(() => {
    if (!activeKey || !activeTriggerRoot) {
      return;
    }

    const updatePosition = () => {
      const current = activeRef.current;
      const popover = popoverRef.current;
      if (!current || current.key !== activeKey || !popover) return;
      const triggerRect = current.triggerRoot.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + viewportHeight;
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      const scrollArea = document.querySelector<HTMLElement>(".mllg-content-area");
      const scrollAreaRect = scrollArea?.getBoundingClientRect();
      const fixedHeader = document.querySelector<HTMLElement>("header.fixed");
      const fixedHeaderRect = fixedHeader?.getBoundingClientRect() ?? null;
      const fixedHeaderStyle = fixedHeader ? window.getComputedStyle(fixedHeader) : null;
      const fixedHeaderBottom = fixedHeader
        ? getVisibleFixedHeaderBottom({
            viewportTop,
            headerRect: fixedHeaderRect,
            headerDisplay: fixedHeaderStyle?.display ?? "none",
            headerVisibility: fixedHeaderStyle?.visibility ?? "hidden",
          })
        : viewportTop + (isMobile ? getMobileHeaderHeight() : 0);
      const studentTabBar = document.querySelector<HTMLElement>('nav[aria-label="화면 탐색"]');
      const studentTabBarRect = studentTabBar?.getBoundingClientRect();
      const visibleTop = getKnowledgePopoverVisibleTop({
        viewportTop,
        scrollAreaTop: scrollAreaRect?.top ?? viewportTop,
        fixedHeaderBottom,
        studentTabBarRect: studentTabBarRect ?? null,
      });
      const contentBottom = Math.min(viewportBottom, scrollAreaRect?.bottom ?? viewportBottom);
      if (triggerRect.bottom <= visibleTop || triggerRect.top >= contentBottom) {
        close();
        return;
      }

      const minTop = visibleTop + VIEWPORT_PADDING_PX;
      const maxTop = viewportBottom - popoverRect.height - VIEWPORT_PADDING_PX;
      const spaceAbove = triggerRect.top - POPOVER_GAP_PX - minTop;
      const spaceBelow = viewportBottom - VIEWPORT_PADDING_PX - triggerRect.bottom - POPOVER_GAP_PX;
      const placeAbove = spaceAbove >= popoverRect.height || spaceAbove >= spaceBelow;
      const preferredTop = placeAbove
        ? triggerRect.top - POPOVER_GAP_PX - popoverRect.height
        : triggerRect.bottom + POPOVER_GAP_PX;
      const top = Math.max(minTop, Math.min(preferredTop, maxTop));
      const left = Math.max(
        VIEWPORT_PADDING_PX,
        Math.min(triggerRect.left, viewportWidth - popoverRect.width - VIEWPORT_PADDING_PX),
      );
      setPosition({ key: activeKey, top, left });
    };

    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    observer?.observe(activeTriggerRoot);
    if (popoverRef.current) observer?.observe(popoverRef.current);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      observer?.disconnect();
    };
  }, [activeKey, activeTriggerRoot, close]);

  const contextValue: StudentKnowledgePopoverContextValue = {
    activeKey: active?.key ?? null,
    popoverId,
    setReason,
    toggleTouch,
    toggleKeyboard,
    scheduleReasonEnd,
    cancelScheduledClose,
    close,
  };

  return (
    <StudentKnowledgePopoverContext.Provider value={contextValue}>
      {children}
      {active && typeof document !== "undefined"
        ? createPortal(
            <div
              id={popoverId}
              ref={popoverRef}
              role="tooltip"
              className="fixed z-layer-navigation-menu w-[min(18rem,calc(100vw-1.5rem))] rounded-lg bg-popover p-3 text-popover-foreground shadow-lg shadow-black/5 transition-opacity duration-100 dark:shadow-md dark:shadow-black/20 motion-reduce:transition-none"
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                opacity: position?.key === active.key ? 1 : 0,
              }}
              onPointerEnter={(event) => {
                if (!isPrecisePointer(event.pointerType)) return;
                cancelScheduledClose();
                setReason(active, "popoverHover", true);
              }}
              onPointerLeave={(event) => {
                if (!isPrecisePointer(event.pointerType)) return;
                scheduleReasonEnd(active.key, "popoverHover");
              }}
            >
              <p className="text-sm font-semibold text-foreground">{active.entry.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/80">{active.entry.body}</p>
            </div>,
            document.body,
          )
        : null}
    </StudentKnowledgePopoverContext.Provider>
  );
}

export function KnowledgeAnnotatedText({ text, entries }: { text: string; entries: readonly PublicKnowledgeEntry[] }) {
  return <>{renderAnnotatedSegments(annotateKnowledgeText(text, entries))}</>;
}

export function KnowledgeAnnotatedDescription({
  parts,
  entries,
}: {
  parts: readonly { key: string; text: string; dynamic: boolean; emphasized: boolean }[];
  entries: readonly PublicKnowledgeEntry[];
}) {
  const annotatedParts = annotateKnowledgeDescriptionParts(parts, entries);
  return (
    <>
      {annotatedParts.map((part) =>
        part.dynamic ? (
          <span key={part.key} className={part.emphasized ? "font-semibold text-primary" : "text-primary"}>
            {part.segments[0]?.text}
          </span>
        ) : (
          <span key={part.key}>{renderAnnotatedSegments(part.segments, part.key)}</span>
        ),
      )}
    </>
  );
}

export function getVisibleFixedHeaderBottom({
  viewportTop,
  headerRect,
  headerDisplay,
  headerVisibility,
}: {
  viewportTop: number;
  headerRect: Pick<DOMRect, "bottom" | "height"> | null;
  headerDisplay: string;
  headerVisibility: string;
}): number {
  if (headerRect === null || headerRect.height <= 0 || headerDisplay === "none" || headerVisibility !== "visible") {
    return viewportTop;
  }
  return Math.max(viewportTop, headerRect.bottom);
}

export function getKnowledgePopoverVisibleTop({
  viewportTop,
  scrollAreaTop,
  fixedHeaderBottom,
  studentTabBarRect,
}: {
  viewportTop: number;
  scrollAreaTop: number;
  fixedHeaderBottom: number;
  studentTabBarRect: Pick<DOMRect, "top" | "bottom"> | null;
}): number {
  const contentTop = Math.max(viewportTop, scrollAreaTop, fixedHeaderBottom);
  const tabBarIsSticky = studentTabBarRect !== null && studentTabBarRect.top <= contentTop + 1;
  return tabBarIsSticky ? Math.max(contentTop, studentTabBarRect.bottom) : contentTop;
}

function renderAnnotatedSegments(segments: readonly KnowledgeAnnotationSegment[], keyPrefix = "summary") {
  const rendered: React.ReactNode[] = [];
  let sourceOffset = 0;
  let segmentIndex = 0;
  let textOffset = 0;

  while (segmentIndex < segments.length) {
    const segment = segments[segmentIndex];
    const key = `${keyPrefix}-${sourceOffset}`;
    if (segment.kind === "text") {
      const text = segment.text.slice(textOffset);
      if (text) rendered.push(<span key={key}>{text}</span>);
      sourceOffset += text.length;
      segmentIndex += 1;
      textOffset = 0;
      continue;
    }

    const group: React.ReactNode[] = [renderTermTrigger(segment, key)];
    sourceOffset += segment.text.length + segment.suffix.length;
    let remaining = segment.noWrapTailLength;
    let nextIndex = segmentIndex + 1;
    let nextTextOffset = 0;

    while (remaining > 0 && nextIndex < segments.length) {
      const next = segments[nextIndex];
      if (next.kind === "text") {
        const available = next.text.slice(nextTextOffset);
        const text = available.slice(0, remaining);
        if (!text) break;
        group.push(<span key={`${keyPrefix}-${sourceOffset}`}>{text}</span>);
        sourceOffset += text.length;
        remaining -= text.length;
        nextTextOffset += text.length;
        if (nextTextOffset === next.text.length) {
          nextIndex += 1;
          nextTextOffset = 0;
        } else {
          break;
        }
      } else {
        group.push(renderTermTrigger(next, `${keyPrefix}-${sourceOffset}`));
        const termLength = next.text.length + next.suffix.length;
        sourceOffset += termLength;
        remaining -= termLength;
        nextIndex += 1;
      }
    }

    rendered.push(
      group.length === 1 ? (
        group[0]
      ) : (
        <span key={key} className="whitespace-nowrap">
          {group}
        </span>
      ),
    );
    segmentIndex = nextIndex;
    textOffset = nextTextOffset;
  }

  return rendered;
}

function renderTermTrigger(segment: Extract<KnowledgeAnnotationSegment, { kind: "term" }>, key: string) {
  return <KnowledgeTermTrigger key={key} termText={segment.text} suffix={segment.suffix} entry={segment.entry} />;
}

function KnowledgeTermTrigger({
  termText,
  suffix,
  entry,
}: {
  termText: string;
  suffix: string;
  entry: PublicKnowledgeEntry;
}) {
  const context = useContext(StudentKnowledgePopoverContext);
  if (!context) throw new Error("StudentKnowledgePopoverProvider is required");

  const key = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const pointerTypeResetTimerRef = useRef<number | null>(null);
  const pointerTypeRef = useRef<string | null>(null);
  const isOpen = context.activeKey === key;

  useEffect(
    () => () => {
      if (hoverOpenTimerRef.current !== null) window.clearTimeout(hoverOpenTimerRef.current);
      if (pointerTypeResetTimerRef.current !== null) window.clearTimeout(pointerTypeResetTimerRef.current);
    },
    [],
  );

  const getTerm = (): Omit<ActiveTerm, "reasons"> | null => {
    if (!wrapperRef.current || !buttonRef.current) return null;
    return {
      key,
      entry,
      termText,
      triggerRoot: wrapperRef.current,
      focusTarget: buttonRef.current,
    };
  };

  return (
    <span
      ref={wrapperRef}
      data-student-knowledge-trigger="true"
      data-open={isOpen ? "true" : undefined}
      className={cn(
        "group -mx-0.5 whitespace-nowrap rounded-sm px-0.5 transition-colors hover:bg-foreground/10",
        isOpen && "bg-foreground/10",
      )}
      onPointerEnter={(event) => {
        if (!isPrecisePointer(event.pointerType)) return;
        context.cancelScheduledClose();
        if (context.activeKey === key) {
          const term = getTerm();
          if (term) context.setReason(term, "triggerHover", true);
          return;
        }
        if (hoverOpenTimerRef.current !== null) window.clearTimeout(hoverOpenTimerRef.current);
        hoverOpenTimerRef.current = window.setTimeout(() => {
          const term = getTerm();
          if (term) context.setReason(term, "triggerHover", true);
        }, HOVER_OPEN_DELAY_MS);
      }}
      onPointerLeave={(event) => {
        if (!isPrecisePointer(event.pointerType)) return;
        if (hoverOpenTimerRef.current !== null) {
          window.clearTimeout(hoverOpenTimerRef.current);
          hoverOpenTimerRef.current = null;
        }
        context.scheduleReasonEnd(key, "triggerHover");
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={termText}
        aria-expanded={isOpen}
        aria-controls={isOpen ? context.popoverId : undefined}
        aria-describedby={isOpen ? context.popoverId : undefined}
        className="inline cursor-help rounded-sm p-0 align-baseline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onPointerDown={(event) => {
          pointerTypeRef.current = event.pointerType;
          if (pointerTypeResetTimerRef.current !== null) window.clearTimeout(pointerTypeResetTimerRef.current);
          pointerTypeResetTimerRef.current = window.setTimeout(() => {
            pointerTypeRef.current = null;
            pointerTypeResetTimerRef.current = null;
          }, 0);
          if (event.pointerType === "touch") {
            const term = getTerm();
            if (term) context.toggleTouch(term);
          }
        }}
        onClick={(event) => {
          const term = getTerm();
          if (term) handleKeyboardTermClick(event.detail, () => context.toggleKeyboard(term));
        }}
        onFocus={() => {
          if (pointerTypeRef.current === "touch") return;
          const term = getTerm();
          if (term) context.setReason(term, "focus", true);
        }}
        onBlur={() => {
          if (pointerTypeRef.current === "touch") return;
          const term = getTerm();
          if (term) context.setReason(term, "focus", false);
        }}
      >
        <span className="underline decoration-dotted decoration-1 underline-offset-2 decoration-muted-foreground group-hover:text-foreground group-data-[open=true]:text-foreground">
          {termText}
        </span>
        <QuestionMarkCircleIcon
          aria-hidden="true"
          className="relative -top-1 -mr-0.5 inline-block h-3 w-3 text-muted-foreground/65 group-hover:text-foreground group-data-[open=true]:text-foreground"
        />
      </button>
      {suffix ? (
        <span className="group-hover:text-foreground group-data-[open=true]:text-foreground">{suffix}</span>
      ) : null}
    </span>
  );
}

export function handleKeyboardTermClick(detail: number, toggle: () => void): void {
  if (detail === 0) toggle();
}

function isPrecisePointer(pointerType: string): boolean {
  return pointerType === "mouse" || pointerType === "pen";
}

function getMobileHeaderHeight(): number {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.height = "var(--mobile-header-height)";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}
