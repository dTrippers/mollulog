import { forwardRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

export type PageActionBarProps = {
  // The summary is a preview of what the primary action will do, such as the number of items to apply.
  summary: ReactNode;
  children: ReactNode;
  // Sticky stays at the bottom of the main column (desktop). Fixed pins the bar above the mobile navigation bar on stacked layouts.
  placement?: "sticky" | "fixed";
  // On mobile the actions fill the row, and the last action (the primary) takes the rest. Desktop keeps its content width.
  expandActions?: boolean;
  className?: string;
};

// Bottom action bar for the step's primary and secondary actions. The screen adds bottom padding while a fixed bar shows.
export const PageActionBar = forwardRef<HTMLDivElement, PageActionBarProps>(function PageActionBar(
  { summary, children, placement = "sticky", expandActions = false, className },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "z-20 flex flex-wrap items-center justify-between gap-v2-block-gap border-v2-control-border bg-v2-surface p-v2-block-p shadow-lg",
        placement === "fixed"
          ? "fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-30 border-x-0 border-t border-b-0 lg:bottom-0"
          : "sticky bottom-0 rounded-lg border",
        className,
      )}
    >
      {summary != null ? <div className="min-w-0 text-sm font-semibold text-v2-fg tabular-nums">{summary}</div> : null}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2",
          summary == null && "ml-auto",
          expandActions && "w-full sm:w-auto [&>:last-child]:flex-1 sm:[&>:last-child]:flex-none",
        )}
      >
        {children}
      </div>
    </div>
  );
});
