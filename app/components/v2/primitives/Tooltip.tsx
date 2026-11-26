import {
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";
import { getTooltipPosition, type TooltipPlacement, type TooltipPosition } from "./tooltip-position";

// Layout effects run before the browser paints. Server render has no layout, so it uses useEffect.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function isHoverPointer(pointerType: string | null): boolean {
  return pointerType === "mouse" || pointerType === "pen";
}

// The tooltip's bubble: a short text on the scrim with an arrow at its trigger. It renders in a portal on the body, so a
// block with `overflow-hidden` does not clip it, and follows the trigger on resize and scroll.
export function TooltipBubble({
  open,
  anchorRef,
  id,
  prefer = "above",
  hiddenFromAssistiveTech = false,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  id?: string;
  prefer?: TooltipPlacement;
  // For a tooltip whose text the trigger already reads through its own description.
  hiddenFromAssistiveTech?: boolean;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const tooltipNode = tooltipRef.current;
      if (!anchor || !tooltipNode) {
        return;
      }
      const next = getTooltipPosition({
        anchor,
        tooltip: { width: tooltipNode.offsetWidth, height: tooltipNode.offsetHeight },
        viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
        prefer,
      });
      setPosition((prev) =>
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.placement === next.placement &&
        prev.arrowLeft === next.arrowLeft
          ? prev
          : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, prefer]);

  if (!open || typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div
      ref={tooltipRef}
      id={id}
      role={hiddenFromAssistiveTech ? undefined : "tooltip"}
      aria-hidden={hiddenFromAssistiveTech ? true : undefined}
      data-placement={position?.placement ?? prefer}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
      className={cn(
        "pointer-events-none fixed z-layer-navigation w-max max-w-[calc(100vw-1rem)] rounded-md bg-v2-scrim px-2 py-1 text-xs break-words text-v2-on-media shadow-md backdrop-blur-md",
        // The first layout pass measures the tooltip before it is placed.
        !position && "invisible",
      )}
    >
      {children}
      <span
        aria-hidden="true"
        // The arrow is 8px wide, so its left edge sits 4px before the point it marks.
        style={{ left: (position?.arrowLeft ?? 0) - 4 }}
        className={cn(
          "absolute border-4 border-transparent",
          position?.placement === "below" ? "bottom-full border-b-v2-scrim" : "top-full border-t-v2-scrim",
        )}
      />
    </div>,
    document.body,
  );
}

// A touch has to stay down this long to open the tooltip instead of pressing the button.
const HOLD_DELAY_MS = 500;
// After a hold opens it, the tooltip stays this long once the finger lifts, so it can be read.
const HOLD_LINGER_MS = 1500;

// A tooltip for a button that acts on a press, such as a toggle: a tap must press the button, so a touch opens the
// tooltip only when held. A mouse opens it on hover and keyboard focus opens it; Escape, an outside press, and losing
// focus close it. A hold does not press the button, and the long-press menu of the browser does not open.
export function useHoldTooltip<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const tooltipId = useId();

  const clearTimers = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    holdTimerRef.current = null;
    lingerTimerRef.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  const triggerProps = {
    ref: triggerRef,
    onPointerEnter: (event: PointerEvent<T>) => {
      if (isHoverPointer(event.pointerType)) setOpen(true);
    },
    onPointerLeave: (event: PointerEvent<T>) => {
      if (isHoverPointer(event.pointerType)) setOpen(false);
    },
    onPointerDown: (event: PointerEvent<T>) => {
      heldRef.current = false;
      if (isHoverPointer(event.pointerType)) return;
      clearTimers();
      holdTimerRef.current = setTimeout(() => {
        heldRef.current = true;
        setOpen(true);
      }, HOLD_DELAY_MS);
    },
    onPointerUp: () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      if (heldRef.current) {
        lingerTimerRef.current = setTimeout(() => setOpen(false), HOLD_LINGER_MS);
      }
    },
    // A scroll that starts on the button cancels the hold.
    onPointerCancel: () => {
      clearTimers();
      heldRef.current = false;
      setOpen(false);
    },
    onContextMenu: (event: MouseEvent<T>) => {
      if (holdTimerRef.current || heldRef.current) event.preventDefault();
    },
    // The release that ends a hold must not press the button.
    onClickCapture: (event: MouseEvent<T>) => {
      if (heldRef.current) {
        heldRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onFocus: (event: FocusEvent<T>) => {
      if (event.currentTarget.matches(":focus-visible")) setOpen(true);
    },
    onBlur: () => {
      clearTimers();
      setOpen(false);
    },
  };

  // A hold must not select the button's text or open the iOS callout.
  const triggerClassName = "select-none [-webkit-touch-callout:none]";

  return { open, triggerRef, triggerProps, triggerClassName, tooltipId };
}
