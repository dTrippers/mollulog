import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type ClickableSurfaceProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export default function ClickableSurface({ children, className, onClick, disabled = false }: ClickableSurfaceProps) {
  if (!onClick) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <button
      type="button"
      className={cn("block text-left", className)}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {children}
    </button>
  );
}

export type { ClickableSurfaceProps };
