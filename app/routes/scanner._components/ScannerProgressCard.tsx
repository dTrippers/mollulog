import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { cn } from "~/lib/utils";

export default function ScannerProgressCard({
  title,
  description,
  progress,
  segmentStatuses,
  segmentLabel,
  remainingLabel,
  etaLabel,
}: {
  title: string;
  description: string;
  progress: { completed: number; failed: number; total: number };
  segmentStatuses?: ReadonlyArray<string>;
  segmentLabel: string;
  remainingLabel: string;
  etaLabel: string;
}) {
  const processed = progress.completed + progress.failed;
  const remaining = Math.max(0, progress.total - processed);
  const percentage = progress.total > 0 ? (processed / progress.total) * 100 : 0;
  const segmentItems = segmentStatuses?.map((status, index) => ({ status, key: `${status}-${index}` }));

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="rounded-lg border border-primary/20 bg-primary/10 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ArrowPathIcon className="size-5 animate-spin" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {processed}/{progress.total}
              </p>
              <p className="text-xs text-muted-foreground">{segmentLabel}</p>
            </div>
          </div>
          <progress
            aria-label={`${segmentLabel} ${progress.total}개 중 ${processed}개 처리`}
            max={progress.total}
            value={processed}
            className="sr-only"
          />
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary/15" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          {segmentItems ? (
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {segmentItems.map(({ status, key }) => (
                <span
                  key={key}
                  className={cn(
                    "h-1.5 min-w-1 flex-1 rounded-full",
                    status === "succeeded"
                      ? "bg-primary"
                      : status === "failed"
                        ? "bg-destructive"
                        : status === "processing"
                          ? "animate-pulse bg-primary/60"
                          : "animate-pulse bg-primary/20",
                  )}
                />
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {remaining > 0 ? remainingLabel.replace("{remaining}", String(remaining)) : "인식 결과를 정리하고 있어요"}
            </span>
            <span>{etaLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
