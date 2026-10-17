import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type CheckboxProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
};

export function Checkbox({ id, checked, onCheckedChange, disabled = false, children }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn("inline-flex items-start gap-2 text-sm text-v2-fg", disabled && "text-v2-fg-disabled")}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        className={cn("mt-0.5 size-4 shrink-0 cursor-pointer accent-v2-fg disabled:cursor-not-allowed", v2FocusRing)}
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
