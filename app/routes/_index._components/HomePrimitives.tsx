import { ArrowPathIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Button } from "~/components/v2/primitives/Button";
import type { HomeTimeChip as HomeTimeChipValue } from "~/domain/home-portal";
import { cn } from "~/lib/utils";
import { formatHomeTimeChip } from "./home-format";

// The retry action of a failed section: a text button with a refresh icon, so it reads as an action rather than a filled
// control. Every home retry uses it. The button's left padding is pulled back, so the icon lines up with the text edge of
// the tile it sits in; the hover background keeps the full button.
export function HomeRetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="text" className="-ml-3" onClick={onClick}>
      <ArrowPathIcon aria-hidden="true" className="size-4 shrink-0" />
      다시 시도
    </Button>
  );
}

// A section: the h2 title, an optional action on the right, then its blocks.
export function HomeSection({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold text-v2-fg md:text-xl">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-2 flex flex-col gap-v2-block-gap md:mt-3">{children}</div>
    </section>
  );
}

// The time chip sits at the top right of a tile. Its state text is read by screen readers, and the dot pulses only when
// motion is allowed. `dense` is the mobile step down for the raid, other-content, and birthday tiles: one size smaller
// below md, with the default sizes from md up.
export function HomeTimeChip({ chip, dense = false }: { chip: HomeTimeChipValue; dense?: boolean }) {
  const formatted = formatHomeTimeChip(chip);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-v2-inset px-2 py-0.5 font-medium whitespace-nowrap tabular-nums",
        dense ? "text-xs md:text-sm" : "text-sm",
      )}
    >
      {formatted.live ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-v2-live motion-safe:animate-pulse" />
      ) : (
        <CalendarDaysIcon
          aria-hidden="true"
          className={cn("text-v2-fg-tertiary", dense ? "size-3 md:size-3.5" : "size-3.5")}
        />
      )}
      {formatted.srPrefix ? <span className="sr-only">{formatted.srPrefix}</span> : null}
      <span className={formatted.live ? "text-v2-fg" : "text-v2-fg-secondary"}>{formatted.text}</span>
    </span>
  );
}

// The shared tile shape: kind label and chip on the first row, the name, then the detail line. `dense` steps the text
// down one size below md, for the raid, other-content, and birthday sections; md and up keep the default sizes.
export function HomeTile({
  label,
  icon,
  chip,
  name,
  detail,
  className,
  dense = false,
}: {
  label: string;
  icon?: ReactNode;
  chip?: HomeTimeChipValue | null;
  name: ReactNode;
  detail?: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg bg-v2-surface px-v2-block-p py-3 md:gap-1.5 md:py-v2-block-p",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-v2-fg-tertiary",
            dense ? "text-xs md:text-sm" : "text-sm",
          )}
        >
          {icon}
          <span className="truncate">{label}</span>
        </p>
        {chip ? <HomeTimeChip chip={chip} dense={dense} /> : null}
      </div>
      <div
        className={cn(
          "font-semibold break-keep text-v2-fg leading-6 md:leading-7",
          dense ? "text-base md:text-lg" : "text-lg",
        )}
      >
        {name}
      </div>
      {detail ? (
        <div className={cn("text-v2-fg-secondary", dense ? "text-xs md:text-sm" : "text-sm")}>{detail}</div>
      ) : null}
    </div>
  );
}

// A successful empty result. Its copy is shown as given, and the screen never fills the gap with another item.
export function HomeEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("flex items-center rounded-lg bg-v2-surface p-v2-block-p text-sm text-v2-fg-tertiary", className)}
    >
      {children}
    </div>
  );
}
