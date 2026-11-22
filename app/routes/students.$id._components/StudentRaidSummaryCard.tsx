import type { StudentRaidSummary } from "./StudentRaidSummaryModel";

export default function StudentRaidSummaryCard({ summary }: { summary: StudentRaidSummary }) {
  const ownRatio = summary.totalCount > 0 ? summary.ownCount / summary.totalCount : 0;
  const assistRatio = summary.assistRatio ?? 0;
  return (
    <section className="flex min-w-0 flex-col" aria-label="모집 vs 조력">
      <div className="mb-2 flex min-h-7 items-center"><h3 className="text-base leading-[1.4] font-semibold text-v2-fg">모집 vs 조력</h3></div>
      <div className="flex-1 rounded-lg bg-v2-surface p-v2-block-p">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-v2-inset" role="img" aria-label={`모집 ${formatPercent(ownRatio)}, 조력 ${formatPercent(assistRatio)}`}>
          <span className="h-full bg-v2-fg" style={{ width: `${ownRatio * 100}%` }} />
          <span className="h-full bg-v2-switch-off" style={{ width: `${assistRatio * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px] leading-[1.43]">
          <span className="inline-flex items-center gap-1.5 text-v2-fg-secondary"><span className="size-2 rounded-[2px] bg-v2-fg" aria-hidden="true" />모집 학생</span>
          <span className="text-right font-medium text-v2-fg tabular-nums">{formatPercent(ownRatio)} · {summary.ownCount.toLocaleString()}회</span>
          <span className="inline-flex items-center gap-1.5 text-v2-fg-secondary"><span className="size-2 rounded-[2px] bg-v2-switch-off" aria-hidden="true" />조력 학생</span>
          <span className="text-right font-medium text-v2-fg tabular-nums">{formatPercent(assistRatio)} · {summary.assistCount.toLocaleString()}회</span>
        </div>
        <p className="mt-3 border-t border-v2-divider pt-[10px] text-[13px] leading-[1.43] text-v2-fg-secondary">
          <span className="font-semibold text-v2-fg">{summary.decision.value}</span> · {summary.decision.description}
        </p>
      </div>
    </section>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
