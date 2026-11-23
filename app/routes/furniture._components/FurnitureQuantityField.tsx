import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { cn } from "~/lib/utils";
import { getFurnitureQuantityAriaDescription } from "./furniture-state";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type ErrorBubblePosition = {
  top: number;
  left: number;
};

type FurnitureQuantityFieldProps = {
  furnitureName: string;
  draftValue: string;
  errorMessage: string | null;
  onChange: (value: string) => void;
};

export function FurnitureQuantityField({
  furnitureName,
  draftValue,
  errorMessage,
  onChange,
}: FurnitureQuantityFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<ErrorBubblePosition | null>(null);

  const showBubble = Boolean(errorMessage) && (focused || hovered);

  useIsomorphicLayoutEffect(() => {
    if (!showBubble) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = inputRef.current?.getBoundingClientRect();
      const bubble = bubbleRef.current;
      if (!anchor || !bubble) return;
      const gap = 8;
      const margin = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const roomBelow = viewportHeight - margin - (anchor.bottom + gap);
      const fitsBelow = bubble.offsetHeight <= roomBelow;
      const top = fitsBelow
        ? anchor.bottom + gap
        : Math.max(margin, anchor.top - gap - bubble.offsetHeight);
      const maxLeft = Math.max(margin, viewportWidth - margin - bubble.offsetWidth);
      const left = Math.min(Math.max(anchor.left, margin), maxLeft);
      setPosition((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showBubble, errorMessage]);

  const ariaDescription = getFurnitureQuantityAriaDescription({ draftValue, errorMessage });

  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5 self-end">
      <label htmlFor={inputId} className="text-left text-xs leading-4 text-v2-fg-tertiary">
        보유
      </label>
      <div
        className="relative w-full min-w-0"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setHovered(false);
        }}
      >
        <NumberInput
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draftValue}
          onChange={(event) => onChange(event.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={`${furnitureName} 보유 수량`}
          aria-description={ariaDescription}
          aria-invalid={errorMessage ? true : undefined}
          className={cn(errorMessage && "bg-v2-danger-subtle pr-6 pl-1.5")}
        />
        {errorMessage ? (
          <ExclamationTriangleIcon
            className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-v2-danger"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {showBubble && errorMessage && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={bubbleRef}
              role="alert"
              style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
              className={cn(
                "pointer-events-none fixed z-30 flex max-w-[calc(100vw-1rem)] items-start gap-1.5 rounded-lg bg-v2-popover-surface px-2.5 py-2 text-left text-xs leading-snug text-v2-fg shadow-v2-popover backdrop-blur-md",
                !position && "invisible",
              )}
            >
              <ExclamationTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-v2-danger" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
