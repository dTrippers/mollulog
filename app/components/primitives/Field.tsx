import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "~/lib/utils";

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
  const descriptionId = htmlFor && description ? `${htmlFor}-description` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const content =
    htmlFor &&
    isValidElement(children) &&
    typeof children.type !== "symbol"
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children.props as { id?: string }).id ?? htmlFor,
          "aria-describedby": [
            (children.props as { "aria-describedby"?: string })["aria-describedby"],
            describedBy,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
          "aria-invalid":
            error ? true : (children.props as { "aria-invalid"?: boolean })["aria-invalid"],
        })
      : children;

  return (
    <div className={cn("space-y-2", containerClassName)}>
      {label && (
        <label className={cn("block text-sm font-semibold text-foreground", labelClassName)} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {description && (
        <p id={descriptionId} className={cn("text-sm text-muted-foreground", descriptionClassName)}>
          {description}
        </p>
      )}
      {content}
      {error && (
        <p id={errorId} className={cn("text-sm font-medium text-destructive", errorClassName)}>
          {error}
        </p>
      )}
    </div>
  );
}

export type { FieldProps };
