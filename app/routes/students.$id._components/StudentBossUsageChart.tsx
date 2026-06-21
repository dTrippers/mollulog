import { useState } from "react";
import { Defense } from "~/graphql/graphql";
import { defenseTypeLocale, terrainLocale } from "~/locales/ko";
import type { StudentBossUsageSummary } from "./StudentDifficultyUsageModel";
import { UsageBarList, UsageChartCard } from "./UsageBarChart";
import { formatUsagePercent } from "./formatUsagePercent";

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

const DEFENSE_GRADIENT_FROM_CLASSES: Partial<Record<Defense, string>> = {
  [Defense.Light]: "from-red-500",
  [Defense.Heavy]: "from-yellow-400",
  [Defense.Special]: "from-blue-500",
  [Defense.Elastic]: "from-purple-500",
  [Defense.Composite]: "from-green-600",
  [Defense.Normal]: "from-neutral-400",
};

const DEFENSE_GRADIENT_TO_CLASSES: Partial<Record<Defense, string>> = {
  [Defense.Light]: "to-red-500",
  [Defense.Heavy]: "to-yellow-400",
  [Defense.Special]: "to-blue-500",
  [Defense.Elastic]: "to-purple-500",
  [Defense.Composite]: "to-green-600",
  [Defense.Normal]: "to-neutral-400",
};

function formatDefenseTypeSetLabel(defenseTypes: Defense[]) {
  if (defenseTypes.length <= 1) {
    return defenseTypeLocale[defenseTypes[0]] ?? "";
  }

  return defenseTypes
    .map((defenseType, index) => {
      const label = defenseTypeLocale[defenseType];
      return index === defenseTypes.length - 1 ? label : label.replace(/장갑$/, "");
    })
    .join("/");
}

function getDefenseBarClassName(defenseTypes: Defense[]) {
  if (defenseTypes.length <= 1) {
    return DEFENSE_BAR_CLASSES[defenseTypes[0]] ?? "bg-neutral-400";
  }

  const firstDefenseType = defenseTypes[0];
  const lastDefenseType = defenseTypes[defenseTypes.length - 1];
  const fromClass = DEFENSE_GRADIENT_FROM_CLASSES[firstDefenseType] ?? "from-neutral-400";
  const toClass = DEFENSE_GRADIENT_TO_CLASSES[lastDefenseType] ?? "to-neutral-400";
  return `bg-gradient-to-r ${fromClass} from-40% ${toClass} to-60%`;
}

export default function StudentBossUsageChart({ summary, loading }: StudentBossUsageChartProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = summary?.rows ?? [];
  const visibleRows = expanded ? rows : rows.slice(0, 6);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <UsageChartCard
      title="보스별 출전 횟수"
      description="학생의 활용도를 확인해보세요"
      loading={loading}
      empty={!summary || summary.totalScopeCount === 0 || rows.length === 0}
      emptyText="출전 기록이 부족해요"
    >
      <UsageBarList
        rows={visibleRows}
        getKey={(row) => row.key}
        getRatio={(row) => row.usageRate}
        labelClassName="w-20"
        renderLabel={(row) => <span className="truncate">{row.bossName}</span>}
        renderSubLabel={(row) => (
          <span className="text-neutral-500 dark:text-neutral-400">
            {terrainLocale[row.terrain]} · {formatDefenseTypeSetLabel(row.defenseTypes)}
          </span>
        )}
        renderValue={(row) => `${formatUsagePercent(row.usageRate)} · ${row.usageCount.toLocaleString()}회`}
        getBarClassName={(row) => getDefenseBarClassName(row.defenseTypes)}
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
