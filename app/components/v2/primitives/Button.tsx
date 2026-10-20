import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type V2ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text" | "danger";
};

type V2ButtonVariant = NonNullable<V2ButtonProps["variant"]>;

const variantClassName = {
  primary: "bg-v2-fg text-v2-canvas hover:opacity-90",
  secondary: "bg-v2-inset text-v2-fg hover:bg-v2-filled-hover",
  text: "text-v2-fg-secondary hover:text-v2-fg hover:bg-v2-hover",
  // Danger clears an applied filter state, with a verb label, as PanelAction does.
  danger: "bg-v2-danger-subtle text-v2-danger hover:opacity-90",
} as const;

export function v2ButtonClassName({
  variant = "secondary",
  className,
}: {
  variant?: V2ButtonVariant;
  className?: string;
} = {}) {
  return cn(
    "inline-flex min-h-v2-control-min cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:opacity-100",
    variantClassName[variant],
    v2FocusRing,
    className,
  );
}

export function Button({ variant = "secondary", className, type = "button", ...props }: V2ButtonProps) {
  return <button type={type} className={v2ButtonClassName({ variant, className })} {...props} />;
}
