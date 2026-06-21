import { useState } from "react";
import { Defense } from "~/graphql/graphql";
import { defenseTypeLocale } from "~/locales/ko";
import type { StudentBossUsageSummary } from "./StudentDifficultyUsageModel";
import { UsageBarList, UsageChartCard } from "./UsageBarChart";

type StudentBossUsageChartProps = {
  summary: StudentBossUsageSummary | null;
  loading: boolean;
};

const DEFENSE_BAR_CLASSES: Partial<Record<Defense, string>> = {
  [Defense.Light]: "bg-red-500",
  [Defense.Heavy]: "bg-yellow-400",
  [Defense.Special]: "bg-blue-500",
  [Defense.Elastic]: "bg-purple-500",
};

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function StudentBossUsageChart({ summary, loading }: StudentBossUsageChartProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = summary?.rows ?? [];
  const visibleRows = expanded ? rows : rows.slice(0, 6);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <UsageChartCard
      title="보스별 출전 비율"
      description="학생 출시 이후 총력전/대결전 환경별 출전 비율"
      summary={summary ? `${summary.totalScopeCount}곳 중 ${summary.usedScopeCount}곳 출전` : undefined}
      loading={loading}
      empty={!summary || summary.totalScopeCount === 0 || rows.length === 0}
      emptyText="보스별로 표시할 출전 기록이 부족해요"
    >
      <UsageBarList
        rows={visibleRows}
        getKey={(row) => row.key}
        getRatio={(row) => row.usageRate}
        labelClassName="w-20"
        renderLabel={(row) => <span className="truncate">{row.bossName}</span>}
        renderSubLabel={(row) => (
          <span className="text-neutral-500 dark:text-neutral-400">{defenseTypeLocale[row.defenseType]}</span>
        )}
        renderValue={(row) => `${formatUsagePercent(row.usageRate)} · ${row.usageCount.toLocaleString()}회`}
        getBarClassName={(row) => DEFENSE_BAR_CLASSES[row.defenseType] ?? "bg-neutral-400"}
      />
      {hiddenCount > 0 || expanded ? (
        <button
          type="button"
          className="mt-3 self-start text-xs font-semibold text-blue-600 hover:underline dark:text-blue-300"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "접기" : `+${hiddenCount}개 더 보기`}
        </button>
      ) : null}
    </UsageChartCard>
  );
}

function formatUsagePercent(value: number) {
  if (value > 0 && value < 0.001) {
    return "<0.1%";
  }
  return percentFormatter.format(value);
}
