import type { FocusEventHandler, KeyboardEventHandler } from "react";
import { cn } from "~/lib/utils";
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

// The box matches NumberInput: same height, border, and warning background. A native select sits over it, invisible but focusable,
// so the choice keeps its keyboard and screen-reader behavior and joins the useNumberInputFlowNavigation flow.
export function TierInput({
  label,
  value,
  initialTier,
  min,
  max,
  disabled = false,
  warning = false,
  flowProps,
  onChange,
  className,
}: TierInputProps) {
  const tiers = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <span
      className={cn(
        "relative block min-h-v2-input-min w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface text-sm font-medium text-v2-fg tabular-nums focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-v2-focus",
        warning && "bg-v2-warning-subtle",
        disabled && "text-v2-fg-disabled",
        className,
      )}
    >
      <span aria-hidden="true" className="flex min-h-v2-input-min items-center justify-center px-2">
        {value === null ? "—" : <TierFace tier={value} />}
      </span>
      <select
        data-number-input-flow={flowProps["data-number-input-flow"]}
        onFocus={flowProps.onFocus as unknown as FocusEventHandler<HTMLSelectElement>}
        onKeyDown={flowProps.onKeyDown as unknown as KeyboardEventHandler<HTMLSelectElement>}
        aria-label={`${label} ${value === null ? "선택" : getTierMeaning(value)}`}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {value === null ? (
          <option value="" disabled>
            선택
          </option>
        ) : null}
        {tiers.map((tier) => (
          <option key={tier} value={tier} disabled={tier < initialTier}>
            {getTierMeaning(tier)}
          </option>
        ))}
      </select>
    </span>
  );
}
