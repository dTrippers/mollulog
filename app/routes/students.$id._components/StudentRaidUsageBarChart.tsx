import { Link, useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { raidTypeToParam } from "~/domain/raid";
import { formatInstant } from "~/lib/date-time";
import { defenseTypeLocale, raidTypeLocale } from "~/locales/ko";
import { formatTierLabel, TIER_COLORS } from "./raidTierVisual";
import type { StudentRaidUsageChartData, StudentRaidUsageChartRow } from "./StudentRaidUsageChartModel";

// Split from StudentRaidUsageChart and loaded lazily so recharts is not part of the route's initial bundle.
function formatCount(value: number) {
  if (value >= 10000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toString();
}

function getTooltipPayload(payload: unknown): StudentRaidUsageChartRow | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const item = payload[0] as { payload?: StudentRaidUsageChartRow };
  return item.payload ?? null;
}

function getBarPayload(entry: unknown): StudentRaidUsageChartRow | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const item = entry as { payload?: StudentRaidUsageChartRow };
  return item.payload ?? null;
}

function getRaidDetailPath(row: StudentRaidUsageChartRow) {
  const path = `/raids/${raidTypeToParam(row.raidType)}/${row.seasonIndex}`;
  if (row.raidType !== "elimination") {
    return path;
  }

  const params = new URLSearchParams({ defenseType: row.defenseType });
  return `${path}?${params.toString()}`;
}

export default function StudentRaidUsageBarChart({ chartData }: { chartData: StudentRaidUsageChartData }) {
  const displayTimeZone = useDisplayTimeZone();
  const navigate = useNavigate();
  const handleBarClick = (entry: unknown) => {
    const row = getBarPayload(entry);
    if (!row) {
      return;
    }

    navigate(getRaidDetailPath(row));
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData.rows} margin={{ top: 12, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          className="stroke-neutral-200 dark:stroke-neutral-700"
        />
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
              <Link
                to={getRaidDetailPath(item)}
                className="block rounded-md border border-neutral-200 bg-white p-3 text-sm shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
              >
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
              </Link>
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
            className="cursor-pointer"
            onClick={handleBarClick}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
