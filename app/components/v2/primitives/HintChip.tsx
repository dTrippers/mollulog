import { ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/16/solid";
import { type MouseEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { v2FocusRing } from "../layout/styles";
import { cn } from "~/lib/utils";
import { Popover } from "./Popover";

export type HintChipProps = {
  label: string;
  description: string;
  // `warning` shows the label with a warning icon. `info` shows only an ⓘ icon; the label is read by screen readers and
  // heads the popover.
  variant?: "warning" | "info";
  className?: string;
};

const HOVER_OPEN_DELAY_MS = 125;
const HOVER_CLOSE_DELAY_MS = 175;

function isHoverPointer(pointerType: string): boolean {
  return pointerType === "mouse" || pointerType === "pen";
}

// A warning label whose detail opens in a popover. A mouse opens it on hover and can move onto the panel, a touch toggles
// it on tap, and the keyboard opens it on focus and toggles it with Enter. A screen reader gets the detail from the button.
export function HintChip({ label, description, variant = "warning", className }: HintChipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | null>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  // Escape closes the popover and then returns focus to the trigger in the same task. That focus must not reopen it.
  const closingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const schedule = (next: boolean, delay: number) => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setOpen(next);
    }, delay);
  };
  const handlePointerEnter = (event: PointerEvent) => {
    if (isHoverPointer(event.pointerType)) {
      schedule(true, HOVER_OPEN_DELAY_MS);
    }
  };
  const handlePointerLeave = (event: PointerEvent) => {
    if (isHoverPointer(event.pointerType)) {
      schedule(false, HOVER_CLOSE_DELAY_MS);
    }
  };
  const handleClick = (event: MouseEvent) => {
    // A keyboard click has no detail. A mouse click does nothing, because hover has already opened the popover.
    if (event.detail === 0 || lastPointerTypeRef.current === "touch") {
      clearTimer();
      setOpen((current) => !current);
    }
  };

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          variant === "warning"
            ? "inline-flex cursor-help items-center gap-1 rounded-sm text-xs font-semibold whitespace-nowrap text-v2-warning"
            : "inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full text-v2-fg-tertiary hover:text-v2-fg-secondary",
          v2FocusRing,
          className,
        )}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={(event) => {
          lastPointerTypeRef.current = event.pointerType;
        }}
        onClick={handleClick}
        onFocus={(event) => {
          if (!closingRef.current && event.currentTarget.matches(":focus-visible")) {
            clearTimer();
            setOpen(true);
          }
        }}
        onBlur={() => {
          clearTimer();
          setOpen(false);
        }}
      >
        {variant === "warning" ? (
          <>
            <ExclamationTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {label}
            <span className="sr-only">: {description}</span>
          </>
        ) : (
          <>
            <InformationCircleIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">
              {label}: {description}
            </span>
          </>
        )}
      </button>
      <Popover
        open={open}
        label={label}
        onClose={() => {
          clearTimer();
          setOpen(false);
          closingRef.current = true;
          queueMicrotask(() => {
            closingRef.current = false;
          });
        }}
        returnFocusRef={triggerRef}
        onPanelPointerEnter={handlePointerEnter}
        onPanelPointerLeave={handlePointerLeave}
      >
        <p className="text-sm font-semibold text-v2-fg">{label}</p>
        <p className="mt-1 text-sm leading-relaxed text-v2-fg-secondary">{description}</p>
      </Popover>
    </>
  );
}
