import { useState } from "react";
import type { Defense } from "~/graphql/graphql";
import { defenseTypeLocale, terrainLocale } from "~/locales/ko";
import { formatUsagePercent } from "./formatUsagePercent";
import type { StudentBossUsageSummary } from "./StudentDifficultyUsageModel";
import { UsageBarList, UsageChartCard } from "./UsageBarChart";

const defenseTypeColor: Record<Defense, string> = {
  light: "red",
  heavy: "yellow",
  special: "blue",
  elastic: "purple",
  composite: "green",
  normal: "grey",
};

function formatDefenseTypeSetLabel(defenseTypes: Defense[]) {
  if (defenseTypes.length <= 1) return defenseTypeLocale[defenseTypes[0]] ?? "";
  return defenseTypes.map((type, index) => {
    const label = defenseTypeLocale[type];
    return index === defenseTypes.length - 1 ? label : label.replace(/장갑$/, "");
  }).join("/");
}

export default function StudentBossUsageChart({
  summary,
  loading,
  failed = false,
  onRetry,
}: {
  summary: StudentBossUsageSummary | null;
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = summary?.rows ?? [];
  const visibleRows = expanded ? rows : rows.slice(0, 6);
  const hiddenCount = rows.length - visibleRows.length;
  return (
    <UsageChartCard title="보스별 출전 횟수" loading={loading} failed={failed} onRetry={onRetry} empty={!summary || summary.totalScopeCount === 0 || rows.length === 0} emptyText="출전 기록이 부족해요">
      <UsageBarList
        variant="boss"
        rows={visibleRows}
        getKey={(row) => row.key}
        getRatio={(row) => row.usageRate}
        renderLabel={(row) => <span className="truncate">{row.bossName}</span>}
        renderSubLabel={(row) => (
          <>
            {row.defenseTypes[0] ? <span aria-hidden="true" className={`h-3 w-0.5 rounded-full bg-v2-attr-${defenseTypeColor[row.defenseTypes[0]]}`} /> : null}
            {terrainLocale[row.terrain]} · {formatDefenseTypeSetLabel(row.defenseTypes)}
          </>
        )}
        renderValue={(row) => `${formatUsagePercent(row.usageRate)} · ${row.usageCount.toLocaleString()}회`}
      />
      {hiddenCount > 0 || expanded ? (
        <button type="button" className="mt-1.5 inline-flex min-h-7 items-center rounded-md px-2 text-xs leading-[1.43] font-medium text-v2-fg-secondary hover:bg-v2-hover" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "접기" : `+${hiddenCount}개 더 보기`}
        </button>
      ) : null}
    </UsageChartCard>
  );
}
