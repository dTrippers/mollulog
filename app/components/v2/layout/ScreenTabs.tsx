import { type ElementType, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps, runV2StateTransition } from "./screen-transition";
import { v2FocusRing } from "./styles";

export type ScreenTabItem = {
  key: string;
  text: string;
  label?: string;
  Icon: ElementType;
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  // Link mode: navigates with `aria-current`. Onclick mode: state only, with `aria-pressed`.
  link?: string;
  linkState?: unknown;
  onClick?: () => void;
  hiddenStacked?: boolean;
};

export type ScreenTabsProps = { items: ScreenTabItem[] };

// x is the tab box's offset from the list's inner edge, width is the box's width. The bar is inset by the tab's px-3 (0.75rem) on both sides, so it spans the text and icon area.
type IndicatorState = { visible: boolean; x: number; width: number };

export function ScreenTabs({ items }: ScreenTabsProps) {
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
      aria-label="화면 탐색"
      className="v2-tabs min-w-0"
      data-indicator-ready={indicator.visible ? "true" : undefined}
    >
      <div ref={listRef} className="no-scrollbar overflow-x-auto">
        <div ref={innerRef} className="v2-tabs-list relative flex w-max items-center gap-1">
          {items.map((item) => (
            <TabItem key={item.key} item={item} />
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

function TabItem({ item }: { item: ScreenTabItem }) {
  const { Icon } = item;
  const className = cn(
    "relative flex min-h-v2-row-min shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap hover:bg-v2-hover",
    item.active ? "v2-tab-active font-semibold text-v2-fg" : "font-medium text-v2-fg-secondary",
    item.hiddenStacked && "v2-hidden-stacked",
    item.disabled && "text-v2-fg-disabled hover:bg-transparent",
    v2FocusRing,
  );
  const content = (
    <>
      <Icon className={cn("size-4 shrink-0", item.active ? "text-v2-fg" : "text-v2-fg-tertiary")} aria-hidden="true" />
      <span>{item.text}</span>
      {item.label ? <span className="text-xs tabular-nums text-v2-fg-tertiary">{item.label}</span> : null}
      {item.disabled && item.disabledReason ? <span className="sr-only">{item.disabledReason}</span> : null}
    </>
  );

  if (item.disabled) {
    return (
      <button type="button" disabled title={item.disabledReason} className={className}>
        {content}
      </button>
    );
  }

  if (item.link) {
    return (
      <Link
        to={item.link}
        state={item.linkState}
        aria-current={item.active ? "page" : undefined}
        data-active={item.active ? "true" : undefined}
        className={className}
        {...getV2LinkTransitionProps("crossfade")}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={item.active ?? false}
      data-active={item.active ? "true" : undefined}
      disabled={!item.onClick}
      onClick={() => {
        if (item.onClick) {
          runV2StateTransition("crossfade", item.onClick);
        }
      }}
      className={className}
    >
      {content}
    </button>
  );
}
