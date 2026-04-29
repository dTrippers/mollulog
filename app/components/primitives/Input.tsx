import type { InputHTMLAttributes } from "react";
import { cn } from "~/lib/utils";
import Field from "./Field";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> & {
  containerClassName?: string;
  label?: string;
  description?: string;
  error?: string;
  descriptionClassName?: string;
  size?: "sm" | "md";
  onChange?: (value: string) => void;
};

export default function Input({
  className,
  containerClassName,
  type,
  name,
  label,
  description,
  error,
  descriptionClassName,
  size = "md",
  onChange,
  id,
  disabled,
  ...props
}: InputProps) {
  const controlId = id ?? name;

  return (
    <Field
      label={label}
      description={description}
      error={error}
      htmlFor={controlId}
      descriptionClassName={descriptionClassName}
      containerClassName={containerClassName ?? (size === "sm" ? "mt-1 mb-1" : "mt-2 mb-8 last:mb-2")}
    >
      <input
        id={controlId}
        type={type ?? "text"}
        name={name}
        className={cn(
          "w-full max-w-96 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "min-h-9 py-1.5" : "min-h-10 py-2",
          type === "number" &&
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          error && "border-destructive focus:border-destructive focus:ring-destructive/20",
          className,
        )}
        disabled={disabled}
        aria-invalid={error ? true : props["aria-invalid"]}
        onChange={(event) => onChange?.(event.target.value)}
        {...props}
      />
    </Field>
  );
}
