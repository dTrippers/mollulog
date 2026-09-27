import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { cn } from "~/lib/utils";

type FlyoutPosition = { top: number; left: number };
type FlyoutViewport = { width: number; height: number };

const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

export function calculateNavigationFlyoutPosition(
  anchorRect: Pick<DOMRect, "top" | "right">,
  width: "menu" | "search",
  viewport: FlyoutViewport,
  panelHeight: number,
): FlyoutPosition {
  const viewportPadding = 12;
  const flyoutWidth = width === "search" ? 384 : 224;
  const height = Math.min(panelHeight, viewport.height - viewportPadding * 2);
  const maxLeft = Math.max(viewportPadding, viewport.width - flyoutWidth - viewportPadding);
  const maxTop = Math.max(viewportPadding, viewport.height - height - viewportPadding);
  return {
    top: Math.min(maxTop, Math.max(viewportPadding, anchorRect.top)),
    left: Math.min(maxLeft, anchorRect.right + 8),
  };
}

export function getInitialNavigationFlyoutPosition(
  anchorRect: Pick<DOMRect, "top" | "right">,
  width: "menu" | "search",
  viewport: FlyoutViewport,
): FlyoutPosition {
  return calculateNavigationFlyoutPosition(anchorRect, width, viewport, 320);
}

function getInitialFlyoutPosition(anchorEl: HTMLElement | null, width: "menu" | "search"): FlyoutPosition {
  if (!anchorEl || typeof window === "undefined") return { top: 12, left: 84 };
  return getInitialNavigationFlyoutPosition(
    anchorEl.getBoundingClientRect(),
    width,
    { width: window.innerWidth, height: window.innerHeight },
  );
}

type NavigationFlyoutProps = {
  title: string;
  anchorEl: HTMLElement | null;
  onClose: (returnFocus?: boolean) => void;
  children: React.ReactNode;
  className?: string;
  id: string;
  width?: "menu" | "search";
  autoFocusFirstLink?: boolean;
};

export function NavigationFlyout({
  title,
  anchorEl,
  onClose,
  children,
  className,
  id,
  width = "menu",
  autoFocusFirstLink = true,
}: NavigationFlyoutProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FlyoutPosition>(() => getInitialFlyoutPosition(anchorEl, width));
  const location = useLocation();
  const locationKey = `${location.pathname}\n${location.search}\n${location.hash}`;
  const previousLocationKeyRef = useRef(locationKey);

  useIsomorphicLayoutEffect(() => {
    const updatePosition = () => {
      const rect = anchorEl?.getBoundingClientRect();
      if (!rect) return;
      setPosition(
        calculateNavigationFlyoutPosition(
          rect,
          width,
          { width: window.innerWidth, height: window.innerHeight },
          panelRef.current?.offsetHeight ?? 320,
        ),
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorEl, width]);

  useEffect(() => {
    if (autoFocusFirstLink && anchorEl?.matches(":focus-visible")) {
      panelRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    }
  }, [anchorEl, autoFocusFirstLink]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchorEl?.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose(true);
    };
    const closeOnFocusOut = (event: FocusEvent) => {
      const target = event.target as Node | null;
      const related = event.relatedTarget as Node | null;
      if (!target || (!panelRef.current?.contains(target) && !anchorEl?.contains(target))) return;
      if (related && (panelRef.current?.contains(related) || anchorEl?.contains(related))) return;
      onClose();
    };

    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("focusout", closeOnFocusOut);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("focusout", closeOnFocusOut);
    };
  }, [anchorEl, onClose]);

  useEffect(() => {
    if (previousLocationKeyRef.current === locationKey) return;
    previousLocationKeyRef.current = locationKey;
    onClose();
  }, [locationKey, onClose]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href]") ?? []);
    if (links.length === 0) return;
    event.preventDefault();
    const currentIndex = links.indexOf(document.activeElement as HTMLElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0 ? (direction === 1 ? 0 : links.length - 1) : (currentIndex + direction + links.length) % links.length;
    links[nextIndex]?.focus();
  };

  return (
    <section
      id={id}
      ref={panelRef}
      className={cn(
        "fixed z-layer-navigation-menu flex flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-lg shadow-black/10 dark:shadow-md dark:shadow-black/30",
        width === "search" ? "w-96" : "w-56",
        className,
      )}
      style={{ top: position.top, left: position.left, maxHeight: "calc(100dvh - 1.5rem)" }}
      aria-labelledby={`${id}-title`}
      onKeyDown={onKeyDown}
    >
      <div id={`${id}-title`} className="shrink-0 px-3 pt-3 pb-2 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  );
}
