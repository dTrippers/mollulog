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
}: {
  // The accessible name, such as "니코 목표 EX 스킬".
  label: string;
  value: number | null;
  min: number;
  max: number;
  showSteps: boolean;
  flowProps: NumberInputFlowNavigationInputProps;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
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
      placeholder="–"
      value={text}
      data-number-input-flow={flowProps["data-number-input-flow"]}
      onFocus={flowProps.onFocus}
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
      className="block h-full min-w-0 flex-1 appearance-none bg-transparent px-0 text-center text-sm font-medium text-v2-fg tabular-nums outline-none placeholder:text-v2-fg-tertiary"
    />
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
      {input}
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
