import { type ChangeEvent, type FocusEvent, forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

type NumberInputBaseProps = InputHTMLAttributes<HTMLInputElement> & {
  // A value that needs confirmation. The warning tone is the background only, and the text keeps the default color.
  warning?: boolean;
  compact?: boolean;
};

export type NumberInputProps = NumberInputBaseProps &
  (
    | { grouped?: false; onValueChange?: never; showMin?: never; showMax?: never }
    | { grouped: true; onValueChange: (value: number) => void; showMin?: boolean; showMax?: boolean }
  );

// Height follows the input token: 2rem on desktop, 2.25rem on mobile and coarse pointers.
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { warning = false, compact = false, grouped = false, showMin = true, showMax, onValueChange, className, ...props },
  ref,
) {
  if (grouped && onValueChange) {
    const min = typeof props.min === "number" ? props.min : 0;
    const max = typeof props.max === "number" ? props.max : undefined;
    const step = typeof props.step === "number" && props.step > 0 ? props.step : 1;
    const accessibleLabel = typeof props["aria-label"] === "string" ? props["aria-label"] : (props.name ?? "수량");
    const currentValue = Number(props.value ?? props.defaultValue ?? min);
    const clamp = (value: number) => Math.max(min, max === undefined ? value : Math.min(max, value));
    const update = (value: number) => onValueChange(clamp(value));
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.valueAsNumber;
      update(Number.isFinite(value) ? value : min);
      props.onChange?.(event);
    };
    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
      const value = event.currentTarget.valueAsNumber;
      update(Number.isFinite(value) ? value : min);
      props.onBlur?.(event);
    };
    return (
      <fieldset
        aria-label={accessibleLabel}
        className={cn(
          "m-0 flex h-[26px] min-w-0 items-stretch rounded-md border border-v2-control-border-strong bg-v2-surface p-0 text-sm text-v2-fg dark:border-v2-control-border",
          warning && "bg-v2-warning-subtle",
          v2FocusRing,
          className,
        )}
      >
        {showMin ? (
          <StepButton
            className="px-1"
            disabled={props.disabled}
            label={`${accessibleLabel} 최소`}
            onClick={() => update(min)}
          >
            최소
          </StepButton>
        ) : null}
        <StepButton
          className="min-w-4"
          disabled={props.disabled}
          label={`${accessibleLabel} 감소`}
          onClick={() => update(currentValue - step)}
        >
          −
        </StepButton>
        <input
          {...props}
          ref={ref}
          type="number"
          inputMode="numeric"
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(
            "block h-full min-h-0 min-w-0 flex-1 appearance-none border-0 bg-transparent px-0 text-center text-sm leading-5 font-medium tabular-nums focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          )}
        />
        <StepButton
          className="min-w-4"
          disabled={props.disabled}
          label={`${accessibleLabel} 증가`}
          onClick={() => update(currentValue + step)}
        >
          +
        </StepButton>
        {(showMax ?? max !== undefined) ? (
          <StepButton
            className="px-1"
            disabled={props.disabled || max === undefined}
            label={`${accessibleLabel} 최대`}
            onClick={() => max !== undefined && update(max)}
          >
            최대
          </StepButton>
        ) : null}
      </fieldset>
    );
  }

  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      className={cn(
        "block w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface px-2 text-center text-sm font-medium text-v2-fg tabular-nums focus:border-v2-control-border-strong disabled:text-v2-fg-disabled",
        compact ? "min-h-7" : "min-h-v2-input-min",
        warning && "bg-v2-warning-subtle",
        v2FocusRing,
        className,
      )}
      {...props}
    />
  );
});

function StepButton({
  children,
  className,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-full min-w-5 shrink-0 items-center justify-center px-0 whitespace-nowrap text-xs leading-4 text-v2-fg-tertiary before:absolute before:inset-x-0 before:inset-y-[min(0px,calc(50%-var(--spacing-v2-control-min)/2))] before:content-[''] hover:bg-v2-hover hover:text-v2-fg disabled:cursor-not-allowed disabled:text-v2-fg-disabled",
        className,
        v2FocusRing,
      )}
    >
      {children}
    </button>
  );
}
