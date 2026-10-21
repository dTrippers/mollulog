import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type ToggleChipProps = {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
};

// Filter chip. A selected chip is filled with the selected tokens, so state never depends on color alone.
export function ToggleChip({ pressed, onPressedChange, disabled = false, ariaLabel, className, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex min-h-7 cursor-pointer items-center rounded-md px-2 text-xs font-normal whitespace-nowrap active:opacity-80",
        pressed ? "bg-v2-selected text-v2-on-selected" : "bg-v2-inset text-v2-fg-secondary hover:bg-v2-filled-hover",
        disabled && "cursor-not-allowed text-v2-fg-disabled hover:bg-v2-inset",
        v2FocusRing,
        className,
      )}
    >
      {children}
    </button>
  );
}
