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
import { useHaloMode } from "~/contexts/HaloModeContext";
import { getPyroxeneEventStatus, isTargetEventEntry } from "~/domain/pyroxene-planner-view";
import type { Timeline } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { getStudentPortraitPresentation } from "~/models/student-image-policy";
import { formatAmount } from "./pyroxene-ui";

type ChartPoint = {
  ts: number;
  balance: number;
  range: [number, number] | null;
  events: ChartEvent[];
};

type ChartEvent = { name: string; marker: number; short: boolean; students: { uid: string; name: string }[] };

const FACE_SIZE = 16;
const FACE_GAP = 2;

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${value < 0 ? "−" : ""}${Math.round(Math.abs(value) / 1000)}k`;
  return formatAmount(value);
}

// Keeps the last balance of each day, so a day with many income rows draws one step, and every target event of that day.
export function buildBalanceChartPoints(timeline: Timeline, markers: ReadonlyMap<string, number>): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const entry of timeline) {
    const ts = entry.date.tz("Asia/Seoul").startOf("day").valueOf();
    const band = entry.accumulatedResourcesBand;
    const uid = entry.source.event?.uid;
    const marker = uid && isTargetEventEntry(entry) ? markers.get(uid) : undefined;
    const event = entry.source.event;
    const point: ChartPoint = {
      ts,
      balance: entry.accumulatedResources.pyroxene,
      range: band
        ? [
            Math.min(band.pessimistic.pyroxene, band.optimistic.pyroxene),
            Math.max(band.pessimistic.pyroxene, band.optimistic.pyroxene),
          ]
        : null,
      events:
        marker !== undefined && event
          ? [
              {
                name: event.name,
                marker,
                short: getPyroxeneEventStatus(entry) === "short",
                students: event.recruitments.flatMap((recruitment) =>
                  recruitment.pickup && recruitment.favorited && recruitment.student
                    ? [{ uid: recruitment.student.uid, name: recruitment.student.name }]
                    : [],
                ),
              },
            ]
          : [],
    };
    const last = points.at(-1);
    if (last && last.ts === ts) points[points.length - 1] = { ...point, events: [...last.events, ...point.events] };
    else points.push(point);
  }
  return points;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md bg-v2-popover-surface px-3 py-2 text-xs shadow-lg ring-1 ring-v2-divider tabular-nums">
      <p className="font-semibold text-v2-fg">{dayjs(point.ts).tz("Asia/Seoul").format("MM/DD")}</p>
      {point.events.map((event) => (
        <p key={event.marker} className="whitespace-pre-line text-v2-fg-secondary">
          {event.marker}. {event.name}
        </p>
      ))}
      <p className={point.balance < 0 ? "text-v2-danger" : "text-v2-fg"}>청휘석 {formatAmount(point.balance)}</p>
      {point.range ? (
        <p className="text-v2-fg-tertiary">
          상하위 10% 이내 {formatAmount(point.range[0])} ~ {formatAmount(point.range[1])}
        </p>
      ) : null}
    </div>
  );
}

/** The event numbers above a dashed line, and every target student's face stacked right of it. */
function EventMarkerLabel({
  events,
  x,
  y,
  haloMode,
}: {
  events: ChartEvent[];
  x: number;
  y: number;
  haloMode: boolean;
}) {
  const students = events.flatMap((event) => event.students.map((student) => ({ ...student, marker: event.marker })));
  return (
    <g>
      <text x={x} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={700}>
        {events.map((event, index) => (
          <tspan key={event.marker} fill={event.short ? "var(--v2-danger)" : "var(--v2-fg)"}>
            {index > 0 ? "·" : ""}
            {event.marker}
          </tspan>
        ))}
      </text>
      {students.map((student, index) => {
        const cx = x + 3 + FACE_SIZE / 2;
        const cy = y + 4 + FACE_SIZE / 2 + index * (FACE_SIZE + FACE_GAP);
        const clipId = `pyroxene-face-${student.marker}-${student.uid}`;
        const portrait = getStudentPortraitPresentation(student.uid, haloMode);
        return (
          <g key={clipId}>
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={FACE_SIZE / 2} />
            </clipPath>
            <circle cx={cx} cy={cy} r={FACE_SIZE / 2 + 1} fill="var(--v2-surface)" />
            <image
              href={portrait.kind === "neutral" ? undefined : portrait.src}
              x={cx - FACE_SIZE / 2}
              y={cy - FACE_SIZE / 2}
              width={FACE_SIZE}
              height={FACE_SIZE}
              preserveAspectRatio="xMidYMin slice"
              clipPath={`url(#${clipId})`}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Every Tuesday (KST) within the chart's time span, as tick timestamps. */
function getTuesdayTicks(startTs: number, endTs: number): number[] {
  const TUESDAY = 2;
  let day = dayjs(startTs).tz("Asia/Seoul").startOf("day");
  day = day.add((TUESDAY - day.day() + 7) % 7, "day");
  const ticks: number[] = [];
  for (; day.valueOf() <= endTs; day = day.add(7, "day")) {
    if (day.valueOf() >= startTs) ticks.push(day.valueOf());
  }
  return ticks;
}

export default function BalanceChart({
  timeline,
  markers,
}: {
  timeline: Timeline;
  markers: ReadonlyMap<string, number>;
}) {
  const { haloMode } = useHaloMode();
  const points = useMemo(() => buildBalanceChartPoints(timeline, markers), [timeline, markers]);
  if (points.length < 2) {
    return <p className="py-8 text-center text-sm text-v2-fg-tertiary">그래프로 볼 일정이 아직 없어요</p>;
  }
  const eventPoints = points.filter((point) => point.events.length > 0);
  const tuesdayTicks = getTuesdayTicks(points[0].ts, points[points.length - 1].ts);
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
            // Label only Tuesdays; the axis drops some of them when they would overlap.
            ticks={tuesdayTicks}
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
          {eventPoints.map((point) => (
            <ReferenceLine
              key={point.ts}
              x={point.ts}
              stroke="var(--v2-fg-tertiary)"
              strokeDasharray="2 3"
              label={(props: { viewBox?: { x?: number; y?: number } }) => (
                <EventMarkerLabel
                  haloMode={haloMode}
                  events={point.events}
                  x={props.viewBox?.x ?? 0}
                  y={props.viewBox?.y ?? 0}
                />
              )}
            />
          ))}
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
