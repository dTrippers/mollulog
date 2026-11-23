import type { NavigationDot } from "~/domain/navigation-menu-badges";
import { cn } from "~/lib/utils";

export const NAVIGATION_DOT_LABELS: Record<NavigationDot, string> = {
  attention: "새 항목 있음",
  account: "확인할 내 정보 있음",
};

const DOT_COLOR_CLASS: Record<NavigationDot, string> = {
  attention: "bg-v2-unread",
  account: "bg-v2-account-dot",
};

export function NavigationDotMark({ dot, className }: { dot: NavigationDot; className?: string }) {
  return (
    <span
      className={cn("size-1.5 rounded-full", DOT_COLOR_CLASS[dot], className)}
      data-navigation-dot={dot}
      aria-hidden="true"
    />
  );
}
