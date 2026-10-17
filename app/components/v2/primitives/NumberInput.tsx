import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type NumberInputProps = InputHTMLAttributes<HTMLInputElement> & {
  // A value that needs confirmation. The warning tone is the background only, and the text keeps the default color.
  warning?: boolean;
  compact?: boolean;
};

// Height follows the input token: 2rem on desktop, 2.25rem on mobile and coarse pointers.
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { warning = false, compact = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      className={cn(
        "block w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface px-2 text-center text-sm font-medium text-v2-fg tabular-nums disabled:text-v2-fg-disabled",
        compact ? "min-h-7" : "min-h-v2-input-min",
        warning && "bg-v2-warning-subtle",
        v2FocusRing,
        className,
      )}
      {...props}
    />
  );
});
