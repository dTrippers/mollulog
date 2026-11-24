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
  // "md" draws a 20px icon, for a screen-level control such as the display toggles in a title row. The button stays 2rem.
  iconSize?: "sm" | "md";
  // Off for a button that shows its name in its own tooltip, so the browser's title tooltip does not show over it.
  showTitle?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

// Compact 2rem icon-only control on every layout.
export function IconButton({
  icon: Icon,
  label,
  pressed,
  danger = false,
  iconSize = "sm",
  showTitle = true,
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
      title={showTitle ? label : undefined}
      aria-pressed={pressed}
      className={cn(
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-v2-fg-tertiary",
        "hover:bg-v2-hover hover:text-v2-fg disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:hover:bg-transparent v2-interaction-transition",
        danger && "hover:text-v2-danger v2-interaction-transition",
        pressed && "text-v2-fg",
        v2FocusRing,
        className,
      )}
      {...props}
    >
      <Icon className={iconSize === "md" ? "size-5" : "size-4"} aria-hidden="true" />
    </button>
  );
}
