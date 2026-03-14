import Field from "./Field";
import { sanitizeClassName } from "~/prophandlers";

type InputProps = {
  className?: string;
  containerClassName?: string;
  type?: "text" | "number";
  name?: string;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function Input({
  className,
  containerClassName,
  type,
  name,
  label,
  description,
  placeholder,
  required,
  defaultValue,
  value,
  error,
  onChange,
}: InputProps) {
  return (
    <Field
      label={label}
      description={description}
      error={error}
      htmlFor={name}
      containerClassName={containerClassName ?? "mt-2 mb-8 last:mb-2"}
    >
      <input
        id={name}
        type={type ?? "text"}
        name={name}
        placeholder={placeholder}
        className={sanitizeClassName(`
          w-full max-w-96 p-2 border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 rounded-lg transition
          ${error ? "border-red-300 shadow-red-300 dark:border-red-700 dark:shadow-red-700" : ""}
          ${type === "number" && "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
          ${className ?? ""}
        `)}
        required={required}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </Field>
  );
}
