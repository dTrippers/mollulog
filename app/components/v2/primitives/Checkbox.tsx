import { CheckIcon } from "@heroicons/react/16/solid";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "id" | "checked" | "defaultChecked" | "disabled" | "onChange" | "children" | "className"
> & {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
};

export function Checkbox({ id, checked, onCheckedChange, disabled = false, children, ...inputProps }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn("inline-flex items-start gap-2 text-sm text-v2-fg", disabled && "text-v2-fg-disabled")}
    >
      {/* Drawn by hand: browsers render a native box with accent-color unevenly, and Safari washes out a light accent. */}
      <span className="relative mt-0.5 inline-flex size-4 shrink-0">
        <input
          {...inputProps}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          className={cn(
            "peer size-4 cursor-pointer appearance-none rounded border border-v2-fg-tertiary bg-transparent checked:border-v2-accent checked:bg-v2-accent disabled:cursor-not-allowed disabled:opacity-50",
            v2FocusRing,
          )}
        />
        <CheckIcon
          className="pointer-events-none absolute inset-0 m-auto size-3.5 text-v2-on-accent opacity-0 peer-checked:opacity-100"
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}
