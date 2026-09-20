import { Field, Label, Switch } from "@headlessui/react";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

type ToggleProps = {
  name?: string;
  label?: string;
  initialState?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  className?: string;
  trackClassName?: string;
  hitArea?: boolean;
  canChange?: (value: boolean) => boolean;
  onChange?: (value: boolean) => void;
};

export default function Toggle({
  name,
  label,
  initialState,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  trackClassName,
  hitArea = false,
  canChange,
  onChange,
}: ToggleProps) {
  const [enabled, setEnabled] = useState(initialState ?? false);

  useEffect(() => {
    setEnabled(initialState ?? false);
  }, [initialState]);

  return (
    <>
      <Field className={`${className ?? "my-4"} flex items-center`}>
        <Switch
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn(
            hitArea
              ? `
                h-11 w-11 p-0 group relative flex items-center justify-center rounded-full outline-none transition-colors duration-200 ease-in-out
                bg-transparent data-checked:bg-transparent
                focus-visible:ring-2 focus-visible:ring-ring/30
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `
              : `
                h-5 w-10 p-0.5 group relative flex rounded-full outline-none transition-colors duration-200 ease-in-out
                bg-input data-checked:bg-primary
                focus-visible:ring-2 focus-visible:ring-ring/30
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `,
            trackClassName,
          )}
          checked={enabled}
          onChange={(value) => {
            if (canChange && !canChange(value)) return;
            onChange?.(value);
            setEnabled(value);
          }}
        >
          {hitArea ? (
            <span
              aria-hidden="true"
              className="pointer-events-none relative flex h-5 w-10 items-center rounded-full bg-input transition-colors duration-200 ease-in-out group-data-checked:bg-primary"
            >
              <span className="inline-block size-4 translate-x-0 rounded-full bg-white ring-0 shadow-lg transition duration-200 ease-in-out group-data-checked:translate-x-5" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="size-4 pointer-events-none inline-block translate-x-0 rounded-full bg-white ring-0 shadow-lg transition duration-200 ease-in-out group-data-checked:translate-x-5"
            />
          )}
        </Switch>
        {label && <Label className="ml-2 text-sm">{label}</Label>}
      </Field>

      <input type="hidden" name={name} value={enabled ? "true" : "false"} />
    </>
  );
}
