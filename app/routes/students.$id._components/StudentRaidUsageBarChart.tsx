import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { Link, useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant } from "~/lib/date-time";
import { defenseTypeLocale, raidTypeLocale } from "~/locales/ko";
import { formatTierLabel, TIER_COLORS } from "./raidTierVisual";
import {
  getRaidDetailPath,
  getStudentRaidUsageChartLayout,
  observeStudentRaidUsageChartFrameWidth,
  type StudentRaidUsageChartData,
  type StudentRaidUsageChartRow,
} from "./StudentRaidUsageChartModel";

// Split from StudentRaidUsageChart and loaded lazily so recharts is not part of the route's initial bundle.
function formatCount(value: number) {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return value.toString();
}

function getTooltipPayload(payload: unknown): StudentRaidUsageChartRow | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  return (payload[0] as { payload?: StudentRaidUsageChartRow }).payload ?? null;
}

function getBarPayload(entry: unknown): StudentRaidUsageChartRow | null {
  if (!entry || typeof entry !== "object") return null;
  return (entry as { payload?: StudentRaidUsageChartRow }).payload ?? null;
}

type StudentRaidUsageBarChartProps = {
  chartData: StudentRaidUsageChartData;
  tierKeys: string[];
  yAxisMax: number;
  yAxisTicks: number[];
  // The chart card's inner box, which places the tooltip beside the hovered bar.
  chartRootRef: RefObject<HTMLDivElement | null>;
};

