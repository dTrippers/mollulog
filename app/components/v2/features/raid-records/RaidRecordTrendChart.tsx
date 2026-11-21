import { useEffect, useMemo, useRef, useState } from "react";
import type { RaidRecordRaidType, RaidRecordRankStatus, RaidRecordServer } from "~/domain/raid-record";
import { formatRaidRank, formatRaidScore, RAID_RECORD_RAID_TYPE_LABEL } from "./raid-record-format";
import { RANK_STATUS_LABEL, RaidRankTierBadge } from "./RaidRecordBits";

export type RaidRecordTrendPoint = {
  key: string;
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
  bossName: string;
  // Orders the seasons: 총력전 and 대결전 number their seasons separately, so only the start time interleaves them.
  startAt: string;
  score: number;
  rank: number;
  rankStatus: RaidRecordRankStatus;
};

// The list shows the chart once this many records have a rank.
export const RAID_RECORD_TREND_MIN_POINTS = 3;

const HEIGHT = 168;
const MARGIN = { top: 12, right: 12, bottom: 22, left: 48 };
const POINT_RADIUS = 4;

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(targetTicks, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function buildTicks(min: number, max: number): { domain: [number, number]; ticks: number[] } {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05);
    min -= pad;
    max += pad;
  }
  const step = niceStep(max - min, 3);
  const low = Math.max(0, Math.floor(min / step) * step);
  const high = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(value);
  return { domain: [low, high], ticks };
}

// Large ranks shorten to thousands. The fraction is kept, so ticks a step under 1,000 apart stay distinct (10.5K, 11K).
export function formatRankTick(value: number): string {
  return value >= 10_000
    ? `${(value / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}K`
    : value.toLocaleString("ko-KR");
}

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

// 총력전 points are circles and 대결전 points are diamonds, so the two read apart without relying on color.
function PointMark({
  raidType,
  cx,
  cy,
  r,
  hollow,
}: {
  raidType: RaidRecordRaidType;
  cx: number;
  cy: number;
  r: number;
  hollow: boolean;
}) {
  const className = hollow ? "fill-v2-surface stroke-v2-accent" : "fill-v2-accent stroke-v2-accent";
  if (raidType === "elimination") {
    const d = r + 1;
    return (
      <path
        d={`M ${cx} ${cy - d} L ${cx + d} ${cy} L ${cx} ${cy + d} L ${cx - d} ${cy} Z`}
        className={className}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    );
  }
  return <circle cx={cx} cy={cy} r={r} className={className} strokeWidth={2} />;
}

function LegendMark({ raidType }: { raidType: RaidRecordRaidType }) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <PointMark raidType={raidType} cx={6} cy={6} r={POINT_RADIUS} hollow={false} />
    </svg>
  );
}

