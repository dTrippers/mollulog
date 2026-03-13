import type { ReactNode } from "react";
import { sanitizeClassName } from "~/prophandlers";

type FieldProps = {
  label?: string;
  description?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  containerClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  errorClassName?: string;
};

export default function Field({
  label,
  description,
  error,
  htmlFor,
  children,
  containerClassName,
  labelClassName,
  descriptionClassName,
  errorClassName,
}: FieldProps) {
  return (
    <div className={sanitizeClassName(containerClassName ?? "")}>
      {label && (
        <label className={sanitizeClassName(`font-bold my-2 block ${labelClassName ?? ""}`)} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {description && (
        <p className={sanitizeClassName(`my-2 text-sm text-neutral-500 dark:text-neutral-400 ${descriptionClassName ?? ""}`)}>
          {description}
        </p>
      )}
      {children}
      {error && <p className={sanitizeClassName(`text-red-500 text-sm mt-2 ${errorClassName ?? ""}`)}>{error}</p>}
    </div>
  );
}

export type { FieldProps };
