import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Select } from "~/components/v2/primitives/Select";
import { Defense } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { RaidStatistics } from "~/lib/ranks/stats";
import { defenseTypeLocale, raidTypeLocale } from "~/locales/ko";
import type { RaidScheduleListItem } from "~/models/raid";
import { formatTierLabel, TIER_COLORS } from "./raidTierVisual";
import { buildStudentRaidUsageChartData, getRaidDetailPath, type StudentRaidUsageDefenseFilter } from "./StudentRaidUsageChartModel";

const StudentRaidUsageBarChart = lazy(() => import("./StudentRaidUsageBarChart"));

type StudentRaidUsageChartProps = {
  releaseAt: UtcIsoString | null;
  raids: RaidScheduleListItem[];
  statistics: RaidStatistics[];
  title?: string | null;
};

const DEFENSE_FILTERS: Array<{ value: StudentRaidUsageDefenseFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: Defense.Light, label: defenseTypeLocale.light },
  { value: Defense.Heavy, label: defenseTypeLocale.heavy },
  { value: Defense.Special, label: defenseTypeLocale.special },
  { value: Defense.Elastic, label: defenseTypeLocale.elastic },
];

export default function StudentRaidUsageChart({ releaseAt, raids, statistics, title = "역대 편성 횟수" }: StudentRaidUsageChartProps) {
  const [selectedDefenseType, setSelectedDefenseType] = useState<StudentRaidUsageDefenseFilter>("all");
  const chartRootRef = useRef<HTMLDivElement>(null);
  const chartData = useMemo(
    () => buildStudentRaidUsageChartData({ releaseAt, raids, statistics, selectedDefenseType }),
    [releaseAt, raids, statistics, selectedDefenseType],
  );
  const yAxisMax = Math.max(24000, Math.ceil(chartData.yAxisMax / 8000) * 8000);
  const yAxisTicks = Array.from({ length: yAxisMax / 8000 + 1 }, (_, index) => index * 8000);
  const tierKeys = chartData.tierKeys.filter((key) => chartData.rows.some((row) => row[key as `tier${number}`] > 0));
  if (chartData.rows.length === 0) {
    return <p className="rounded-lg bg-v2-surface p-v2-block-p text-sm leading-[1.43] text-v2-fg-secondary">표시할 총력전/대결전 통계가 없어요</p>;
  }

  return (
    <section aria-label={title ?? "역대 편성 통계"}>
      {title ? <div className="mb-2 flex min-h-7 items-center"><h3 className="text-base leading-[1.4] font-semibold text-v2-fg" style={{ fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' }}>{title}</h3></div> : null}
      <div className="rounded-lg bg-v2-surface p-v2-block-p">
        <div ref={chartRootRef} className="relative">
        <div className="mb-[10px] flex items-center justify-end gap-2">
          <span className="text-xs leading-[1.43] text-v2-fg-tertiary" aria-hidden="true">방어 타입</span>
          <Select label="방어 타입" value={selectedDefenseType} options={DEFENSE_FILTERS} onChange={setSelectedDefenseType} className="[&>select]:!h-8 [&>select]:!min-h-8 [&>select]:!py-0" />
        </div>
        <section className="relative w-full overflow-visible" aria-label="총력전·대결전 시즌별 편성 횟수 차트">
          <Suspense fallback={<div className="h-[226px] w-full" />}>
            <StudentRaidUsageBarChart chartData={chartData} tierKeys={tierKeys} yAxisMax={yAxisMax} yAxisTicks={yAxisTicks} chartRootRef={chartRootRef} />
          </Suspense>
        </section>
        <ul aria-label="성급 범례" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-[1.43] text-v2-fg-secondary">
          {tierKeys.map((key) => <li key={key} className="inline-flex items-center gap-[5px]"><span className="size-2 rounded-[2px]" style={{ backgroundColor: TIER_COLORS[key] }} />{formatTierLabel(key)}</li>)}
        </ul>
        <div className="relative max-w-full overflow-hidden focus-within:overflow-x-auto">
          <table className="sr-only focus-within:not-sr-only focus-within:mt-2 focus-within:w-full focus-within:min-w-max border-separate border-spacing-0 bg-v2-surface text-sm leading-[1.43] text-v2-fg">
            <caption className="px-3 py-2 text-left font-semibold">총력전·대결전 시즌별 편성 횟수</caption>
            <thead>
              <tr>
                <th scope="col" className="min-w-64 border-b border-v2-divider px-3 py-2 text-left font-semibold whitespace-nowrap">시즌</th>
                <th scope="col" className="border-b border-v2-divider px-3 py-2 text-right font-semibold whitespace-nowrap">전체</th>
                <th scope="col" className="border-b border-v2-divider px-3 py-2 text-right font-semibold whitespace-nowrap">모집</th>
                <th scope="col" className="border-b border-v2-divider px-3 py-2 text-right font-semibold whitespace-nowrap">조력</th>
                {tierKeys.map((key) => <th key={key} scope="col" className="border-b border-v2-divider px-3 py-2 text-right font-semibold whitespace-nowrap">{formatTierLabel(key)}</th>)}
              </tr>
            </thead>
            <tbody>{chartData.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="min-w-64 border-b border-v2-divider px-3 py-2 text-left font-medium whitespace-nowrap">
                  <Link to={getRaidDetailPath(row)}>{raidTypeLocale[row.raidType]} #{row.seasonIndex} · {row.bossName} · {defenseTypeLocale[row.defenseType]}</Link>
                </th>
                <td className="border-b border-v2-divider px-3 py-2 text-right tabular-nums whitespace-nowrap">{row.totalCount.toLocaleString()}</td>
                <td className="border-b border-v2-divider px-3 py-2 text-right tabular-nums whitespace-nowrap">{row.slotCount.toLocaleString()}</td>
                <td className="border-b border-v2-divider px-3 py-2 text-right tabular-nums whitespace-nowrap">{row.assistCount.toLocaleString()}</td>
                {tierKeys.map((key) => <td key={key} className="border-b border-v2-divider px-3 py-2 text-right tabular-nums whitespace-nowrap">{row[key as `tier${number}`].toLocaleString()}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        </div>
      </div>
    </section>
  );
}
