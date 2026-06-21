import type { CSSProperties, ReactNode } from "react";
import { EmptyView, LoadingSkeleton } from "~/components/primitives";
import { cn } from "~/lib/utils";

type UsageChartCardProps = {
  title: string;
  description?: string;
  summary?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
};

type UsageBarListProps<T> = {
  rows: T[];
  getKey: (row: T) => string;
  getRatio: (row: T) => number;
  labelClassName?: string;
  renderLabel: (row: T) => ReactNode;
  renderSubLabel?: (row: T) => ReactNode;
  renderValue: (row: T) => ReactNode;
  getBarClassName?: (row: T) => string;
  getBarStyle?: (row: T) => CSSProperties;
};

export function UsageChartCard({
  title,
  description,
  summary,
  loading = false,
  empty = false,
  emptyText = "표시할 기록이 부족해요",
  children,
}: UsageChartCardProps) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-base font-bold">{title}</p>
          {summary ? <div className="text-xs text-neutral-500 dark:text-neutral-400">{summary}</div> : null}
        </div>
        {description ? <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p> : null}
      </div>

      {loading ? (
        <LoadingSkeleton noOuterMargin className="-mt-4" />
      ) : empty ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyView className="my-0" text={emptyText} />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function UsageBarList<T>({
  rows,
  getKey,
  getRatio,
  labelClassName,
  renderLabel,
  renderSubLabel,
  renderValue,
  getBarClassName,
  getBarStyle,
}: UsageBarListProps<T>) {
  return (
    <div className="space-y-0.5">
      {rows.map((row) => {
        const ratio = getRatio(row);

        return (
          <div key={getKey(row)} className="flex h-9 items-start gap-1 rounded-md py-1 text-sm">
            <div
              className={cn(
                "flex h-3 shrink-0 items-center font-medium leading-none text-neutral-700 dark:text-neutral-300",
                labelClassName,
              )}
            >
              {renderLabel(row)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex h-3 items-center">
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    className={cn("h-2 rounded-full transition-all duration-300", getBarClassName?.(row))}
                    style={{
                      width: `${Math.min(ratio, 1) * 100}%`,
                      minWidth: ratio > 0 ? 2 : undefined,
                      ...getBarStyle?.(row),
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs leading-none">
                <span className="min-w-0 truncate">{renderSubLabel?.(row)}</span>
                <span className="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">{renderValue(row)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
