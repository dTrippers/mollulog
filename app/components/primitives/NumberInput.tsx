import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import Field from "./Field";

type NumberInputBaseProps = {
  label?: string;
  maxValue?: number;
  minValue?: number;
  compact?: boolean;
  size?: "sm" | "md";
  showMin?: boolean;
  showMax?: boolean;
  showDecrease?: boolean;
  showIncrease?: boolean;
};

type NonNullableProps = NumberInputBaseProps & {
  nullable?: false;
  defaultValue?: number;
  value?: number;
  onChange: (value: number) => void;
};

type NullableProps = NumberInputBaseProps & {
  nullable: true;
  defaultValue?: number | null;
  value?: number | null;
  onChange: (value: number | null) => void;
};

type NumberInputProps = NonNullableProps | NullableProps;

export function normalizeNumberInputText(inputValue: string, allowNegative: boolean): string {
  const negative = allowNegative && inputValue.trimStart().startsWith("-");
  const digitsOnly = inputValue.replace(/[^0-9]/g, "");
  const cleanValue = digitsOnly.replace(/^0+(?=\d)/, "") || "0";

  if (negative && cleanValue !== "0") {
    return `-${cleanValue}`;
  }

  return cleanValue;
}

export default function NumberInput({
  label,
  defaultValue,
  value,
  maxValue,
  minValue,
  compact,
  size = compact ? "sm" : "md",
  showMin,
  showMax,
  showDecrease = true,
  showIncrease = true,
  onChange,
  ...rest
}: NumberInputProps) {
  const nullable = "nullable" in rest && rest.nullable === true;
  const effectiveMin = minValue ?? (nullable ? undefined : 0);
  const allowNegative = effectiveMin !== undefined && effectiveMin < 0;

  const [internalValue, setInternalValue] = useState<number | null>(defaultValue ?? value ?? (nullable ? null : 0));

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value ?? null);
    }
  }, [value]);

  const commitValue = (nextValue: number | null) => {
    setInternalValue(nextValue);
    (onChange as (v: number | null) => void)(nextValue);
  };

  const clampValue = (nextValue: number) => {
    let clampedValue = nextValue;
    if (effectiveMin !== undefined && clampedValue < effectiveMin) clampedValue = effectiveMin;
    if (maxValue !== undefined && clampedValue > maxValue) clampedValue = maxValue;
    return clampedValue;
  };

  const buttonClass = cn(
    "self-stretch whitespace-nowrap px-3 text-base font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40",
    size === "sm" ? "min-h-9" : "min-h-10",
  );
  const shortcutButtonClass = cn(buttonClass, "border-l border-border px-2.5 text-xs font-medium");

  return (
    <Field
      label={label}
      containerClassName="space-y-1"
      labelClassName="mb-1 my-0 text-sm text-neutral-700 dark:text-neutral-200 font-medium"
    >
      <div
        className={cn(
          "flex w-full max-w-96 items-center overflow-hidden rounded-md border border-input bg-background text-foreground transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
          size === "sm" ? "min-h-9" : "min-h-10",
        )}
      >
        {showMin && effectiveMin !== undefined && (
          <button
            type="button"
            onClick={() => {
              commitValue(effectiveMin);
            }}
            className={cn(shortcutButtonClass, "border-l-0 border-r")}
            disabled={internalValue === effectiveMin}
            aria-label="최소값으로 설정"
          >
            최소
          </button>
        )}
        {showDecrease && (
          <button
            type="button"
            onClick={() => {
              const base = internalValue ?? (effectiveMin ?? 0);
              commitValue(clampValue(base - 1));
            }}
            className={buttonClass}
            disabled={
              internalValue != null && effectiveMin !== undefined
                ? internalValue <= effectiveMin
                : internalValue != null && internalValue <= 0
            }
            aria-label="감소"
          >
            -
          </button>
        )}
        <input
          type="text"
          inputMode={allowNegative ? "decimal" : "numeric"}
          pattern={allowNegative ? "-?[0-9]*" : "[0-9]*"}
          value={internalValue ?? ""}
          placeholder={nullable ? "" : undefined}
          onChange={(e) => {
            const inputValue = e.target.value;

            if (nullable && inputValue === "") {
              commitValue(null);
              return;
            }

            const cleanValue = normalizeNumberInputText(inputValue, allowNegative);

            commitValue(clampValue(Number(cleanValue)));
          }}
          className={cn(
            "w-full shrink appearance-none bg-transparent px-3 text-center text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            size === "sm" ? "py-1.5" : "py-2",
          )}
        />
        {showIncrease && (
          <button
            type="button"
            onClick={() => {
              const base = internalValue ?? (effectiveMin ?? 0);
              commitValue(clampValue(base + 1));
            }}
            className={buttonClass}
            disabled={maxValue !== undefined && internalValue != null && internalValue >= maxValue}
            aria-label="증가"
          >
            +
          </button>
        )}
        {showMax && maxValue !== undefined && (
          <button
            type="button"
            onClick={() => {
              commitValue(maxValue);
            }}
            className={shortcutButtonClass}
            disabled={internalValue === maxValue}
            aria-label="최대값으로 설정"
          >
            최대
          </button>
        )}
      </div>
    </Field>
  );
}
