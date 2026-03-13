import type { ReactNode } from "react";
import { sanitizeClassName } from "~/prophandlers";

type ClickableSurfaceProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export default function ClickableSurface({ children, className, onClick, disabled = false }: ClickableSurfaceProps) {
  if (!onClick) {
    return <div className={sanitizeClassName(className ?? "")}>{children}</div>;
  }

  return (
    <button
      type="button"
      className={sanitizeClassName(`block text-left ${className ?? ""}`)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export type { ClickableSurfaceProps };