export default function StudentRaidUsageBarChart({ chartData, tierKeys, yAxisMax, yAxisTicks, chartRootRef }: StudentRaidUsageBarChartProps) {
  const timeZone = useDisplayTimeZone();
  const navigate = useNavigate();
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const [chartFrameWidth, setChartFrameWidth] = useState(0);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredBarBounds, setHoveredBarBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | undefined>();
  useEffect(() => {
    const frame = chartFrameRef.current;
    if (!frame) return;
    return observeStudentRaidUsageChartFrameWidth(frame, (width) => {
      setChartFrameWidth((current) => current === width ? current : width);
    });
  }, []);
  const { compactBarSlots, barSize } = getStudentRaidUsageChartLayout(chartFrameWidth, chartData.rows.length);
  const handleBarClick = (entry: unknown) => {
    const row = getBarPayload(entry);
    if (row) navigate(getRaidDetailPath(row));
  };
  const handleBarMouseEnter = (_entry: unknown, _index: number, event: MouseEvent<SVGElement>) => {
    const root = chartRootRef.current;
    const frame = chartFrameRef.current;
    if (!root || !frame) return;

    const hoveredRect = (event.currentTarget as SVGGraphicsElement).getBoundingClientRect();
    const series = [...frame.querySelectorAll<SVGGElement>(".recharts-bar-rectangles")];
    const rects = series
      .flatMap((group) => [...group.querySelectorAll<SVGGraphicsElement>(".recharts-rectangle")])
      .map((rect) => rect.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0 && Math.abs(rect.left - hoveredRect.left) < 0.5);
    const left = Math.min(...rects.map((rect) => rect.left), hoveredRect.left);
    const right = Math.max(...rects.map((rect) => rect.right), hoveredRect.right);
    const top = Math.min(...rects.map((rect) => rect.top), hoveredRect.top);
    const bottom = Math.max(...rects.map((rect) => rect.bottom), hoveredRect.bottom);
    const rootRect = root.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const localLeft = left - rootRect.left;
    const localRight = right - rootRect.left;
    const tooltipLeft = localRight + 8 + 240 > rootRect.width ? localLeft - 248 : localRight + 8;

    setHoveredBarIndex(_index);
    setHoveredBarBounds({ left: left - frameRect.left, top: top - frameRect.top, width: right - left, height: bottom - top });
    setTooltipPosition({ x: tooltipLeft - (frameRect.left - rootRect.left), y: 28 - (frameRect.top - rootRect.top) });
  };
  const clearBarHover = () => {
    setHoveredBarIndex(null);
    setHoveredBarBounds(null);
    setTooltipPosition(undefined);
  };


  return (
    <div ref={chartFrameRef} className="relative h-[226px] w-full [&_.recharts-surface]:overflow-visible">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData.rows} margin={{ top: 0, right: 4, bottom: 0, left: 0 }} barCategoryGap={0} barGap={0} onMouseLeave={clearBarHover}>
          <CartesianGrid vertical={false} stroke="var(--v2-inset)" strokeDasharray="0" />
          <XAxis
            dataKey="id"
            tickFormatter={(_, index) => chartData.rows[index]?.xAxisLabel ?? ""}
            tick={{ fontSize: 11, fill: "var(--v2-fg-tertiary)" }}
            axisLine={false}
            tickLine={false}
            height={18}
            interval={0}
          />
          <YAxis
            width={30}
            orientation="right"
            domain={[0, yAxisMax]}
            ticks={yAxisTicks}
            tickFormatter={(value) => formatCount(Number(value))}
            tick={{ fontSize: 11, fill: "var(--v2-fg-tertiary)", dy: -8 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={false}
            position={tooltipPosition}
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 10, maxWidth: "min(15rem, calc(100vw - 2rem))" }}
            content={({ active, payload }) => {
              const row = active ? getTooltipPayload(payload) : null;
              return row ? (
                <Link to={getRaidDetailPath(row)} className="block w-[min(15rem,calc(100vw-2rem))] break-words rounded-lg bg-v2-popover-surface p-3 text-v2-fg shadow-md ring-1 ring-v2-popover-divider backdrop-blur-[4px] hover:bg-v2-surface">
                  <p className="text-xs leading-[1.43] text-v2-fg-tertiary tabular-nums">{formatInstant(row.startAt, { timeZone, format: "YYYY/MM/DD" })}</p>
                  <p className="mt-0.5 text-[13px] leading-[1.43] font-semibold">{raidTypeLocale[row.raidType]} #{row.seasonIndex} · {row.bossName} · {defenseTypeLocale[row.defenseType]}</p>
                  <div className="mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs leading-[1.43] text-v2-fg-secondary">
                    <span>전체</span><span className="text-right font-medium text-v2-fg tabular-nums">{row.totalCount.toLocaleString()}회</span>
                    <span>모집</span><span className="text-right font-medium text-v2-fg tabular-nums">{row.slotCount.toLocaleString()}회</span>
                    <span>조력</span><span className="text-right font-medium text-v2-fg tabular-nums">{row.assistCount.toLocaleString()}회</span>
                    <span className="col-span-2 my-1 border-t border-v2-popover-divider" aria-hidden="true" />
                    {tierKeys.filter((key) => row[key as `tier${number}`] > 0).map((key) => (
                      <div key={key} className="col-span-2 grid grid-cols-[auto_auto] gap-x-4">
                        <span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ backgroundColor: TIER_COLORS[key] }} />{formatTierLabel(key)}</span>
                        <span className="text-right font-medium text-v2-fg tabular-nums">{row[key as `tier${number}`].toLocaleString()}회</span>
                      </div>
                    ))}
                  </div>
                </Link>
              ) : null;
            }}
          />
          {tierKeys.map((key, tierIndex) => (
            <Bar key={key} dataKey={key} stackId="usage" fill={TIER_COLORS[key]} stroke="var(--v2-surface)" strokeWidth={compactBarSlots ? 0 : 1} barSize={barSize} radius={tierIndex === tierKeys.length - 1 ? [2, 2, 0, 0] : 0} maxBarSize={32} isAnimationActive={false} className="cursor-pointer" onClick={handleBarClick} onMouseEnter={handleBarMouseEnter}>
              {chartData.rows.map((row, index) => <Cell key={row.id} style={hoveredBarIndex === index ? { filter: "brightness(1.08)" } : undefined} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {hoveredBarBounds ? <div aria-hidden="true" className="pointer-events-none absolute z-[5] rounded-[2px] border border-v2-fg" style={hoveredBarBounds} /> : null}
    </div>
  );
}
