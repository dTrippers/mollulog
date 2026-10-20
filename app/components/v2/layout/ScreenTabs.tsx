import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { useScreenNavigationFocus } from "./screen-navigation-focus";
import { ScreenNavigationItemRenderer } from "./screen-navigation-item";
import type { ScreenTabItem } from "./screen-navigation-item";

export type { ScreenTabItem } from "./screen-navigation-item";

export type ScreenTabsProps = { items: ScreenTabItem[] };

// x is the tab box's offset from the list's inner edge, width is the box's width. The bar is inset by the tab's px-3 (0.75rem) on both sides, so it spans the text and icon area.
type IndicatorState = { visible: boolean; x: number; width: number };

export function ScreenTabs({ items }: ScreenTabsProps) {
  const focus = useScreenNavigationFocus();
  const listRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<IndicatorState>({ visible: false, x: 0, width: 0 });
  // The bar lands on its first measured position with no transition, so the first paint never slides in. The transition
  // class is added on the frame after that, so only later moves animate.
  const [animateIndicator, setAnimateIndicator] = useState(false);
  useEffect(() => {
    if (!indicator.visible || animateIndicator) {
      return;
    }
    const frame = requestAnimationFrame(() => setAnimateIndicator(true));
    return () => cancelAnimationFrame(frame);
  }, [indicator.visible, animateIndicator]);
  const activeKey = items.find((item) => item.active)?.key ?? null;

  // Keep the active tab in view in the horizontal scroll area. Re-runs when the active tab changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect reads the DOM, so the active key is the trigger
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !active) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const activeLeft = activeRect.left - listRect.left + list.scrollLeft;
    const target = activeLeft - (list.clientWidth - activeRect.width) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: "auto" });
  }, [activeKey]);

  // Measure the active tab's own box. The indicator's transform is never read, so an in-flight move cannot skew the
  // result, and the width is set directly rather than scaled. Re-measured on resize and once web fonts have loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect reads the DOM, so the items and active key are the trigger
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) {
      return;
    }
    const measure = () => {
      const active = inner.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) {
        setIndicator((current) => (current.visible ? { ...current, visible: false } : current));
        return;
      }
      const innerLeft = inner.getBoundingClientRect().left;
      const activeRect = active.getBoundingClientRect();
      const next = { visible: true, x: activeRect.left - innerLeft, width: activeRect.width };
      setIndicator((current) =>
        current.visible && current.x === next.x && current.width === next.width ? current : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(inner);
    // Web fonts can change tab widths after the first measurement without resizing the list.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) {
        measure();
      }
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [activeKey, items]);

  return (
    <nav
      ref={focus ? (element) => focus.registerNavigation("horizontal", element) : undefined}
      aria-label="화면 탐색"
      className="v2-tabs min-w-0"
      data-indicator-ready={indicator.visible ? "true" : undefined}
      onBlurCapture={focus?.onNavigationBlur}
      onFocusCapture={focus ? (event) => focus.onNavigationFocus("horizontal", event) : undefined}
    >
      <div ref={listRef} className="no-scrollbar overflow-x-auto">
        <div ref={innerRef} className="v2-tabs-list relative flex w-max items-center gap-1">
          {items.map((item) => (
            <ScreenNavigationItemRenderer
              key={item.key}
              item={item}
              orientation="horizontal"
              responsiveNavigation={focus !== null}
            />
          ))}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 bg-v2-fg",
              animateIndicator && "motion-safe:transition-transform duration-v2-base ease-v2-standard",
            )}
            style={{
              opacity: indicator.visible ? 1 : 0,
              width: `calc(${indicator.width}px - 1.5rem)`,
              transform: `translateX(calc(${indicator.x}px + 0.75rem))`,
            }}
          />
        </div>
      </div>
    </nav>
  );
}
