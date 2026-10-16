import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type SwitchProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

// Switch row. The track has a text label next to it, so the state is readable without its color.
export function Switch({ id, checked, onCheckedChange, label, description, disabled = false }: SwitchProps) {
  const descriptionId = `${id}-description`;
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
          "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-v2-base ease-v2-standard",
          checked ? "bg-v2-fg" : "bg-v2-switch-off",
          "disabled:cursor-not-allowed disabled:opacity-50",
          v2FocusRing,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-v2-surface transition-[left] duration-v2-base ease-v2-standard",
            checked ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
