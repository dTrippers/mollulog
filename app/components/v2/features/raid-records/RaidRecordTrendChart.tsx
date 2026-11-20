import { useEffect, useMemo, useRef, useState } from "react";
import type { RaidRecordRankStatus } from "~/domain/raid-record";
import { cn } from "~/lib/utils";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { formatRaidRank, formatRaidScore } from "./raid-record-format";
import { RANK_STATUS_LABEL } from "./RaidRecordBits";

export type RaidRecordTrendPoint = {
  key: string;
  seasonIndex: number;
  bossName: string;
  score: number;
  rank: number | null;
  rankStatus: RaidRecordRankStatus;
  // A season still running, or an elimination record with only some defense types: the value can still change.
  open: boolean;
};

type Mode = "score" | "rank";

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
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(value);
  return { domain: [low, high], ticks };
}

function formatScoreTick(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}

function formatRankTick(value: number): string {
  return value >= 10_000 ? `${Math.round(value / 1000)}K` : value.toLocaleString("ko-KR");
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

// A score or rank line across the recorded seasons, oldest on the left. A season whose value can still change is a
// hollow point; a 잠정 rank joins the line with a dashed segment.
export function RaidRecordTrendChart({
  points,
  scoreLabel,
  openPointNote,
}: {
  points: RaidRecordTrendPoint[];
  scoreLabel: string;
  openPointNote?: string;
}) {
  const [mode, setMode] = useState<Mode>("score");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const { ref, width } = useMeasuredWidth();
  const ordered = useMemo(() => [...points].sort((left, right) => left.seasonIndex - right.seasonIndex), [points]);
  const plotted = mode === "score" ? ordered : ordered.filter((point) => point.rank !== null);
  const value = (point: RaidRecordTrendPoint) => (mode === "score" ? point.score : (point.rank ?? 0));

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const values = plotted.map(value);
  const { domain, ticks } = buildTicks(Math.min(...values), Math.max(...values));
  // Rank 1 is the best, so the rank view puts small numbers at the top.
  const y = (input: number) => {
    const ratio = (input - domain[0]) / (domain[1] - domain[0] || 1);
    return MARGIN.top + (mode === "score" ? 1 - ratio : ratio) * plotHeight;
  };
  const slot = plotted.length > 0 ? plotWidth / plotted.length : 0;
  const x = (index: number) => MARGIN.left + slot * (index + 0.5);
  const labelEvery = Math.max(1, Math.ceil(plotted.length / Math.max(1, Math.floor(plotWidth / 44))));
  const active = plotted.find((point) => point.key === activeKey) ?? null;
  const activeIndex = active ? plotted.indexOf(active) : -1;

  return (
    <section aria-labelledby="raid-record-trend-title" className="rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="raid-record-trend-title" className="text-sm font-semibold text-v2-fg">
          추이
        </h3>
        <SegmentedControl
          label="추이 기준"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setActiveKey(null);
          }}
          options={[
            { value: "score", label: scoreLabel },
            { value: "rank", label: "순위" },
          ]}
        />
      </div>
      <div ref={ref} className="relative mt-2" style={{ height: HEIGHT }}>
        {width > 0 && plotted.length > 0 ? (
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
                  {mode === "score" ? formatScoreTick(tick) : formatRankTick(tick)}
                </text>
              </g>
            ))}
            {plotted.slice(1).map((point, index) => {
              const previous = plotted[index];
              const dashed =
                point.open ||
                previous.open ||
                (mode === "rank" && (point.rankStatus === "provisional" || previous.rankStatus === "provisional"));
              return (
                <line
                  key={`segment-${point.key}`}
                  x1={x(index)}
                  y1={y(value(previous))}
                  x2={x(index + 1)}
                  y2={y(value(point))}
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
            {plotted.map((point, index) => {
              const hollow = point.open;
              return (
                <g key={point.key}>
                  <circle
                    cx={x(index)}
                    cy={y(value(point))}
                    r={point.key === activeKey ? POINT_RADIUS + 1 : POINT_RADIUS}
                    className={cn("stroke-v2-accent", hollow ? "fill-v2-surface" : "fill-v2-accent")}
                    strokeWidth={2}
                  />
                  {index % labelEvery === 0 || index === plotted.length - 1 ? (
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
              );
            })}
          </svg>
        ) : null}
        {plotted.length === 0 ? (
          // Only the rank view can be empty: every record here was saved from the season chart without a rank.
          <p className="absolute inset-0 flex items-center justify-center text-sm text-v2-fg-tertiary">
            순위를 입력한 기록이 없어요.
          </p>
        ) : null}
        {active && width > 0 ? (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-56 rounded-md bg-v2-elevated px-2.5 py-1.5 text-xs shadow-md ring-1 ring-v2-popover-divider"
            style={{
              top: Math.max(0, y(value(active)) - 56),
              left: Math.min(Math.max(0, x(activeIndex) - 80), Math.max(0, width - 168)),
            }}
          >
            <p className="font-semibold text-v2-fg">
              <span className="tabular-nums">#{active.seasonIndex}</span> {active.bossName}
            </p>
            <p className="text-v2-fg-secondary tabular-nums">{formatRaidScore(active.score)}</p>
            <p className="text-v2-fg-secondary tabular-nums">
              {active.rank === null ? "순위 미입력" : `${formatRaidRank(active.rank)} · ${RANK_STATUS_LABEL[active.rankStatus]}`}
            </p>
          </div>
        ) : null}
      </div>
      {openPointNote && ordered.some((point) => point.open) ? (
        <p className="mt-1 text-xs text-v2-fg-tertiary">{openPointNote}</p>
      ) : null}
      <table className="sr-only">
        <caption>시즌별 {scoreLabel}와 순위</caption>
        <thead>
          <tr>
            <th scope="col">시즌</th>
            <th scope="col">{scoreLabel}</th>
            <th scope="col">순위</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((point) => (
            <tr key={point.key}>
              <th scope="row">
                #{point.seasonIndex} {point.bossName}
              </th>
              <td>{formatRaidScore(point.score)}</td>
              <td>
                {point.rank === null ? "순위 미입력" : `${formatRaidRank(point.rank)} ${RANK_STATUS_LABEL[point.rankStatus]}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
