import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import Field from "./Field";

type NumberInputBaseProps = {
  label?: string;
  maxValue?: number;
  minValue?: number;
  size?: "sm" | "md" | "lg";
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

export function clampNumberInputValue(nextValue: number, minValue?: number, maxValue?: number): number {
  let clampedValue = nextValue;
  if (minValue !== undefined && clampedValue < minValue) clampedValue = minValue;
  if (maxValue !== undefined && clampedValue > maxValue) clampedValue = maxValue;
  return clampedValue;
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
  const initialValue = defaultValue ?? value ?? (nullable ? null : 0);

  const [internalValue, setInternalValue] = useState<number | null>(initialValue);
  const [inputText, setInputText] = useState(initialValue == null ? "" : String(initialValue));

  useEffect(() => {
    if (value !== undefined) {
      const nextValue = value ?? null;
      setInternalValue(nextValue);
      setInputText(nextValue == null ? "" : String(nextValue));
    }
  }, [value]);

  const commitValue = (nextValue: number | null) => {
    setInternalValue(nextValue);
    setInputText(nextValue == null ? "" : String(nextValue));
    (onChange as (v: number | null) => void)(nextValue);
  };

  const clampValue = (nextValue: number) => {
    return clampNumberInputValue(nextValue, effectiveMin, maxValue);
  };

  const buttonBaseClass =
    "self-stretch shrink-0 whitespace-nowrap transition-[background-color,border-color,color,opacity,filter] duration-150 ease-out active:brightness-95 disabled:pointer-events-none disabled:opacity-40";
  const buttonClass = cn(
    buttonBaseClass,
    size === "sm" &&
      "px-1 py-0.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
    size === "md" && "min-h-10 px-3 text-base font-semibold text-muted-foreground hover:bg-muted",
    size === "lg" && "min-h-10 px-3 text-base font-semibold text-muted-foreground hover:bg-muted md:min-h-11 md:px-4",
  );
  const shortcutButtonClass = (variant: "default" | "active") =>
    cn(
      buttonBaseClass,
      size === "sm" && "border-l border-neutral-200 px-1 py-0.5 text-[10px] dark:border-neutral-700",
      size === "md" && "min-h-10 border-l border-border px-2.5 text-xs font-medium",
      size === "lg" && "min-h-10 border-l border-border px-2.5 text-xs font-semibold",
      variant === "active"
        ? "border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
        : size === "sm"
          ? "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          : "text-muted-foreground hover:bg-muted",
    );

  return (
    <Field
      label={label}
      containerClassName={size === "sm" ? "space-y-1" : size === "lg" ? "space-y-1.5" : undefined}
      labelClassName={
        size === "sm" || size === "lg" ? "text-sm font-medium text-neutral-700 dark:text-neutral-200" : undefined
      }
    >
      <div
        className={cn(
          "flex w-full max-w-96 items-center overflow-hidden rounded-md border transition-colors",
          size === "sm" && "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900",
          size === "md" &&
            "max-w-96 min-h-10 border-input bg-background text-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
          size === "lg" &&
            "min-h-10 border-input bg-background text-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 md:min-h-11",
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
              const base = internalValue ?? effectiveMin ?? 0;
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
          value={inputText}
          placeholder={nullable ? "" : undefined}
          onChange={(e) => {
            const nextText = e.target.value;

            if (nextText === "") {
              setInputText("");
              if (nullable) {
                commitValue(null);
              }
              return;
            }

            const cleanValue = normalizeNumberInputText(nextText, allowNegative);
            commitValue(clampValue(Number(cleanValue)));
          }}
          onBlur={(e) => {
            if (!nullable && e.currentTarget.value === "") {
              commitValue(clampValue(effectiveMin ?? 0));
            }
          }}
          className={cn(
            "w-full min-w-0 shrink appearance-none bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            size === "sm" && "py-0.5 text-sm text-neutral-900 dark:text-neutral-100",
            size === "md" && "px-3 py-2 text-sm text-foreground",
            size === "lg" && "px-2 py-1 text-base font-semibold text-foreground md:px-3 md:py-1.5",
          )}
        />
        {showIncrease && (
          <button
            type="button"
            onClick={() => {
              const base = internalValue ?? effectiveMin ?? 0;
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
