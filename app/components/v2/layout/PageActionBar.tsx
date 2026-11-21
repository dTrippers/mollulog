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
  className?: string;
};

// Bottom action bar for the step's primary and secondary actions. The screen adds bottom padding while a fixed bar shows.
// The bar floats: it keeps a gap from the bottom edge, and its translucent tint sets it apart from the canvas and from
// white content cards (surface and elevated are both white in light mode, so neither can separate it).
export const PageActionBar = forwardRef<HTMLDivElement, PageActionBarProps>(function PageActionBar(
  { summary, details, children, placement = "sticky", expandActions = false, className },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "z-20 flex flex-wrap items-center justify-between gap-v2-block-gap rounded-lg border border-v2-control-border bg-v2-page-action-bar p-v2-block-p shadow-lg backdrop-blur-md",
        placement === "fixed"
          ? "fixed inset-x-3 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-30 sm:inset-x-4 lg:bottom-4"
          : "sticky bottom-4",
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
