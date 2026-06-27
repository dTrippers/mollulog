import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimelineSourceType } from "~/models/pyroxene-planner";
import type { PickupResources } from "~/domain/pyroxene-timeline";

type ChartEntry = {
  date: dayjs.Dayjs;
  source: {
    type: TimelineSourceType;
    description?: string;
    event?:
      | {
          name: string;
          recruitments?: {
            pickup: boolean;
            favorited: boolean;
            student: { name: string } | null;
          }[];
        }
      | undefined;
  };
  accumulatedResources: PickupResources;
  accumulatedResourcesBand?: {
    optimistic: PickupResources;
    pessimistic: PickupResources;
  };
  resourceDelta: PickupResources;
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
    const dayMap = new Map<
      string,
      {
        ts: number;
        pyroxene: number;
        pyroxeneBand: [number, number];
        consumedOneTimeTicket: number;
        consumedTenTimeTicket: number;
      }
    >();
    for (const entry of timeline) {
      const key = entry.date.format("YYYY-MM-DD");
      const previous = dayMap.get(key);
      const isPickupEvent = entry.source.type === "event";
      const optimisticPyroxene =
        entry.accumulatedResourcesBand?.optimistic.pyroxene ?? entry.accumulatedResources.pyroxene;
      const pessimisticPyroxene =
        entry.accumulatedResourcesBand?.pessimistic.pyroxene ?? entry.accumulatedResources.pyroxene;
      dayMap.set(key, {
        ts: entry.date.startOf("day").valueOf(),
        pyroxene: entry.accumulatedResources.pyroxene,
        // recharts 범위 영역: [하단(비관), 상단(낙관)] 튜플로 채움 밴드를 그립니다.
        pyroxeneBand: [pessimisticPyroxene, optimisticPyroxene],
        consumedOneTimeTicket:
          (previous?.consumedOneTimeTicket ?? 0) + (isPickupEvent ? Math.max(0, -entry.resourceDelta.oneTimeTicket) : 0),
        consumedTenTimeTicket:
          (previous?.consumedTenTimeTicket ?? 0) + (isPickupEvent ? Math.max(0, -entry.resourceDelta.tenTimeTicket) : 0),
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
  const zeroAxisColor = isDark ? "#d1d5db" : "#4b5563";
  const tooltipBg = isDark ? "#1f2937" : "#ffffff";
  const tooltipBorder = isDark ? "#374151" : "#e5e7eb";
  const tooltipText = isDark ? "#f9fafb" : "#111827";
  const bandFillColor = isDark ? "rgba(147, 197, 253, 0.16)" : "rgba(96, 165, 250, 0.18)";

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

  const allValues = chartData.flatMap((d) => [d.pyroxene, d.pyroxeneBand[0], d.pyroxeneBand[1]]);
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  const hasNegative = minValue < 0;

  const domainMin = Math.min(minValue, 0);
  const domainMax = maxValue;

  return (
    <div className="my-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 md:p-3" ref={containerRef}>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
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
              const item = payload[0].payload as {
                ts: number;
                pyroxene: number;
                pyroxeneBand: [number, number];
                consumedOneTimeTicket: number;
                consumedTenTimeTicket: number;
              };
              const [pessimistic, optimistic] = item.pyroxeneBand;
              // 밴드 폭이 있을 때만(픽업 누적 이후) 상·하위 10% 추정치를 함께 표시합니다.
              const hasBand = optimistic - pessimistic > 1;
              const hasConsumedTickets = item.consumedOneTimeTicket > 0 || item.consumedTenTimeTicket > 0;
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
                  {hasBand && (
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 1 }}>
                      <p style={{ color: axisColor, fontSize: 11 }}>
                        상위 10% {Math.round(optimistic).toLocaleString()}개
                      </p>
                      <p style={{ color: axisColor, fontSize: 11 }}>
                        하위 10% {Math.round(pessimistic).toLocaleString()}개
                      </p>
                    </div>
                  )}
                  {hasConsumedTickets && (
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 1 }}>
                      {item.consumedOneTimeTicket > 0 && (
                        <p style={{ color: axisColor, fontSize: 11 }}>
                          모집 티켓 {item.consumedOneTimeTicket.toLocaleString()}장 사용 가능
                        </p>
                      )}
                      {item.consumedTenTimeTicket > 0 && (
                        <p style={{ color: axisColor, fontSize: 11 }}>
                          10연 모집 티켓 {item.consumedTenTimeTicket.toLocaleString()}장 사용 가능
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            }}
          />
          {monthlyTicks.map((ts) => (
            <ReferenceLine key={`month-${ts}`} x={ts} stroke={gridColor} strokeDasharray="3 3" strokeWidth={1} />
          ))}
          <ReferenceLine
            y={0}
            stroke={zeroAxisColor}
            strokeOpacity={hasNegative ? 0.95 : 0.8}
            strokeWidth={hasNegative ? 2 : 1.5}
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
          {/* 1. 확률 분위수 밴드 (낙관~비관) — 옅은 채움, 선 없음 */}
          <Area
            type="monotone"
            dataKey="pyroxeneBand"
            stroke="none"
            fill={bandFillColor}
            fillOpacity={1}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            tooltipType="none"
          />
          {/* 3. 중앙선 (토글 기준값) — 맨 위, 선만 */}
          <Area
            type="monotone"
            dataKey="pyroxene"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="none"
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
            isAnimationActive={false}
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
