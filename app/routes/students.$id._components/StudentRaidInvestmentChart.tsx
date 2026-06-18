import type { StudentRaidSummary } from "./StudentRaidSummaryModel";
import { formatTierKey, formatTierLabel, TIER_COLORS } from "./raidTierVisual";

type StudentRaidInvestmentChartProps = {
  summary: StudentRaidSummary;
  signedIn: boolean;
};

export default function StudentRaidInvestmentChart({ summary, signedIn }: StudentRaidInvestmentChartProps) {
  const rows = [...summary.distribution].sort((a, b) => b.tier - a.tier);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-bold">투자도 분포</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">최근 2년 본대 슬롯 기준입니다.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">대표값</p>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {summary.medianTier == null ? "표본 부족" : formatTierLabel(summary.medianTier)}
          </p>
        </div>
      </div>

      {summary.ownCount === 0 ? (
        <div className="rounded-md bg-neutral-100 px-3 py-4 text-center text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          최근 2년 본대 투자 표본이 없어요.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ tier, count, ratio }) => (
            <div key={tier} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 font-medium text-neutral-700 dark:text-neutral-300">{formatTierLabel(tier)}</span>
              <div className="min-w-0 flex-1">
                <div className="relative h-2 rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ width: `${ratio * 100}%`, backgroundColor: TIER_COLORS[formatTierKey(tier)] }}
                  />
                </div>
                {signedIn && summary.myTier === tier && (
                  <p className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">▲ 내 보유</p>
                )}
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-neutral-500 dark:text-neutral-400">
                {formatPercent(ratio)} · {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
