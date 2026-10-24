import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type V2ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text" | "link" | "danger" | "danger-subtle";
  size?: "md" | "sm";
};

type V2ButtonVariant = NonNullable<V2ButtonProps["variant"]>;
type V2ButtonSize = NonNullable<V2ButtonProps["size"]>;

const variantClassName = {
  primary: "bg-v2-fg text-v2-canvas hover:opacity-90",
  secondary: "bg-v2-inset text-v2-fg hover:bg-v2-filled-hover",
  text: "text-v2-fg-secondary hover:text-v2-fg hover:bg-v2-hover",
  link: "px-0 text-v2-fg-secondary enabled:hover:text-v2-fg",
  danger:
    "bg-v2-danger-solid text-v2-on-danger enabled:hover:opacity-90 disabled:bg-v2-inset disabled:text-v2-fg-disabled",
  "danger-subtle": "bg-v2-danger-subtle text-v2-danger enabled:hover:opacity-90",
} as const;

// Visual heights: md 2rem, sm 1.75rem, on every layout.
const sizeClassName = {
  md: "min-h-8 px-3 text-sm",
  sm: "min-h-7 px-2 text-xs",
} as const;

// The hit area keeps at least min-h-v2-control-min (2.5rem on stacked layouts and coarse pointers) through an invisible
// pseudo-element, so the visible button stays compact.
const hitAreaClassName =
  "relative before:absolute before:inset-x-0 before:inset-y-[min(0px,calc(50%-var(--spacing-v2-control-min)/2))] before:content-['']";

export function v2ButtonClassName({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: V2ButtonVariant;
  size?: V2ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:opacity-100",
    hitAreaClassName,
    sizeClassName[size],
    variantClassName[variant],
    v2FocusRing,
    className,
  );
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: V2ButtonProps) {
  return <button type={type} className={v2ButtonClassName({ variant, size, className })} {...props} />;
}
