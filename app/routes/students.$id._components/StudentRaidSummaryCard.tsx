import type { StudentRaidSummary } from "./StudentRaidSummaryModel";
type StudentRaidSummaryCardProps = {
  summary: StudentRaidSummary;
};

export default function StudentRaidSummaryCard({ summary }: StudentRaidSummaryCardProps) {
  const ownRatio = summary.totalCount > 0 ? summary.ownCount / summary.totalCount : 0;
  const assistRatio = summary.assistRatio ?? 0;
  const { decision } = summary;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-base font-bold">모집 vs 조력</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div className="h-full bg-emerald-500 dark:bg-emerald-400" style={{ width: `${ownRatio * 100}%` }} />
          <div className="h-full bg-blue-500 dark:bg-blue-400" style={{ width: `${assistRatio * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="font-semibold text-emerald-600 dark:text-emerald-300">모집 학생</p>
            <p className="mt-1 tabular-nums text-neutral-500 dark:text-neutral-400">
              {formatPercent(ownRatio)} · {summary.ownCount.toLocaleString()}회
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-blue-600 dark:text-blue-300">조력 학생</p>
            <p className="mt-1 tabular-nums text-neutral-500 dark:text-neutral-400">
              {formatPercent(assistRatio)} · {summary.assistCount.toLocaleString()}회
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">{decision.value}</span> ·{" "}
        {decision.description}
      </p>
    </div>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
