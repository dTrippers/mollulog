import { StarIcon } from "@heroicons/react/16/solid";
import { type FocusEventHandler, type KeyboardEventHandler, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { Popover } from "../../primitives/Popover";
import type { NumberInputFlowNavigationInputProps } from "../../primitives/use-number-input-flow-navigation";
import { getTierMeaning, TierStarPicker } from "./TierStarPicker";

export type TierInputProps = {
  // The student's name, so the accessible name reads "<name> <tier meaning>".
  label: string;
  value: number | null;
  // Tiers below the initial tier cannot be chosen, so an applied tier never goes down.
  initialTier: number;
  min: number;
  max: number;
  disabled?: boolean;
  warning?: boolean;
  compact?: boolean;
  // An element that says more about the value, such as that it was changed.
  describedBy?: string;
  flowProps: NumberInputFlowNavigationInputProps;
  onChange: (tier: number) => void;
  // Extra classes for the box, such as a segment inside a grouped input that drops its own border.
  className?: string;
};

export { getTierMeaning };

// The visible face of a tier: a star and the number up to 5, and the exclusive weapon icon with its level after 5 (the
// GrowthTier pattern).
function TierFace({ tier }: { tier: number }) {
  if (tier <= 5) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <StarIcon className="size-3.5 shrink-0 text-v2-star" />
        <span>{tier}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <img src="/icons/exclusive_weapon.png" alt="" className="size-3.5 shrink-0" />
      <span>{tier - 5}</span>
    </span>
  );
}

// The box matches NumberInput and stays in the keyboard navigation flow. Tier choices open in a popover instead of a
// native select menu that obscures the review table.
export function TierInput({
  label,
  value,
  initialTier,
  min,
  max,
  disabled = false,
  warning = false,
  compact = false,
  describedBy,
  flowProps,
  onChange,
  className,
}: TierInputProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-number-input-flow={flowProps["data-number-input-flow"]}
        onFocus={flowProps.onFocus as FocusEventHandler<HTMLButtonElement>}
        onKeyDown={flowProps.onKeyDown as KeyboardEventHandler<HTMLButtonElement>}
        aria-label={`${label} ${value === null ? "선택" : getTierMeaning(value)}`}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "block w-full min-w-0 cursor-pointer rounded-md border border-v2-control-border bg-v2-surface text-sm font-medium text-v2-fg tabular-nums focus-visible:border-v2-control-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus disabled:cursor-not-allowed",
          compact ? "min-h-7" : "min-h-v2-input-min",
          warning && "bg-v2-warning-subtle",
          disabled && "text-v2-fg-disabled",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn("flex items-center justify-center px-2", compact ? "min-h-7" : "min-h-v2-input-min")}
        >
          {value === null ? "—" : <TierFace tier={value} />}
        </span>
      </button>
      <Popover
        open={open}
        label={`${label} 성급 선택`}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        className="w-fit p-3"
      >
        <TierStarPicker
          value={value}
          min={min}
          max={max}
          initialTier={initialTier}
          disabled={disabled}
          onPick={(tier) => {
            onChange(tier);
            setOpen(false);
            triggerRef.current?.focus({ preventScroll: true });
          }}
        />
      </Popover>
    </>
  );
}
