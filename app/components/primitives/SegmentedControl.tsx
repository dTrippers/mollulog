import { useId } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  to?: string;
  onSelect?: () => void;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  value: T;
  options: SegmentedControlOption<T>[];
  className?: string;
  onChange?: (value: T) => void;
};

export default function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  className,
  onChange,
}: SegmentedControlProps<T>) {
  const name = useId();

  return (
    <fieldset className={className}>
      <legend className="sr-only">{ariaLabel}</legend>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => {
          const active = value === option.value;
          const controlClassName = cn(
            "relative flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md px-2 py-2 text-center text-sm font-medium transition-colors",
            active
              ? "bg-card text-foreground shadow-sm shadow-black/5 dark:bg-background dark:shadow-none"
              : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
            option.disabled && "pointer-events-none opacity-50",
          );

          if (option.to) {
            return (
              <Link
                key={option.value}
                to={option.to}
                aria-current={active ? "page" : undefined}
                aria-disabled={option.disabled || undefined}
                tabIndex={option.disabled ? -1 : undefined}
                className={cn(controlClassName, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30")}
              >
                <span className="min-w-0">{option.label}</span>
              </Link>
            );
          }

          if (option.onSelect) {
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                className={cn(controlClassName, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30")}
                aria-current={active ? "page" : undefined}
                onClick={option.onSelect}
              >
                <span className="min-w-0">{option.label}</span>
              </button>
            );
          }

          return (
            <label
              key={option.value}
              className={cn(
                controlClassName,
                "has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-ring/30",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                disabled={option.disabled || !onChange}
                className="sr-only"
                onChange={() => onChange?.(option.value)}
              />
              <span className="min-w-0">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
