import type { TextareaHTMLAttributes } from "react";
import { cn } from "~/lib/utils";
import Field from "./Field";

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  containerClassName?: string;
  label?: string;
  description?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function Textarea({
  className,
  containerClassName,
  name,
  label,
  description,
  rows,
  error,
  onChange,
  id,
  disabled,
  ...props
}: TextareaProps) {
  const controlId = id ?? name;

  return (
    <Field
      label={label}
      description={description}
      error={error}
      htmlFor={controlId}
      containerClassName={containerClassName}
    >
      <textarea
        id={controlId}
        name={name}
        rows={rows}
        className={cn(
          "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
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
