import type { CSSProperties, ReactNode } from "react";
import NumberInput from "~/components/primitives/NumberInput";

type GrowthFieldRowProps = {
  title: ReactNode;
  control: ReactNode;
};

export function GrowthFieldRow({ title, control }: GrowthFieldRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      {title}
      {control}
    </div>
  );
}

type GrowthNumberFieldProps = {
  id: string;
  title: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function getGrowthProgressPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const clampedValue = Math.min(max, Math.max(min, value));
  return ((clampedValue - min) / (max - min)) * 100;
}

export function GrowthNumberField({ id, title, value, min, max, onChange }: GrowthNumberFieldProps) {
  const labelId = `${id}-label`;
  const descriptionId = `${id}-max-description`;
  const progress = getGrowthProgressPercent(value, min, max);
  const inputStyle: CSSProperties = {
    backgroundImage: `linear-gradient(to right, var(--color-primary) ${progress}%, transparent ${progress}%), linear-gradient(to right, color-mix(in oklab, var(--color-foreground) 10%, transparent), color-mix(in oklab, var(--color-foreground) 10%, transparent))`,
    backgroundPosition: "left bottom, left bottom",
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 2px, 100% 2px",
  };

  return (
    <GrowthFieldRow
      title={
        <label id={labelId} htmlFor={id} className="min-w-0 flex-1 text-sm">
          {title}
        </label>
      }
      control={
        <div className="w-48 shrink-0">
          <NumberInput
            fullWidth
            size="sm"
            minValue={min}
            maxValue={max}
            value={value}
            showMax
            inputProps={{
              id,
              "aria-labelledby": labelId,
              "aria-describedby": descriptionId,
              className: "self-stretch",
              style: inputStyle,
            }}
            onChange={onChange}
          />
          <span id={descriptionId} className="sr-only">
            최대 {max}
          </span>
        </div>
      }
    />
  );
}
