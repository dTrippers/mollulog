import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";
import { getTooltipPosition, type TooltipPosition } from "./tooltip-position";

export type TooltipButtonProps = {
  // The button's accessible name.
  label: string;
  // The short text the tooltip shows, such as an item's name.
  tooltip: string;
  className?: string;
  children: ReactNode;
};

// Layout effects run before the browser paints. Server render has no layout, so it uses useEffect.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function isHoverPointer(pointerType: string | null): boolean {
  return pointerType === "mouse" || pointerType === "pen";
}

// A button that shows a short text in a tooltip, for an image whose name is not written beside it. A mouse opens the
// tooltip on hover, a touch toggles it on tap, and the keyboard opens it on focus and toggles it with Enter or Space.
// Escape, an outside press, and losing focus close it. The tooltip renders in a portal on the body, so a block with
// `overflow-hidden` does not clip it, and follows the button on resize and scroll.
export function TooltipButton({ label, tooltip, className, children }: TooltipButtonProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const tooltipId = useId();

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const tooltipNode = tooltipRef.current;
      if (!anchor || !tooltipNode) {
        return;
      }
      const next = getTooltipPosition({
        anchor,
        tooltip: { width: tooltipNode.offsetWidth, height: tooltipNode.offsetHeight },
        viewport: { width: document.documentElement.clientWidth },
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
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    // A press on the button itself is not outside; its click toggles the tooltip.
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

  const handleClick = (event: MouseEvent) => {
    // A keyboard click has no detail, and a tap toggles. A mouse click keeps the tooltip that hover has opened.
    if (event.detail === 0 || !isHoverPointer(lastPointerTypeRef.current)) {
      setOpen((current) => !current);
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        className={className}
        onPointerDown={(event: PointerEvent) => {
          lastPointerTypeRef.current = event.pointerType;
        }}
        onPointerEnter={(event: PointerEvent) => {
          if (isHoverPointer(event.pointerType)) {
            setOpen(true);
          }
        }}
        onPointerLeave={(event: PointerEvent) => {
          if (isHoverPointer(event.pointerType)) {
            setOpen(false);
          }
        }}
        onClick={handleClick}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            setOpen(true);
          }
        }}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              data-placement={position?.placement ?? "above"}
              style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
              className={cn(
                "pointer-events-none fixed z-layer-navigation w-max max-w-[calc(100vw-1rem)] rounded-md bg-v2-scrim px-2 py-1 text-xs break-words text-v2-on-media shadow-md",
                // The first layout pass measures the tooltip before it is placed.
                !position && "invisible",
              )}
            >
              {tooltip}
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
          )
        : null}
    </>
  );
}
