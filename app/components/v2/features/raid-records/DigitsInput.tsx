import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "~/lib/utils";
import { formatDigits, parseDigits } from "./raid-record-format";

type DigitsInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  // A unit written after the number inside the field, such as 위.
  suffix?: string;
  invalid?: boolean;
  changed?: boolean;
  containerClassName?: string;
};

// A score or rank field: digits only, shown with thousands separators while typing, on the numeric keypad.
export const DigitsInput = forwardRef<HTMLInputElement, DigitsInputProps>(function DigitsInput(
  { value, onValueChange, suffix, invalid = false, changed = false, className, containerClassName, ...props },
  ref,
) {
  return (
    <span
      className={cn(
        // The ring goes around the whole field, suffix included, rather than the bare input inside it.
        "flex min-h-v2-input-min min-w-0 items-center rounded-md border border-v2-control-border bg-v2-surface focus-within:border-v2-control-border-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-v2-focus",
        changed && "border-v2-accent bg-v2-accent-subtle [&>input]:font-semibold",
        invalid && "border-v2-danger bg-v2-danger-subtle",
        containerClassName,
      )}
    >
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatDigits(value)}
        onChange={(event) => onValueChange(parseDigits(event.currentTarget.value))}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-h-v2-input-min w-full min-w-0 rounded-md bg-transparent px-2 text-right text-base font-medium text-v2-fg tabular-nums outline-none placeholder:font-normal placeholder:text-v2-fg-tertiary sm:text-sm",
          className,
        )}
        {...props}
      />
      {suffix ? <span className="shrink-0 pr-2 text-sm text-v2-fg-secondary">{suffix}</span> : null}
    </span>
  );
});
