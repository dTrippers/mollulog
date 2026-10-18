import { StarIcon as StarIconOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { type FocusEventHandler, type KeyboardEventHandler, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { Popover } from "../../primitives/Popover";
import type { NumberInputFlowNavigationInputProps } from "../../primitives/use-number-input-flow-navigation";

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
  flowProps: NumberInputFlowNavigationInputProps;
  onChange: (tier: number) => void;
  // Extra classes for the box, such as a segment inside a grouped input that drops its own border.
  className?: string;
};

// The meaning a screen reader announces: "5성" for a star tier, "고유무기 2" for an exclusive weapon level.
export function getTierMeaning(tier: number): string {
  return tier <= 5 ? `${tier}성` : `고유무기 ${tier - 5}`;
}

// The visible face of a tier: "★n" up to 5, and the exclusive weapon icon with its level after 5 (the GrowthTier pattern).
function TierFace({ tier }: { tier: number }) {
  if (tier <= 5) return <span>★{tier}</span>;
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
        <span aria-hidden="true" className={cn("flex items-center justify-center px-2", compact ? "min-h-7" : "min-h-v2-input-min")}>
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
        <fieldset className="flex items-center" aria-label="성급 선택">
          {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((tier) => {
            const Icon = value !== null && tier <= value ? StarIconSolid : StarIconOutline;
            const selectable = tier >= initialTier;
            return (
              <button
                key={tier}
                type="button"
                aria-label={getTierMeaning(tier)}
                aria-pressed={value === tier}
                disabled={disabled || !selectable}
                onClick={() => {
                  onChange(tier);
                  setOpen(false);
                  triggerRef.current?.focus({ preventScroll: true });
                }}
                className={cn(
                  "inline-flex size-7 cursor-pointer items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus disabled:cursor-default disabled:opacity-40",
                  tier === 5 && "mr-1",
                  tier <= 5 ? "text-v2-warning" : "text-v2-perk",
                  value === null || tier > value ? "opacity-50 hover:opacity-100" : "",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </button>
            );
          })}
        </fieldset>
      </Popover>
    </>
  );
}
