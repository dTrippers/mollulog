import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dropdown, EmptyView } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { type Attack, Defense } from "~/graphql/graphql";
import { formatInstant, type UtcIsoString } from "~/lib/date-time";
import type { RaidStatistics } from "~/lib/ranks/stats";
import { defenseTypeColor, defenseTypeLocale, raidTypeLocale } from "~/locales/ko";
import type { RaidScheduleListItem } from "~/repositories";
import {
  buildStudentRaidUsageChartData,
  getDefaultRaidUsageDefenseFilter,
  type StudentRaidUsageChartRow,
  type StudentRaidUsageDefenseFilter,
} from "./StudentRaidUsageChartModel";

type StudentRaidUsageChartProps = {
  attackType: Attack;
  releaseAt: UtcIsoString | null;
  raids: RaidScheduleListItem[];
  statistics: RaidStatistics[];
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

const TIER_COLORS: Record<string, string> = {
  tier9: "#ec4899",
  tier8: "#d946ef",
  tier7: "#8b5cf6",
  tier6: "#3b82f6",
  tier5: "#06b6d4",
  tier4: "#22c55e",
  tier3: "#eab308",
  tier2: "#f97316",
  tier1: "#ef4444",
};

function formatCount(value: number) {
  if (value >= 10000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toString();
}

function formatTierLabel(tierKey: string) {
  const tier = Number(tierKey.replace("tier", ""));
  if (tier > 5) {
    return `고유 ${tier - 5}`;
  }
  return `★${tier}`;
}

function getTooltipPayload(payload: unknown): StudentRaidUsageChartRow | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const item = payload[0] as { payload?: StudentRaidUsageChartRow };
  return item.payload ?? null;
}

export default function StudentRaidUsageChart({ attackType, releaseAt, raids, statistics }: StudentRaidUsageChartProps) {
  const displayTimeZone = useDisplayTimeZone();
  const [selectedDefenseType, setSelectedDefenseType] = useState<StudentRaidUsageDefenseFilter>(() =>
    getDefaultRaidUsageDefenseFilter(attackType),
  );
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
    <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-3 flex flex-col gap-1">
        <p className="text-base font-bold">역대 편성 횟수</p>
      </div>
      <div className="mb-2">
        <Dropdown
          label="방어 타입"
          value={selectedDefenseType}
          options={DEFENSE_FILTERS}
          onChange={setSelectedDefenseType}
          size="xs"
        />
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData.rows} margin={{ top: 12, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-neutral-200 dark:stroke-neutral-700" />
            <XAxis
              dataKey="id"
              tickFormatter={(_, index) => {
                const row = chartData.rows[index];
                return row ? row.xAxisLabel : "";
              }}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              width={42}
              orientation="right"
              domain={[0, chartData.yAxisMax > 0 ? chartData.yAxisMax : 1]}
              tickFormatter={(value) => formatCount(Number(value))}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
              content={({ active, payload }) => {
                const item = active ? getTooltipPayload(payload) : null;
                if (!item) {
                  return null;
                }

                return (
                  <div className="rounded-md border border-neutral-200 bg-white p-3 text-sm shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {formatInstant(item.startAt, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })}
                    </p>
                    <p className="mt-1 font-semibold">
                      {raidTypeLocale[item.raidType]} #{item.seasonIndex} · {item.bossName} ·{" "}
                      {defenseTypeLocale[item.defenseType]}
                    </p>
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      전체 {item.totalCount.toLocaleString()}회 · 모집 {item.slotCount.toLocaleString()}회 · 조력{" "}
                      {item.assistCount.toLocaleString()}회
                    </p>
                    <div className="mt-2 space-y-1">
                      {chartData.tierKeys
                        .filter((tierKey) => (item[tierKey as `tier${number}`] ?? 0) > 0)
                        .map((tierKey) => (
                          <div key={tierKey} className="flex items-center justify-between gap-4 text-xs">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="size-2 rounded-sm"
                                style={{ backgroundColor: TIER_COLORS[tierKey] ?? "#737373" }}
                              />
                              {formatTierLabel(tierKey)}
                            </span>
                            <span>{item[tierKey as `tier${number}`].toLocaleString()}회</span>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              }}
            />
            {chartData.tierKeys.map((tierKey) => (
              <Bar
                key={tierKey}
                dataKey={tierKey}
                stackId="usage"
                fill={TIER_COLORS[tierKey] ?? "#737373"}
                maxBarSize={32}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TierLegend tierKeys={chartData.tierKeys} />
    </div>
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