// A rank line across the ranked seasons, oldest on the left and rank 1 at the top. A 잠정 rank is a hollow point and
// joins the line with a dashed segment.
export function RaidRecordTrendChart({ points }: { points: RaidRecordTrendPoint[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const { ref, width } = useMeasuredWidth();
  const ordered = useMemo(
    () =>
      [...points].sort(
        (left, right) => left.startAt.localeCompare(right.startAt) || left.seasonIndex - right.seasonIndex,
      ),
    [points],
  );
  const raidTypes = useMemo(() => [...new Set(ordered.map((point) => point.raidType))], [ordered]);
  const mixed = raidTypes.length > 1;

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const ranks = ordered.map((point) => point.rank);
  const { domain, ticks } = buildTicks(Math.min(...ranks), Math.max(...ranks));
  // Rank 1 is the best, so small numbers go at the top.
  const y = (rank: number) => MARGIN.top + ((rank - domain[0]) / (domain[1] - domain[0] || 1)) * plotHeight;
  const slot = ordered.length > 0 ? plotWidth / ordered.length : 0;
  const x = (index: number) => MARGIN.left + slot * (index + 0.5);
  const labelEvery = Math.max(1, Math.ceil(ordered.length / Math.max(1, Math.floor(plotWidth / 44))));
  const active = ordered.find((point) => point.key === activeKey) ?? null;
  const activeIndex = active ? ordered.indexOf(active) : -1;
  const seasonName = (point: RaidRecordTrendPoint) =>
    `${mixed ? `${RAID_RECORD_RAID_TYPE_LABEL[point.raidType]} ` : ""}#${point.seasonIndex} ${point.bossName}`;

  return (
    <section aria-labelledby="raid-record-trend-title" className="rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="raid-record-trend-title" className="text-sm font-semibold text-v2-fg">
          순위 추이
        </h3>
        {mixed ? (
          <ul aria-hidden="true" className="flex items-center gap-3 text-xs text-v2-fg-secondary">
            {raidTypes.map((raidType) => (
              <li key={raidType} className="flex items-center gap-1.5">
                <LegendMark raidType={raidType} />
                {RAID_RECORD_RAID_TYPE_LABEL[raidType]}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div ref={ref} className="relative mt-2" style={{ height: HEIGHT }}>
        {width > 0 && ordered.length > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            aria-hidden="true"
            className="block overflow-visible"
            onMouseLeave={() => setActiveKey(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-v2-divider"
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-v2-fg-tertiary text-[0.6875rem] tabular-nums"
                >
                  {formatRankTick(tick)}
                </text>
              </g>
            ))}
            {ordered.slice(1).map((point, index) => {
              const previous = ordered[index];
              const dashed = point.rankStatus === "provisional" || previous.rankStatus === "provisional";
              return (
                <line
                  key={`segment-${point.key}`}
                  x1={x(index)}
                  y1={y(previous.rank)}
                  x2={x(index + 1)}
                  y2={y(point.rank)}
                  className="stroke-v2-accent"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={dashed ? "4 4" : undefined}
                />
              );
            })}
            {active ? (
              <line
                x1={x(activeIndex)}
                x2={x(activeIndex)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                className="stroke-v2-control-border-strong"
                strokeWidth={1}
              />
            ) : null}
            {ordered.map((point, index) => (
              <g key={point.key}>
                <PointMark
                  raidType={point.raidType}
                  cx={x(index)}
                  cy={y(point.rank)}
                  r={point.key === activeKey ? POINT_RADIUS + 1 : POINT_RADIUS}
                  hollow={point.rankStatus === "provisional"}
                />
                {index % labelEvery === 0 || index === ordered.length - 1 ? (
                  <text
                    x={x(index)}
                    y={HEIGHT - 6}
                    textAnchor="middle"
                    className="fill-v2-fg-tertiary text-[0.6875rem] tabular-nums"
                  >
                    #{point.seasonIndex}
                  </text>
                ) : null}
                {/* The hit area is the whole column, wider than the point. */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: Hover only; the table carries the values. */}
                <rect
                  x={x(index) - slot / 2}
                  y={MARGIN.top}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setActiveKey(point.key)}
                />
              </g>
            ))}
          </svg>
        ) : null}
        {active && width > 0 ? (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-56 rounded-md bg-v2-popover-surface px-2.5 py-1.5 text-xs shadow-md ring-1 ring-v2-popover-divider backdrop-blur-md"
            style={{
              top: Math.max(0, y(active.rank) - 56),
              left: Math.min(Math.max(0, x(activeIndex) - 80), Math.max(0, width - 168)),
            }}
          >
            <p className="font-semibold text-v2-fg tabular-nums">{seasonName(active)}</p>
            <p className="flex items-center gap-1 text-v2-fg-secondary tabular-nums">
              <RaidRankTierBadge
                server={active.server}
                raidType={active.raidType}
                seasonIndex={active.seasonIndex}
                rank={active.rank}
                className="h-4"
              />
              {formatRaidRank(active.rank)} · {RANK_STATUS_LABEL[active.rankStatus]}
            </p>
            <p className="text-v2-fg-secondary tabular-nums">{formatRaidScore(active.score)}</p>
          </div>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>시즌별 순위</caption>
        <thead>
          <tr>
            <th scope="col">시즌</th>
            <th scope="col">순위</th>
            <th scope="col">점수</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((point) => (
            <tr key={point.key}>
              <th scope="row">{seasonName(point)}</th>
              <td>
                {formatRaidRank(point.rank)} {RANK_STATUS_LABEL[point.rankStatus]}{" "}
                <RaidRankTierBadge
                  server={point.server}
                  raidType={point.raidType}
                  seasonIndex={point.seasonIndex}
                  rank={point.rank}
                />
              </td>
              <td>{formatRaidScore(point.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
