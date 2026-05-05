import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import Field from "./Field";

type NumberInputBaseProps = {
  label?: string;
  maxValue?: number;
  minValue?: number;
  size?: "sm" | "md";
  showMin?: boolean;
  showMax?: boolean;
  minButtonVariant?: "default" | "active";
  maxButtonVariant?: "default" | "active";
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
  size = "sm",
  showMin,
  showMax,
  minButtonVariant = "default",
  maxButtonVariant = "default",
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

  const buttonBaseClass =
    "self-stretch whitespace-nowrap transition-[background-color,border-color,color,opacity,filter] duration-150 ease-out active:brightness-95 disabled:pointer-events-none disabled:opacity-40";
  const buttonClass = cn(
    buttonBaseClass,
    size === "sm"
      ? "px-1 py-0.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      : "min-h-10 px-3 text-base font-semibold text-muted-foreground hover:bg-muted",
  );
  const shortcutButtonClass = (variant: "default" | "active") => cn(
    buttonBaseClass,
    size === "sm"
      ? "border-l border-neutral-200 px-1 py-0.5 text-[10px] dark:border-neutral-700"
      : "min-h-10 border-l border-border px-2.5 text-xs font-medium",
    variant === "active"
      ? "border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
      : size === "sm"
        ? "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        : "text-muted-foreground hover:bg-muted",
  );

  return (
    <Field
      label={label}
      containerClassName={size === "sm" ? "space-y-1" : undefined}
      labelClassName={size === "sm" ? "mb-1 my-0 text-sm text-neutral-700 dark:text-neutral-200 font-medium" : undefined}
    >
      <div
        className={cn(
          "flex w-full items-center overflow-hidden rounded-md border transition-colors",
          size === "sm"
            ? "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
            : "max-w-96 min-h-10 border-input bg-background text-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
        )}
      >
        {showMin && effectiveMin !== undefined && (
          <button
            type="button"
            onClick={() => {
              commitValue(effectiveMin);
            }}
            className={cn(shortcutButtonClass(minButtonVariant), "border-l-0 border-r")}
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
            "w-full shrink appearance-none bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            size === "sm"
              ? "py-0.5 text-neutral-900 dark:text-neutral-100"
              : "px-3 py-2 text-foreground",
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
            className={shortcutButtonClass(maxButtonVariant)}
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
