import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getPyroxeneEventStatus, isTargetEventEntry } from "~/domain/pyroxene-planner-view";
import type { Timeline } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { formatAmount } from "./pyroxene-ui";

type ChartPoint = {
  ts: number;
  balance: number;
  range: [number, number] | null;
  event?: { name: string; marker: number; short: boolean };
};

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${value < 0 ? "−" : ""}${Math.round(Math.abs(value) / 1000)}k`;
  return formatAmount(value);
}

// Keeps the last point of each day, so a day with many income rows draws one step.
function buildPoints(timeline: Timeline, markers: ReadonlyMap<string, number>): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const entry of timeline) {
    const ts = entry.date.startOf("day").valueOf();
    const band = entry.accumulatedResourcesBand;
    const uid = entry.source.event?.uid;
    const marker = uid && isTargetEventEntry(entry) ? markers.get(uid) : undefined;
    const point: ChartPoint = {
      ts,
      balance: entry.accumulatedResources.pyroxene,
      range: band
        ? [
            Math.min(band.pessimistic.pyroxene, band.optimistic.pyroxene),
            Math.max(band.pessimistic.pyroxene, band.optimistic.pyroxene),
          ]
        : null,
      event:
        marker !== undefined && entry.source.event
          ? { name: entry.source.event.name, marker, short: getPyroxeneEventStatus(entry) === "short" }
          : undefined,
    };
    const last = points.at(-1);
    if (last && last.ts === ts) points[points.length - 1] = { ...point, event: point.event ?? last.event };
    else points.push(point);
  }
  return points;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md bg-v2-popover-surface px-3 py-2 text-xs shadow-lg ring-1 ring-v2-divider tabular-nums">
      <p className="font-semibold text-v2-fg">
        {dayjs(point.ts).tz("Asia/Seoul").format("MM/DD")}
        {point.event ? <span className="ml-1.5 font-normal text-v2-fg-secondary">{point.event.name}</span> : null}
      </p>
      <p className={point.balance < 0 ? "text-v2-danger" : "text-v2-fg"}>청휘석 {formatAmount(point.balance)}</p>
      {point.range ? (
        <p className="text-v2-fg-tertiary">
          상하위 10% 이내 {formatAmount(point.range[0])} ~ {formatAmount(point.range[1])}
        </p>
      ) : null}
    </div>
  );
}

export default function BalanceChart({
  timeline,
  markers,
}: {
  timeline: Timeline;
  markers: ReadonlyMap<string, number>;
}) {
  const points = useMemo(() => buildPoints(timeline, markers), [timeline, markers]);
  if (points.length < 2) {
    return <p className="py-8 text-center text-sm text-v2-fg-tertiary">그래프로 볼 일정이 아직 없어요</p>;
  }
  const eventPoints = points.filter((point) => point.event);
  return (
    <div className="h-56" role="img" aria-label="날짜별 예상 청휘석 그래프. 자세한 값은 아래 일정에 있어요.">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--v2-divider)" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts: number) => dayjs(ts).tz("Asia/Seoul").format("MM/DD")}
            tick={{ fontSize: 11, fill: "var(--v2-fg-tertiary)" }}
            stroke="var(--v2-divider)"
          />
          <YAxis
            width={40}
            tickFormatter={formatTick}
            tick={{ fontSize: 11, fill: "var(--v2-fg-tertiary)" }}
            stroke="var(--v2-divider)"
          />
          <Area
            dataKey="range"
            type="stepAfter"
            stroke="none"
            fill="var(--v2-accent)"
            fillOpacity={0.12}
            isAnimationActive={false}
            connectNulls
          />
          <ReferenceLine y={0} stroke="var(--v2-danger)" strokeDasharray="3 3" />
          {eventPoints.map((point) =>
            point.event ? (
              <ReferenceLine
                key={point.ts}
                x={point.ts}
                stroke="var(--v2-fg-tertiary)"
                strokeDasharray="2 3"
                label={{
                  value: point.event.marker,
                  position: "top",
                  fontSize: 10,
                  fontWeight: 700,
                  fill: point.event.short ? "var(--v2-danger)" : "var(--v2-fg)",
                }}
              />
            ) : null,
          )}
          <Line
            dataKey="balance"
            type="stepAfter"
            stroke="var(--v2-accent)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip content={<ChartTooltip />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
