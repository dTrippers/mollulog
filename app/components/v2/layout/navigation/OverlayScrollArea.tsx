import type { PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

type OverlayScrollbarMetrics = {
  trackHeight: number;
  thumbHeight: number;
  thumbTop: number;
};

type OverlayScrollbarGeometryInput = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  trackHeight: number;
  minThumbHeight?: number;
};

export function getOverlayScrollbarMetrics({
  clientHeight,
  scrollHeight,
  scrollTop,
  trackHeight,
  minThumbHeight = 24,
}: OverlayScrollbarGeometryInput): OverlayScrollbarMetrics | null {
  if (clientHeight <= 0 || scrollHeight <= clientHeight || trackHeight <= 0) {
    return null;
  }

  const thumbHeight = Math.min(trackHeight, Math.max(minThumbHeight, (clientHeight / scrollHeight) * trackHeight));
  const maxScrollTop = scrollHeight - clientHeight;
  const maxThumbTop = trackHeight - thumbHeight;
  const scrollProgress = Math.min(1, Math.max(0, scrollTop / maxScrollTop));

  return {
    trackHeight,
    thumbHeight,
    thumbTop: scrollProgress * maxThumbTop,
  };
}

type OverlayScrollAreaProps = {
  "aria-label": string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

type ActiveDrag = {
  pointerId: number;
  startY: number;
  startScrollTop: number;
};

export function OverlayScrollArea({
  "aria-label": ariaLabel,
  children,
  className,
  contentClassName,
}: OverlayScrollAreaProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const [metrics, setMetrics] = useState<OverlayScrollbarMetrics | null>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const scheduleMetricsUpdate = useCallback(() => {
    if (typeof window === "undefined" || frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        setMetrics(null);
        return;
      }

      setMetrics(
        getOverlayScrollbarMetrics({
          clientHeight: scrollElement.clientHeight,
          scrollHeight: scrollElement.scrollHeight,
          scrollTop: scrollElement.scrollTop,
          trackHeight: Math.max(0, scrollElement.clientHeight - 16),
        }),
      );
    });
  }, []);

  const keepScrollbarVisible = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    setIsScrolling(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setIsScrolling(false);
    }, 800);
  }, []);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollElement || !contentElement) {
      return;
    }

    const onScroll = () => {
      scheduleMetricsUpdate();
      keepScrollbarVisible();
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMetricsUpdate);
    observer?.observe(scrollElement);
    observer?.observe(contentElement);
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleMetricsUpdate);
    scheduleMetricsUpdate();

    return () => {
      observer?.disconnect();
      scrollElement.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleMetricsUpdate);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [keepScrollbarVisible, scheduleMetricsUpdate]);

  const onThumbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || !metrics) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scrollElement.scrollTop,
    };
    keepScrollbarVisible();
  };

  const onThumbPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scrollElement = scrollRef.current;
    const thumbElement = thumbRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !scrollElement || !metrics || !thumbElement) {
      return;
    }

    const thumbTravel = metrics.trackHeight - thumbElement.clientHeight;
    const scrollTravel = scrollElement.scrollHeight - scrollElement.clientHeight;
    if (thumbTravel <= 0 || scrollTravel <= 0) {
      return;
    }

    scrollElement.scrollTop = drag.startScrollTop + ((event.clientY - drag.startY) / thumbTravel) * scrollTravel;
  };

  const onThumbPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const visible = Boolean(metrics && (isPointerInside || isScrolling));

  return (
    <div
      className={cn("relative min-h-0", className)}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") {
          setIsPointerInside(true);
        }
      }}
      onPointerLeave={() => setIsPointerInside(false)}
    >
      <nav
        ref={scrollRef}
        aria-label={ariaLabel}
        className={cn("no-scrollbar h-full min-h-0 overflow-y-auto", contentClassName)}
      >
        <div ref={contentRef}>{children}</div>
      </nav>
      {metrics ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-2 right-2 z-10 w-1">
          <div
            ref={thumbRef}
            className={cn(
              "pointer-events-auto absolute inset-x-0 touch-none rounded-full bg-v2-fg-tertiary transition-opacity duration-v2-fast ease-v2-standard motion-reduce:transition-none",
              visible ? "cursor-grab opacity-100 active:cursor-grabbing" : "pointer-events-none opacity-0",
            )}
            style={{ height: metrics.thumbHeight, top: metrics.thumbTop }}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerEnd}
            onPointerCancel={onThumbPointerEnd}
            onLostPointerCapture={onThumbPointerEnd}
          />
        </div>
      ) : null}
    </div>
  );
}
