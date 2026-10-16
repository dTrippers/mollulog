import { cn } from "~/lib/utils";
import { v2FocusRing } from "./styles";

export type PanelActionProps = {
  variant?: "neutral" | "danger";
  onClick: () => void;
  // A verb label is required. Icon-only actions are not part of 2.0.
  children: string;
  disabled?: boolean;
};

// Small text action for a panel header, on the Aside and in the mobile sheet alike. Danger is a status color: use it only
// to clear or revert an applied state, and always with a verb label.
export function PanelAction({ variant = "neutral", onClick, children, disabled = false }: PanelActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-xs font-medium whitespace-nowrap",
        // The visible box stays 28px. On coarse pointers the hit area grows to 44px without a larger visible target.
        "pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2 before:content-['']",
        // Hover and press share one overlay. It reads on the neutral and the danger-subtle backgrounds alike.
        "after:absolute after:inset-0 after:rounded-[inherit] after:bg-v2-hover after:opacity-0 after:content-[''] enabled:hover:after:opacity-100 enabled:active:after:opacity-100 after:transition-opacity after:duration-v2-fast after:ease-v2-standard",
        variant === "danger" ? "bg-v2-danger-subtle text-v2-danger" : "text-v2-fg-secondary",
        "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-v2-fg-disabled",
        v2FocusRing,
      )}
    >
      {children}
    </button>
  );
}
