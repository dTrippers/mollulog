import { forwardRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

export type PageActionBarProps = {
  // The summary is a preview of what the primary action will do, such as the number of items to apply.
  summary: ReactNode;
  // A short line that qualifies the summary: a note, or a status such as an error count. Wide screens show it after the
  // summary on the same line; narrow screens put it under the summary.
  note?: ReactNode;
  // Status that belongs with the summary, such as a running task. Wide screens show it between the summary and the
  // actions; below the sm breakpoint it takes its own row under them, so the actions stay beside the summary.
  details?: ReactNode;
  children: ReactNode;
  // Sticky stays at the bottom of the main column (desktop). Fixed pins the bar above the mobile navigation bar on stacked layouts.
  placement?: "sticky" | "fixed";
  // On mobile the actions take their own row, and the last action (the primary) fills the rest. Desktop keeps its
  // content width.
  expandActions?: boolean;
  className?: string;
};

// Bottom action bar for the step's primary and secondary actions. The screen adds bottom padding while a fixed bar shows.
// The bar floats as a capsule in the inverse lightness of the page (dark over the light theme, light over the dark
// theme), translucent with a backdrop blur, so it reads as a layer above the content. From sm both placements center it
// at the width of its content; narrower screens span the screen with a margin.
export const PageActionBar = forwardRef<HTMLDivElement, PageActionBarProps>(function PageActionBar(
  { summary, note, details, children, placement = "sticky", expandActions = false, className },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "v2-floating-inverse z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] py-2 pr-2 shadow-lg backdrop-blur-md sm:gap-x-5",
        summary != null ? "pl-3.5 sm:pl-4.5" : "pl-2",
        placement === "fixed"
          ? "fixed inset-x-3 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-30 sm:inset-x-4 sm:mx-auto sm:w-fit lg:bottom-4"
          : "sticky bottom-4 sm:mx-auto sm:w-fit sm:max-w-full",
        className,
      )}
    >
      {summary != null ? (
        <div className="min-w-0 flex-1 basis-30 sm:flex sm:flex-none sm:basis-auto sm:items-baseline sm:gap-2.5">
          <div className="min-w-0 text-sm font-semibold text-v2-fg tabular-nums">{summary}</div>
          {note != null ? (
            <div className="mt-px min-w-0 text-xs font-medium text-v2-fg-secondary tabular-nums sm:mt-0">{note}</div>
          ) : null}
        </div>
      ) : null}
      {details != null ? (
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">{details}</div>
      ) : null}
      <div
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1.5",
          expandActions && "ml-0 w-full sm:ml-auto sm:w-auto [&>:last-child]:flex-1 sm:[&>:last-child]:flex-none",
        )}
      >
        {children}
      </div>
    </div>
  );
});
