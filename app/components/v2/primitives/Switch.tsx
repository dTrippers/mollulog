import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type SwitchProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  size?: "sm";
  layout?: "inline";
};

// Switch row. The track has a text label next to it, so the state is readable without its color.
export function Switch({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size,
  layout,
}: SwitchProps) {
  const descriptionId = `${id}-description`;
  if (layout === "inline") {
    return (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "group inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-2 rounded-md text-left max-lg:min-h-11",
          "disabled:cursor-not-allowed disabled:opacity-50",
          v2FocusRing,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-flex h-5 w-8 shrink-0 items-center rounded-full transition-colors duration-v2-base ease-v2-standard",
            checked ? "bg-v2-fg" : "bg-v2-switch-off",
          )}
        >
          <span
            className={cn(
              "absolute size-4 rounded-full bg-v2-surface transition-[left] duration-v2-base ease-v2-standard",
              checked ? "left-[0.875rem]" : "left-0.5",
            )}
          />
        </span>
        <span id={`${id}-label`} className="text-[0.8125rem] font-medium text-v2-fg-secondary group-hover:text-v2-fg">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="sr-only">
            {description}
          </span>
        ) : null}
      </button>
    );
  }
  return (
    <div className="flex min-h-v2-row-min items-center justify-between gap-3">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm text-v2-fg">
          {label}
        </p>
        {description ? (
          <p id={descriptionId} className="text-xs text-v2-fg-tertiary">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          cn(
            "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-v2-base ease-v2-standard",
            size === "sm" ? "h-5 w-8 p-0" : "h-6 w-10 p-0.5",
          ),
          checked ? "bg-v2-fg" : "bg-v2-switch-off",
          "disabled:cursor-not-allowed disabled:opacity-50",
          v2FocusRing,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute rounded-full bg-v2-surface transition-[left] duration-v2-base ease-v2-standard",
            size === "sm" ? "top-0.5 size-4" : "top-0.5 size-5",
            checked ? (size === "sm" ? "left-[0.875rem]" : "left-[1.125rem]") : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
