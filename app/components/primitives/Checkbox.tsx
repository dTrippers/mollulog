import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "~/lib/utils";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  label?: ReactNode;
  onChange?: (checked: boolean) => void;
};

export default function Checkbox({ label, className, checked, disabled, onChange, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex w-fit items-center gap-2 text-sm text-foreground",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        className="size-4 rounded-sm border-input text-primary focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.currentTarget.checked)}
        {...props}
      />
      {label && <span>{label}</span>}
    </label>
  );
}

export type { CheckboxProps };
