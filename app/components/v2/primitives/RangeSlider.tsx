import { type CSSProperties, type InputHTMLAttributes, useId } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type RangeSliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  label: string;
  value: number;
  min: number;
  max: number;
  valuePrefix?: string;
  valueSuffix?: string;
  accessibleLabel?: string;
  showValue?: boolean;
  layout?: "inline" | "stacked";
  valueClassName?: string;
  disabledAppearance?: "all" | "track";
  onChange: (value: number) => void;
};

// Compact v2 range control for growth values inside weapon and equipment cells.
export function RangeSlider({
  label,
  value,
  min,
  max,
  valuePrefix,
  valueSuffix,
  accessibleLabel,
  showValue = true,
  layout = "inline",
  valueClassName,
  disabledAppearance = "all",
  onChange,
  className,
  disabled,
  ...props
}: RangeSliderProps) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const safeMax = Math.max(min, max);
  const safeValue = Math.min(Math.max(value, min), safeMax);
  const progress = safeMax === min ? 0 : ((safeValue - min) / (safeMax - min)) * 100;

  const rangeInput = (
    <input
      {...props}
      id={inputId}
      type="range"
      aria-label={`${accessibleLabel ?? label} ${valuePrefix ?? ""}${safeValue}${valueSuffix ?? ""}`}
      min={min}
      max={safeMax}
      value={safeValue}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      style={{ "--v2-range-progress": `${progress}%`, ...props.style } as CSSProperties}
      className={cn(
        "v2-range-slider block h-6 min-w-0 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed",
        disabled && disabledAppearance === "track" && "disabled:opacity-50",
        v2FocusRing,
        className,
      )}
    />
  );
  const valueLabel = showValue ? (
    <span className={cn("shrink-0 text-right text-sm font-semibold text-v2-fg tabular-nums", valueClassName)}>
      {valuePrefix}
      {safeValue}
      {valueSuffix}
    </span>
  ) : null;

  if (layout === "stacked") {
    return (
      <label
        htmlFor={inputId}
        className={cn("flex min-w-0 flex-col gap-1", disabled && disabledAppearance === "all" && "opacity-50")}
      >
        <span className="flex min-w-0 items-center justify-between gap-2 text-xs text-v2-fg-tertiary">
          <span className="min-w-0 truncate">{label}</span>
          {valueLabel}
        </span>
        {rangeInput}
      </label>
    );
  }

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 text-xs",
        disabled && disabledAppearance === "all" && "opacity-50",
      )}
    >
      <span className="min-w-0 truncate text-xs text-v2-fg-tertiary">{label}</span>
      {rangeInput}
      {valueLabel}
    </label>
  );
}
