import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps, type V2TransitionKind } from "./screen-transition";

export function isExternalHref(to: string): boolean {
  return to.startsWith("http");
}

export type LinkTargetProps = {
  to?: string;
  onClick?: () => void;
  preventScrollReset?: boolean;
  transition?: V2TransitionKind;
  className: string;
  children: ReactNode;
};

// One target for every 2.0 link item: an onClick button, an external anchor, or an internal router link.
export function LinkTarget({ to, onClick, preventScrollReset, transition, className, children }: LinkTargetProps) {
  if (!to) {
    return (
      <button type="button" onClick={onClick} className={cn("cursor-pointer", className)}>
        {children}
      </button>
    );
  }

  if (isExternalHref(to)) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link
      to={to}
      preventScrollReset={preventScrollReset}
      className={className}
      {...getV2LinkTransitionProps(transition, onClick)}
    >
      {children}
    </Link>
  );
}
