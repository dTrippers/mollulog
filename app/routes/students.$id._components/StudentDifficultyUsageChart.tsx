import type { ReactNode } from "react";
import { LoadingSkeleton } from "~/components/primitives";
import { difficultyLocale } from "~/locales/ko";
import type { StudentDifficultyUsage } from "./StudentDifficultyUsageModel";

type StudentDifficultyUsageChartProps = {
  rows: StudentDifficultyUsage[];
  loading: boolean;
};

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function StudentDifficultyUsageChart({ rows, loading }: StudentDifficultyUsageChartProps) {
  if (loading) {
    return (
      <CardShell>
        <Header />
        <LoadingSkeleton />
      </CardShell>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  const maxRate = Math.max(1, ...rows.map((row) => row.usageRate));

  return (
    <CardShell>
      <Header />
      <div className="space-y-4">
        {rows.map((row) => {
          const ownWidth = `${(row.ownRate / maxRate) * 100}%`;
          const assistWidth = `${(row.assistRate / maxRate) * 100}%`;

          return (
            <div key={row.difficulty} className="flex items-center gap-3 text-sm">
              <div className="w-20 shrink-0">
                <p className="font-medium text-neutral-800 dark:text-neutral-200">
                  {difficultyLocale[row.difficulty] ?? row.difficulty}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  표본 {row.sampleSize.toLocaleString()}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {percentFormatter.format(row.usageRate)}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    본대 {row.ownCount.toLocaleString()} · 조력 {row.assistCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div className="bg-blue-500" style={{ width: ownWidth }} />
                  <div className="bg-cyan-400" style={{ width: assistWidth }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-blue-500" />
          본대
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-cyan-400" />
          조력
        </span>
      </div>
    </CardShell>
  );
}

function Header() {
  return (
    <div className="mb-4">
      <p className="text-base font-bold">난이도별 출전</p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">최근 2년 플래티넘 표본 기준입니다.</p>
    </div>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      {children}
    </div>
  );
}
