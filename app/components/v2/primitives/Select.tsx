import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type SelectOption<T extends string> = { value: T; label: string };

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
        className={cn("min-h-v2-control-min min-w-28 appearance-none rounded-md bg-v2-inset py-2 pr-8 pl-3 text-sm text-v2-fg hover:bg-v2-filled-hover active:bg-v2-filled-hover", v2FocusRing)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-v2-fg-tertiary" aria-hidden="true" />
    </span>
  );
}
