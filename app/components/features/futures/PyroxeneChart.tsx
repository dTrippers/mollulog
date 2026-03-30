import { useMemo, useEffect, useState, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import dayjs from "dayjs";
import type { TimelineSourceType } from "~/models/pyroxene-planner";

type ChartEntry = {
  date: dayjs.Dayjs;
  source: {
    type: TimelineSourceType;
    description?: string;
    event?: {
      name: string;
      recruitments?: {
        pickup: boolean;
        favorited: boolean;
        student: { name: string } | null;
      }[];
    } | undefined;
  };
  accumulatedResources: {
    pyroxene: number;
    oneTimeTicket: number;
    tenTimeTicket: number;
  };
};

type PyroxeneChartProps = {
  timeline: ChartEntry[];
};

const MARKER_TYPES: TimelineSourceType[] = ["event"];
const Y_AXIS_WIDTH = 40;
const LINE_HEIGHT = 11; // ~9px font + 2px gap
const LABEL_MIN_PX = 50; // minimum pixel gap before stagger kicks in
const LABEL_PADDING = 6; // extra gap between staggered label groups

const MARKER_COLORS: Partial<Record<TimelineSourceType, string>> = {
  event: "#3b82f6",
};

function formatYTick(v: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

export default function PyroxeneChart({ timeline }: PyroxeneChartProps) {
  const [isDark, setIsDark] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setIsDark(!!document.querySelector(".dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { chartData, markers } = useMemo(() => {
    const dayMap = new Map<string, { ts: number; pyroxene: number }>();
    for (const entry of timeline) {
      const key = entry.date.format("YYYY-MM-DD");
      dayMap.set(key, {
        ts: entry.date.startOf("day").valueOf(),
        pyroxene: entry.accumulatedResources.pyroxene,
      });
    }
    const chartData = Array.from(dayMap.values()).sort((a, b) => a.ts - b.ts);

    // Build raw markers, deduplicated by date
    const seenDates = new Set<string>();
    const rawMarkers: { ts: number; type: TimelineSourceType; students: string[] }[] = [];
    for (const entry of timeline) {
      if (!MARKER_TYPES.includes(entry.source.type)) continue;
      const dateKey = entry.date.format("YYYY-MM-DD");
      if (seenDates.has(dateKey)) continue;
      seenDates.add(dateKey);
      const students =
        entry.source.event?.recruitments
          ?.filter((r) => r.pickup && r.favorited && r.student)
          .map((r) => r.student?.name ?? "") ?? [];
      rawMarkers.push({ ts: entry.date.startOf("day").valueOf(), type: entry.source.type, students });
    }

    // Calculate yOffset for each marker to prevent label overlap
    const plotWidth = Math.max(containerWidth - Y_AXIS_WIDTH, 1);
    const minTs = chartData[0]?.ts ?? 0;
    const maxTs = chartData[chartData.length - 1]?.ts ?? 1;
    const dateRange = Math.max(maxTs - minTs, 1);

    function tsToX(ts: number): number {
      return ((ts - minTs) / dateRange) * plotWidth;
    }

    const markers: { ts: number; type: TimelineSourceType; students: string[]; yOffset: number }[] = [];
    for (const m of rawMarkers) {
      const prev = markers[markers.length - 1];
      let yOffset = 0;
      if (prev) {
        const dist = tsToX(m.ts) - tsToX(prev.ts);
        if (dist < LABEL_MIN_PX) {
          const prevLabelHeight = Math.max(prev.students.length, 1) * LINE_HEIGHT + LABEL_PADDING;
          yOffset = prev.yOffset + prevLabelHeight;
        }
      }
      markers.push({ ...m, yOffset });
    }

    return { chartData, markers };
  }, [timeline, containerWidth]);

  if (chartData.length < 2) return null;

  const axisColor = isDark ? "#6b7280" : "#9ca3af";
  const gridColor = isDark ? "#374151" : "#e5e7eb";
  const tooltipBg = isDark ? "#1f2937" : "#ffffff";
  const tooltipBorder = isDark ? "#374151" : "#e5e7eb";
  const tooltipText = isDark ? "#f9fafb" : "#111827";

  const monthlyTicks = (() => {
    if (chartData.length < 2) return [];
    const start = dayjs(chartData[0].ts);
    const end = dayjs(chartData[chartData.length - 1].ts);
    const ticks: number[] = [];
    let current = start.startOf("month").add(1, "month");
    while (!current.isAfter(end)) {
      ticks.push(current.valueOf());
      current = current.add(1, "month");
    }
    return ticks;
  })();

  const allValues = chartData.map((d) => d.pyroxene);
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  const hasNegative = minValue < 0;

  const domainMin = Math.min(minValue, 0);
  const domainMax = maxValue;
  const gradientSplit =
    domainMax - domainMin > 0
      ? Math.min(1, Math.max(0, domainMax / (domainMax - domainMin)))
      : 1;

  return (
    <div className="my-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 md:p-3" ref={containerRef}>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="pyroxeneChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset={gradientSplit} stopColor="#3b82f6" stopOpacity={0.05} />
              <stop offset={gradientSplit} stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            ticks={monthlyTicks}
            tickFormatter={(v) => dayjs(v as number).format("M/D")}
            tick={{ fontSize: 11, fill: axisColor }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYTick}
            tick={{ fontSize: 11, fill: axisColor }}
            axisLine={false}
            tickLine={false}
            width={Y_AXIS_WIDTH}
            orientation="right"
            domain={[domainMin, domainMax]}
            tickCount={3}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0].payload as { ts: number; pyroxene: number };
              return (
                <div
                  style={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p style={{ color: axisColor, fontSize: 11, marginBottom: 2 }}>
                    {dayjs(item.ts).format("YYYY-MM-DD")}
                  </p>
                  <p style={{ color: tooltipText, fontSize: 13, fontWeight: 600 }}>
                    {item.pyroxene.toLocaleString()}개
                  </p>
                </div>
              );
            }}
          />
          {monthlyTicks.map((ts) => (
            <ReferenceLine
              key={`month-${ts}`}
              x={ts}
              stroke={gridColor}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ))}
          <ReferenceLine
            y={0}
            stroke={gridColor}
            strokeDasharray={hasNegative ? undefined : "3 3"}
            strokeWidth={hasNegative ? 1.5 : 1}
          />
          {markers.map(({ ts, type, students, yOffset }) => (
            <ReferenceLine
              key={`${ts}-${type}`}
              x={ts}
              stroke={MARKER_COLORS[type]}
              strokeDasharray="3 3"
              strokeWidth={1}
              label={(props) => (
                <MarkerLabel
                  viewBox={props.viewBox as { x: number; y: number } | undefined}
                  students={students}
                  yOffset={yOffset}
                  isDark={isDark}
                />
              )}
            />
          ))}
          <Area
            type="monotone"
            dataKey="pyroxene"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#pyroxeneChartGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MarkerLabel({
  viewBox,
  students,
  yOffset,
  isDark,
}: {
  viewBox: { x: number; y: number } | undefined;
  students: string[];
  yOffset: number;
  isDark: boolean;
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const textColor = isDark ? "#ffffff" : "#111827";

  return (
    <g>
      {students.map((name, i) => (
        <text
          key={name}
          x={x + 5}
          y={y + 10 + yOffset + i * LINE_HEIGHT}
          fontSize={9}
          fontWeight="bold"
          fill={textColor}
          textAnchor="start"
          dominantBaseline="middle"
        >
          {name}
        </text>
      ))}
    </g>
  );
}
