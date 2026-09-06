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
  "aria-invalid"?: boolean | "false" | "true";
  className?: string;
  trackClassName?: string;
  onChange?: (value: boolean) => void;
};

export default function Toggle({
  name,
  label,
  initialState,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  className,
  trackClassName,
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
          aria-invalid={ariaInvalid}
          className={cn(
            `
            h-5 w-10 p-0.5 group relative flex rounded-full outline-none transition-colors duration-200 ease-in-out
            bg-input data-checked:bg-primary
            focus-visible:ring-2 focus-visible:ring-ring/30
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          `,
            trackClassName,
          )}
          checked={enabled}
          onChange={(value) => {
            onChange?.(value);
            setEnabled(value);
          }}
        >
          <span
            aria-hidden="true"
            className="size-4 pointer-events-none inline-block translate-x-0 rounded-full bg-white ring-0 shadow-lg transition duration-200 ease-in-out group-data-checked:translate-x-5"
          />
        </Switch>
        {label && <Label className="ml-2 text-sm">{label}</Label>}
      </Field>

      <input type="hidden" name={name} value={enabled ? "true" : "false"} />
    </>
  );
}
