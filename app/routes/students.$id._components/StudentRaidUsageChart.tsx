import { lazy, Suspense, useMemo, useState } from "react";
import { Dropdown, EmptyView, SectionCard } from "~/components/primitives";
import { Defense } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { RaidStatistics } from "~/lib/ranks/stats";
import { defenseTypeColor, defenseTypeLocale } from "~/locales/ko";
import type { RaidScheduleListItem } from "~/models/raid";
import { formatTierLabel, TIER_COLORS } from "./raidTierVisual";
import { buildStudentRaidUsageChartData, type StudentRaidUsageDefenseFilter } from "./StudentRaidUsageChartModel";

const StudentRaidUsageBarChart = lazy(() => import("./StudentRaidUsageBarChart"));

type StudentRaidUsageChartProps = {
  releaseAt: UtcIsoString | null;
  raids: RaidScheduleListItem[];
  statistics: RaidStatistics[];
  title?: string | null;
};

const DEFENSE_FILTERS: Array<{
  value: StudentRaidUsageDefenseFilter;
  label: string;
  color?: "red" | "yellow" | "green" | "blue" | "purple" | "grey";
}> = [
  { value: "all", label: "전체" },
  { value: Defense.Light, label: defenseTypeLocale.light, color: defenseTypeColor.light },
  { value: Defense.Heavy, label: defenseTypeLocale.heavy, color: defenseTypeColor.heavy },
  { value: Defense.Special, label: defenseTypeLocale.special, color: defenseTypeColor.special },
  { value: Defense.Elastic, label: defenseTypeLocale.elastic, color: defenseTypeColor.elastic },
];

export default function StudentRaidUsageChart({
  releaseAt,
  raids,
  statistics,
  title = "역대 편성 횟수",
}: StudentRaidUsageChartProps) {
  const [selectedDefenseType, setSelectedDefenseType] = useState<StudentRaidUsageDefenseFilter>("all");
  const chartData = useMemo(
    () =>
      buildStudentRaidUsageChartData({
        releaseAt,
        raids,
        statistics,
        selectedDefenseType,
      }),
    [releaseAt, raids, statistics, selectedDefenseType],
  );

  if (chartData.rows.length === 0) {
    return <EmptyView text="표시할 총력전/대결전 통계가 없어요" />;
  }

  return (
    <SectionCard title={title ?? undefined}>
      <div>
        <Dropdown
          label="방어 타입"
          value={selectedDefenseType}
          options={DEFENSE_FILTERS}
          onChange={setSelectedDefenseType}
          size="xs"
        />
      </div>
      <div className="h-52 w-full">
        <Suspense fallback={null}>
          <StudentRaidUsageBarChart chartData={chartData} />
        </Suspense>
      </div>
      <TierLegend tierKeys={chartData.tierKeys} />
    </SectionCard>
  );
}

function TierLegend({ tierKeys }: { tierKeys: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
      {tierKeys.map((tierKey) => (
        <span key={tierKey} className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ backgroundColor: TIER_COLORS[tierKey] ?? "#737373" }} />
          {formatTierLabel(tierKey)}
        </span>
      ))}
    </div>
  );
}
