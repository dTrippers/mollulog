import { type MouseEvent, type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { isHoverPointer, TooltipBubble } from "./Tooltip";

export type TooltipButtonProps = {
  // The button's accessible name.
  label: string;
  // The short text the tooltip shows, such as an item's name.
  tooltip: string;
  className?: string;
  children: ReactNode;
};

// A button that shows a short text in a tooltip, for an image whose name is not written beside it. A mouse opens the
// tooltip on hover, a touch toggles it on tap, and the keyboard opens it on focus and toggles it with Enter or Space.
// Escape, an outside press, and losing focus close it. The tooltip is a `TooltipBubble`.
export function TooltipButton({ label, tooltip, className, children }: TooltipButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const tooltipId = useId();

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
      <TooltipBubble open={open} anchorRef={triggerRef} id={tooltipId}>
        {tooltip}
      </TooltipBubble>
    </>
  );
}
