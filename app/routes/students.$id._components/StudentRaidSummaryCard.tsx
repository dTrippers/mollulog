import type { StudentRaidSummary } from "./StudentRaidSummaryModel";
import { formatTierLabel } from "./raidTierVisual";

type StudentRaidSummaryCardProps = {
  summary: StudentRaidSummary;
  signedIn: boolean;
};

export default function StudentRaidSummaryCard({ summary, signedIn }: StudentRaidSummaryCardProps) {
  const ownRatio = summary.totalCount > 0 ? summary.ownCount / summary.totalCount : 0;
  const assistRatio = summary.assistRatio ?? 0;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-base font-bold">모집 판단 요약</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            최근 2년 총력전/대결전 통계를 본대와 조력으로 나눠 봅니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm md:min-w-64">
          <Metric label="본대" value={`${summary.ownCount.toLocaleString()}회`} />
          <Metric label="조력" value={`${summary.assistCount.toLocaleString()}회`} />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>본대 {formatPercent(ownRatio)}</span>
          <span>조력 {formatPercent(assistRatio)}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div className="h-full bg-neutral-700 dark:bg-neutral-50" style={{ width: `${ownRatio * 100}%` }} />
          <div className="h-full bg-blue-500 dark:bg-blue-400" style={{ width: `${assistRatio * 100}%` }} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-neutral-200 pt-4 dark:border-neutral-700 md:grid-cols-3">
        <DecisionLine
          label="판정"
          value={summary.sampleMessage ?? summary.verdict ?? "판정할 통계가 아직 부족해요."}
        />
        <DecisionLine
          label="주력 투자"
          value={summary.medianTier == null ? "본대 투자 표본이 부족해요." : `${formatTierLabel(summary.medianTier)} 중심`}
        />
        <DecisionLine label="내 스펙" value={getMyTierText(summary, signedIn)} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );
}

function DecisionLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-sm text-neutral-800 dark:text-neutral-100">{value}</p>
    </div>
  );
}

function getMyTierText(summary: StudentRaidSummary, signedIn: boolean) {
  if (!signedIn) {
    return "로그인하면 내 보유 티어와 비교할 수 있어요.";
  }
  if (summary.myTier == null) {
    return summary.myTierVerdict ?? "미보유 상태예요.";
  }
  const percentileText =
    summary.myTierPercentile == null ? "" : ` · 본대 ${formatPercent(summary.myTierPercentile)}가 내 티어 이하`;
  return `${formatTierLabel(summary.myTier)} 보유${percentileText}. ${summary.myTierVerdict ?? ""}`.trim();
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
