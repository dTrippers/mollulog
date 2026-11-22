import { ArrowPathIcon, XCircleIcon } from "@heroicons/react/24/outline";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "~/components/v2/primitives/Button";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { cn } from "~/lib/utils";

type UsageChartCardProps = {
  title: string;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
};

type UsageBarListProps<T> = {
  variant: "investment" | "boss" | "difficulty";
  rows: T[];
  getKey: (row: T) => string;
  getRatio: (row: T) => number;
  renderLabel: (row: T) => ReactNode;
  renderDescription?: (row: T) => ReactNode;
  renderSubLabel?: (row: T) => ReactNode;
  isHighlighted?: (row: T) => boolean;
  /** Read out on a highlighted row, which is otherwise marked only by its fill. */
  highlightLabel?: string;
  renderValue: (row: T) => ReactNode;
  getBarStyle?: (row: T) => CSSProperties;
};

export function UsageChartCard({ title, loading = false, failed = false, onRetry, empty = false, emptyText = "표시할 기록이 부족해요", children }: UsageChartCardProps) {
  return (
    <section className="flex min-w-0 flex-col" aria-label={title}>
      <div className="mb-2 flex min-h-7 items-center"><h3 className="text-base leading-[1.4] font-semibold text-v2-fg">{title}</h3></div>
      <div className="flex min-w-0 flex-1 flex-col rounded-lg bg-v2-surface p-v2-block-p">
        {loading ? (
          <div aria-busy="true" className="space-y-3">
            {["skeleton-row-1", "skeleton-row-2", "skeleton-row-3", "skeleton-row-4"].map((key) => <div key={key} className="grid grid-cols-[5rem_minmax(0,1fr)_4rem] items-center gap-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-2 w-full" /><Skeleton className="h-3 w-full" /></div>)}
          </div>
        ) : null}
        {!loading && failed ? (
          <StatusNotice className="[&>svg]:hidden [&>div:last-child]:-my-1" tone="danger" action={onRetry ? <Button variant="text" size="sm" onClick={onRetry}><ArrowPathIcon className="size-3.5" aria-hidden="true" />다시 시도</Button> : undefined}>
            <span className="relative block pl-6 leading-[1.43]"><XCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-danger" aria-hidden="true" />분석 정보를 불러오지 못했어요</span>
          </StatusNotice>
        ) : null}
        {!loading && !failed && empty ? (
          <p className="py-4 text-center text-sm leading-[1.43] text-v2-fg-secondary">{emptyText}</p>
        ) : !loading && !empty ? children : null}
      </div>
    </section>
  );
}

// The row the signed-in Sensei's own student falls in: a faint fill with a hairline ring, pulled out
// by its own padding so the label, bar, and value columns stay aligned with the other rows.
const MY_TIER_HIGHLIGHT_CLASS_NAME = "-mx-1.5 rounded-md bg-v2-fg/8 px-1.5 ring-1 ring-v2-fg/15";

export function UsageBarLegendHighlight({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2.5 flex items-center gap-1.5 text-xs leading-[1.43] text-v2-fg-tertiary">
      <span className="size-3 shrink-0 rounded-[3px] bg-v2-fg/8 ring-1 ring-v2-fg/15" aria-hidden="true" />
      {children}
    </p>
  );
}

export function UsageBarList<T>({ variant, rows, getKey, getRatio, renderLabel, renderDescription, renderSubLabel, isHighlighted, highlightLabel, renderValue, getBarStyle }: UsageBarListProps<T>) {
  if (variant === "boss") {
    return (
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={getKey(row)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5">
            <div className="truncate text-sm leading-[1.43] font-medium text-v2-fg">{renderLabel(row)}</div>
            <div className="self-center whitespace-nowrap text-right text-[13px] leading-[1.43] text-v2-fg-secondary tabular-nums">{renderValue(row)}</div>
            {renderSubLabel ? <div className="inline-flex items-center gap-1.5 text-xs leading-[1.43] text-v2-fg-tertiary">{renderSubLabel(row)}</div> : <span aria-hidden="true" />}
            <span aria-hidden="true" />
            <div className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full bg-v2-inset">
              <div className="h-full rounded-full bg-v2-fg-secondary" style={{ width: `${Math.min(Math.max(getRatio(row), 0), 1) * 100}%`, ...getBarStyle?.(row) }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "difficulty") {
    return (
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={getKey(row)}>
            <div className="flex items-center justify-between gap-2 text-sm leading-[1.43]">
              <div className="min-w-0 truncate font-medium text-v2-fg">{renderLabel(row)}</div>
              <div className="shrink-0 whitespace-nowrap text-[13px] leading-[1.43] text-v2-fg-secondary tabular-nums">{renderValue(row)}</div>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-v2-inset">
              <div className="h-full rounded-full bg-v2-fg-secondary" style={{ width: `${Math.min(Math.max(getRatio(row), 0), 1) * 100}%`, ...getBarStyle?.(row) }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // One grid for every row: the label and value columns take their widest content, and the bar takes the rest.
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5">
      {rows.map((row) => {
        const ratio = getRatio(row);
        const description = renderDescription?.(row);
        const highlighted = isHighlighted?.(row) ?? false;
        return (
          <div
            key={getKey(row)}
            className={cn(
              "col-span-3 grid min-h-[26px] grid-cols-subgrid items-center text-[13px] leading-[1.43]",
              highlighted && MY_TIER_HIGHLIGHT_CLASS_NAME,
            )}
          >
            <div className="min-w-0">
              <div className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap font-medium text-v2-fg">
                {renderLabel(row)}
                {description ? <small className="text-[11px] font-normal text-v2-fg-tertiary">{description}</small> : null}
                {highlighted && highlightLabel ? <span className="sr-only">{highlightLabel}</span> : null}
              </div>
            </div>
            <div className="min-w-0">
              {/* The highlight fill matches the inset track, so the highlighted row lifts its track. */}
              <div className={cn("h-2 w-full rounded-full", highlighted ? "bg-v2-fg/12" : "bg-v2-inset")}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`, minWidth: ratio > 0 ? 2 : undefined, backgroundColor: "var(--v2-fg-secondary)", ...getBarStyle?.(row) }} />
              </div>
            </div>
            <div className="whitespace-nowrap text-right text-[13px] text-v2-fg-secondary tabular-nums">{renderValue(row)}</div>
          </div>
        );
      })}
    </div>
  );
}
