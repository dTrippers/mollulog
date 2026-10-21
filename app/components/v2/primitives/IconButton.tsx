import type { ButtonHTMLAttributes, ElementType, Ref } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ElementType;
  // Required: an icon-only control needs an accessible name. It is also the tooltip.
  label: string;
  // Sets aria-pressed on a toggle, such as pinning.
  pressed?: boolean;
  danger?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

// Compact 2rem icon-only control on every layout.
export function IconButton({
  icon: Icon,
  label,
  pressed,
  danger = false,
  className,
  type = "button",
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-v2-fg-tertiary",
        "hover:bg-v2-hover hover:text-v2-fg disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:hover:bg-transparent",
        danger && "hover:text-v2-danger",
        pressed && "text-v2-fg",
        v2FocusRing,
        className,
      )}
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
