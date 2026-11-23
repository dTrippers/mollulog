import { type ReactNode, useId } from "react";
import { cn } from "~/lib/utils";

export type SegmentedControlOption<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

// A small set of mutually exclusive choices on one inset track, such as 총력전 / 대결전.
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn("inline-flex min-w-0 gap-0.5 rounded-md border-0 bg-v2-inset p-0.5", className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative inline-flex min-h-7 cursor-pointer items-center justify-center gap-1.5 rounded px-2.5 text-sm font-medium whitespace-nowrap has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-v2-focus",
              selected ? "bg-v2-surface font-semibold text-v2-fg shadow-sm" : "text-v2-fg-secondary hover:text-v2-fg v2-interaction-transition",
              option.disabled && "cursor-not-allowed text-v2-fg-disabled hover:text-v2-fg-disabled v2-interaction-transition",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
