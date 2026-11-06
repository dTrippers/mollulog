import {
  type ChangeEvent,
  type FocusEvent,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

type NumberInputBaseProps = InputHTMLAttributes<HTMLInputElement> & {
  // A value that needs confirmation. The warning tone is the background only, and the text keeps the default color.
  warning?: boolean;
  compact?: boolean;
  formatThousands?: boolean;
};

export type NumberInputProps = NumberInputBaseProps &
  (
    | { grouped?: false; onValueChange?: never; showMin?: never; showMax?: never }
    | { grouped: true; onValueChange: (value: number) => void; showMin?: boolean; showMax?: boolean }
  );

type GroupedNumberInputProps = NumberInputBaseProps & {
  showMin: boolean;
  showMax?: boolean;
  onValueChange: (value: number) => void;
};

// Height follows the input token: 1.75rem on every layout, the same as ToggleChip.
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    warning = false,
    compact = false,
    grouped = false,
    showMin = true,
    showMax,
    formatThousands = false,
    onValueChange,
    className,
    ...props
  },
  ref,
) {
  if (grouped && onValueChange) {
    return (
      <GroupedNumberInput
        warning={warning}
        showMin={showMin}
        showMax={showMax}
        formatThousands={formatThousands}
        onValueChange={onValueChange}
        className={className}
        ref={ref}
        {...props}
      />
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

const GroupedNumberInput = forwardRef<HTMLInputElement, GroupedNumberInputProps>(function GroupedNumberInput(
  { warning = false, showMin, showMax, formatThousands = false, onValueChange, className, ...props },
  ref,
) {
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const selectAllOnFocusRef = useRef(false);
  const focusedInputRef = useRef<HTMLInputElement | null>(null);
  const {
    value,
    defaultValue,
    min: minProp,
    max: maxProp,
    step: stepProp,
    onChange,
    onBlur,
    onFocus,
    ...inputProps
  } = props;
  const min = typeof minProp === "number" ? minProp : 0;
  const max = typeof maxProp === "number" ? maxProp : undefined;
  const step = typeof stepProp === "number" && stepProp > 0 ? stepProp : 1;
  const accessibleLabel =
    typeof inputProps["aria-label"] === "string" ? inputProps["aria-label"] : (inputProps.name ?? "수량");
  const currentValue = Number(value ?? defaultValue ?? min);
  const clamp = (nextValue: number) => Math.max(min, max === undefined ? nextValue : Math.min(max, nextValue));
  const update = (nextValue: number) => {
    const next = clamp(nextValue);
    onValueChange(next);
  };
  const parseInputValue = (event: ChangeEvent<HTMLInputElement> | FocusEvent<HTMLInputElement>) => {
    if (!formatThousands) return event.currentTarget.valueAsNumber;
    const digits = event.currentTarget.value.replace(/\D/g, "");
    return digits ? Number(digits) : Number.NaN;
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = parseInputValue(event);
    if (formatThousands) setDraftValue(event.currentTarget.value.replace(/\D/g, ""));
    update(Number.isFinite(nextValue) ? nextValue : min);
    onChange?.(event);
  };
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextValue = parseInputValue(event);
    update(Number.isFinite(nextValue) ? nextValue : min);
    if (formatThousands) setDraftValue(null);
    onBlur?.(event);
  };
  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    if (formatThousands) {
      selectAllOnFocusRef.current = event.currentTarget.matches(":focus-visible");
      focusedInputRef.current = selectAllOnFocusRef.current ? event.currentTarget : null;
      setDraftValue(event.currentTarget.value.replace(/\D/g, ""));
    }
    onFocus?.(event);
  };
  const inputValue = value ?? defaultValue;
  const hasInputValue = inputValue != null && inputValue !== "";
  const displayValue = formatThousands
    ? (draftValue ?? (hasInputValue ? new Intl.NumberFormat("ko-KR").format(Number(inputValue)) : ""))
    : value;

  useLayoutEffect(() => {
    if (!selectAllOnFocusRef.current || draftValue === null) return;
    focusedInputRef.current?.select();
    focusedInputRef.current = null;
    selectAllOnFocusRef.current = false;
  }, [draftValue]);

  return (
    <fieldset
      aria-label={accessibleLabel}
      className={cn(
        "m-0 flex h-7 min-w-0 items-stretch rounded-md border border-v2-control-border-strong bg-v2-surface p-0 text-sm text-v2-fg dark:border-v2-control-border",
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
        {...inputProps}
        ref={ref}
        type={formatThousands ? "text" : "number"}
        role="spinbutton"
        aria-valuenow={hasInputValue ? currentValue : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        min={formatThousands ? undefined : minProp}
        max={formatThousands ? undefined : maxProp}
        step={formatThousands ? undefined : stepProp}
        inputMode="numeric"
        value={displayValue}
        defaultValue={formatThousands ? undefined : defaultValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
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
