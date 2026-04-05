import { useEffect, useState } from "react";
import Field from "./Field";

type NumberInputBaseProps = {
  label?: string;
  maxValue?: number;
  minValue?: number;
  compact?: boolean;
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

export default function NumberInput({ label, defaultValue, value, maxValue, minValue, compact, showMax, showDecrease = true, showIncrease = true, onChange, ...rest }: NumberInputProps) {
  const nullable = "nullable" in rest && rest.nullable === true;
  const effectiveMin = minValue ?? (nullable ? undefined : 0);

  const [internalValue, setInternalValue] = useState<number | null>(defaultValue ?? value ?? (nullable ? null : 0));

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value ?? null);
    }
  }, [value]);

  const buttonClass = `px-1 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 ${compact ? "py-0.5" : "py-1"} text-nowrap`;

  return (
    <Field
      label={label}
      containerClassName="space-y-1"
      labelClassName="mb-1 my-0 text-sm text-neutral-700 dark:text-neutral-200 font-medium"
    >
      <div className="w-full flex items-center rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900">
        {showDecrease && (
          <button
            type="button"
            onClick={() => {
              const base = internalValue ?? (effectiveMin ?? 0);
              const newValue = base - 1;
              setInternalValue(newValue);
              (onChange as (v: number | null) => void)(newValue);
            }}
            className={buttonClass}
            disabled={internalValue != null && effectiveMin !== undefined ? internalValue <= effectiveMin : internalValue != null && internalValue <= 0}
            aria-label="감소"
          >
            -
          </button>
        )}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={internalValue ?? ""}
          placeholder={nullable ? "" : undefined}
          onChange={(e) => {
            const inputValue = e.target.value;

            if (nullable && inputValue === "") {
              setInternalValue(null);
              (onChange as (v: number | null) => void)(null);
              return;
            }

            const digitsOnly = inputValue.replace(/[^0-9]/g, "");
            const cleanValue = digitsOnly.replace(/^0+/, "") || "0";

            let numValue = Number(cleanValue);
            if (effectiveMin !== undefined && numValue < effectiveMin) numValue = effectiveMin;
            if (maxValue !== undefined && numValue > maxValue) numValue = maxValue;
            setInternalValue(numValue);
            (onChange as (v: number | null) => void)(numValue);
          }}
          className={`w-full shrink text-center text-sm bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${compact ? "py-0.5" : "py-1"}`}
        />
        {showIncrease && (
          <button
            type="button"
            onClick={() => {
              const base = internalValue ?? (effectiveMin ?? 0);
              const newValue = Math.min(base + 1, maxValue ?? Number.POSITIVE_INFINITY);
              setInternalValue(newValue);
              (onChange as (v: number | null) => void)(newValue);
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
              setInternalValue(maxValue);
              (onChange as (v: number | null) => void)(maxValue);
            }}
            className={`${buttonClass} text-[10px] border-l border-neutral-200 dark:border-neutral-700`}
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
