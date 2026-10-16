import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type ToggleChipProps = {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
};

// Filter chip. A selected chip is filled with the selected tokens, so state never depends on color alone.
export function ToggleChip({ pressed, onPressedChange, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex min-h-7 cursor-pointer items-center rounded-full px-2.5 text-xs font-normal whitespace-nowrap",
        pressed ? "bg-v2-selected text-v2-on-selected" : "bg-v2-inset text-v2-fg-secondary hover:bg-v2-hover",
        v2FocusRing,
      )}
    >
      {children}
    </button>
  );
}
