import type { ComponentPropsWithoutRef } from "react";
import { useEffect, useId, useState } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";
import type { NumberInputFlowNavigationInputProps } from "./useNumberInputFlowNavigation";

type InputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "inputMode" | "pattern" | "value" | "defaultValue" | "placeholder" | "onChange"
> &
  Partial<NumberInputFlowNavigationInputProps>;

type NumberInputBaseProps = {
  id?: string;
  label?: string;
  maxValue?: number;
  minValue?: number;
  size?: "sm" | "md";
  disabled?: boolean;
  inputProps?: InputProps;
  controlClassName?: string;
};

export type NumberInputProps = NumberInputBaseProps &
  (
    | {
        nullable?: false;
        defaultValue?: number;
        value?: number;
        onChange: (value: number) => void;
      }
    | {
        nullable: true;
        defaultValue?: number | null;
        value?: number | null;
        onChange: (value: number | null) => void;
      }
  );

export function normalizeNumberInputText(inputValue: string, allowNegative: boolean): string {
  const negative = allowNegative && inputValue.trimStart().startsWith("-");
  const digitsOnly = inputValue.replace(/[^0-9]/g, "");
  const cleanValue = digitsOnly.replace(/^0+(?=\d)/, "") || "0";
  return negative && cleanValue !== "0" ? `-${cleanValue}` : cleanValue;
}

export function clampNumberInputValue(nextValue: number, minValue?: number, maxValue?: number): number {
  let clampedValue = nextValue;
  if (minValue !== undefined && clampedValue < minValue) clampedValue = minValue;
  if (maxValue !== undefined && clampedValue > maxValue) clampedValue = maxValue;
  return clampedValue;
}

export function NumberInput(props: NumberInputProps) {
  const {
    id,
    label,
    defaultValue,
    value,
    maxValue,
    minValue,
    size = "sm",
    disabled = false,
    inputProps,
    controlClassName,
  } = props;
  const generatedId = useId();
  const inputId = id ?? inputProps?.id ?? (label ? generatedId : undefined);
  const controlLabel = inputProps?.["aria-label"] ?? label;
  const nullable = props.nullable === true;
  const effectiveMin = minValue ?? (nullable ? undefined : 0);
  const allowNegative = effectiveMin !== undefined && effectiveMin < 0;
  const initialValue = defaultValue ?? value ?? (nullable ? null : 0);
  const [internalValue, setInternalValue] = useState<number | null>(initialValue);
  const [inputText, setInputText] = useState(initialValue == null ? "" : String(initialValue));

  useEffect(() => {
    if (value === undefined) return;
    const nextValue = value ?? null;
    setInternalValue(nextValue);
    setInputText(nextValue == null ? "" : String(nextValue));
  }, [value]);

  const commitValue = (nextValue: number | null) => {
    setInternalValue(nextValue);
    setInputText(nextValue == null ? "" : String(nextValue));
    if (props.nullable === true) {
      props.onChange(nextValue);
    } else if (nextValue != null) {
      props.onChange(nextValue);
    }
  };
  const clampValue = (nextValue: number) => clampNumberInputValue(nextValue, effectiveMin, maxValue);
  const buttonClassName = cn(
    "flex shrink-0 items-center justify-center text-v2-fg-tertiary hover:bg-v2-hover disabled:pointer-events-none disabled:opacity-40",
    size === "sm" ? "h-7 min-w-7 px-1 text-sm" : "self-stretch min-w-10 px-3 text-base",
  );

  return (
    <div className={cn("min-w-0", label ? "space-y-1" : undefined)}>
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-v2-fg">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "flex w-full items-center overflow-hidden rounded-md border border-v2-control-border bg-v2-surface text-v2-fg transition-colors focus-within:border-v2-focus focus-within:ring-2 focus-within:ring-v2-focus/30",
          size === "sm" ? "min-h-8" : "h-v2-row-min",
          controlClassName,
        )}
      >
        <button
          type="button"
          aria-label={controlLabel ? `${controlLabel} 감소` : "감소"}
          disabled={disabled || (internalValue != null && effectiveMin !== undefined && internalValue <= effectiveMin)}
          onClick={() => commitValue(clampValue((internalValue ?? effectiveMin ?? 0) - 1))}
          className={buttonClassName}
        >
          −
        </button>
        <input
          {...inputProps}
          id={inputId}
          aria-label={inputProps?.["aria-label"] ?? label}
          type="text"
          inputMode={allowNegative ? "decimal" : "numeric"}
          pattern={allowNegative ? "-?[0-9]*" : "[0-9]*"}
          value={inputText}
          placeholder={nullable ? "" : undefined}
          disabled={disabled || inputProps?.disabled}
          onChange={(event) => {
            const nextText = event.currentTarget.value;
            if (nextText === "") {
              setInputText("");
              if (nullable) commitValue(null);
              return;
            }
            commitValue(clampValue(Number(normalizeNumberInputText(nextText, allowNegative))));
          }}
          onBlur={(event) => {
            if (!nullable && event.currentTarget.value === "") {
              commitValue(clampValue(effectiveMin ?? 0));
            }
            inputProps?.onBlur?.(event);
          }}
          className={cn(
            "w-full min-w-0 appearance-none bg-transparent px-1 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            size === "sm" ? "py-1 text-sm" : "self-stretch py-0 text-base font-semibold",
            inputProps?.className,
          )}
        />
        <button
          type="button"
          aria-label={controlLabel ? `${controlLabel} 증가` : "증가"}
          disabled={disabled || (maxValue !== undefined && internalValue != null && internalValue >= maxValue)}
          onClick={() => commitValue(clampValue((internalValue ?? effectiveMin ?? 0) + 1))}
          className={buttonClassName}
        >
          +
        </button>
      </div>
    </div>
  );
}
