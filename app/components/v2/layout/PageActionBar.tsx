import { forwardRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

export type PageActionBarProps = {
  // The summary is a preview of what the primary action will do, such as the number of items to apply.
  summary: ReactNode;
  // Status that belongs with the summary, such as a running task. Wide screens show it between the summary and the
  // actions; below the sm breakpoint it takes its own row under them, so the actions stay beside the summary.
  details?: ReactNode;
  children: ReactNode;
  // Sticky stays at the bottom of the main column (desktop). Fixed pins the bar above the mobile navigation bar on stacked layouts.
  placement?: "sticky" | "fixed";
  // On mobile the actions fill the row, and the last action (the primary) takes the rest. Desktop keeps its content width.
  expandActions?: boolean;
  // Elevated lifts the bar off surface-colored content cards, such as a list of result cards behind a floating bar.
  tone?: "surface" | "elevated";
  className?: string;
};

// Bottom action bar for the step's primary and secondary actions. The screen adds bottom padding while a fixed bar shows.
export const PageActionBar = forwardRef<HTMLDivElement, PageActionBarProps>(function PageActionBar(
  { summary, details, children, placement = "sticky", expandActions = false, tone = "surface", className },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "z-20 flex flex-wrap items-center justify-between gap-v2-block-gap border-v2-control-border p-v2-block-p shadow-lg",
        tone === "elevated" ? "bg-v2-elevated" : "bg-v2-surface",
        placement === "fixed"
          ? "fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-30 border-x-0 border-t border-b-0 lg:bottom-0"
          : "sticky bottom-0 rounded-lg border",
        className,
      )}
    >
      {summary != null ? <div className="min-w-0 text-sm font-semibold text-v2-fg tabular-nums">{summary}</div> : null}
      {details != null ? (
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">{details}</div>
      ) : null}
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
