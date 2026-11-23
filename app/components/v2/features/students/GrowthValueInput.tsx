import { type ReactNode, useEffect, useState } from "react";
import { v2FocusRing } from "~/components/v2/layout/styles";
import type { NumberInputFlowNavigationInputProps } from "~/components/v2/primitives/use-number-input-flow-navigation";
import { cn } from "~/lib/utils";

// One value segment of a field box. It keeps the 1.x planner input's behavior: an empty field is no value, a typed value
// is clamped to the range at once, and the step buttons stop at the range ends. "− / + / 최대 버튼 표시" adds the step
// buttons; without them the segment is the number alone.
export function GrowthValueInput({
  label,
  value,
  min,
  max,
  showSteps,
  flowProps,
  onChange,
  leading,
  maxText,
  describedBy,
}: {
  // The accessible name, such as "니코 목표 EX 스킬".
  label: string;
  value: number | null;
  min: number;
  max: number;
  showSteps: boolean;
  flowProps: NumberInputFlowNavigationInputProps;
  onChange: (value: number | null) => void;
  // A decorative mark right before the number, such as the 인연 heart. The mark and the number center together.
  leading?: ReactNode;
  // Shown instead of the number while the value is at the maximum and the field is not focused, such as "MAX" for a
  // skill. A focused field shows the number for editing.
  maxText?: string;
  // The id of text that says more about the value, such as a legend for a highlighted value.
  describedBy?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const showsMaxText = maxText != null && !focused && value === max;
  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const commit = (next: number | null) => {
    setText(next == null ? "" : String(next));
    onChange(next);
  };

  const input = (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      aria-describedby={describedBy}
      // With the step buttons, an empty value stays blank as in 1.x, so a dash is not read as the − button beside it.
      placeholder={showSteps ? undefined : "–"}
      value={showsMaxText ? maxText : text}
      data-number-input-flow={flowProps["data-number-input-flow"]}
      onFocus={(event) => {
        setFocused(true);
        flowProps.onFocus(event);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={flowProps.onKeyDown}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        if (raw === "") {
          commit(null);
          return;
        }
        const digits = raw.replace(/\D/g, "");
        if (digits === "") return;
        commit(clamp(Number(digits)));
      }}
      className={cn(
        "block h-full min-w-0 appearance-none bg-transparent px-0 text-center text-sm font-normal text-v2-fg-secondary tabular-nums outline-none placeholder:text-v2-fg-tertiary",
        leading ? "w-[3ch] flex-none" : "flex-1",
      )}
    />
  );
  // A press beside the number still focuses it.
  const field = leading ? (
    // biome-ignore lint/a11y/noLabelWithoutControl: the label wraps the input, which is built above as a variable.
    <label className="flex h-full min-w-0 flex-1 cursor-text items-center justify-center gap-0.5">
      {leading}
      {input}
    </label>
  ) : (
    input
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset does not stretch its flex content to the segment height.
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex h-7 min-w-0 items-stretch has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-v2-focus",
      )}
    >
      {showSteps ? (
        <StepButton
          label={`${label} 감소`}
          disabled={value != null && value <= min}
          onClick={() => commit(clamp((value ?? min) - 1))}
        >
          −
        </StepButton>
      ) : null}
      {field}
      {showSteps ? (
        <>
          <StepButton
            label={`${label} 증가`}
            disabled={value != null && value >= max}
            onClick={() => commit(clamp((value ?? min) + 1))}
          >
            +
          </StepButton>
          <StepButton label={`${label} 최대`} disabled={value === max} onClick={() => commit(max)} wide>
            최대
          </StepButton>
        </>
      ) : null}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  wide = false,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-full shrink-0 cursor-pointer items-center justify-center text-xs leading-4 whitespace-nowrap text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg disabled:cursor-default disabled:text-v2-fg-disabled disabled:hover:bg-transparent v2-interaction-transition",
        wide ? "px-1" : "w-4",
        v2FocusRing,
        "focus-visible:-outline-offset-2",
      )}
    >
      {children}
    </button>
  );
}
