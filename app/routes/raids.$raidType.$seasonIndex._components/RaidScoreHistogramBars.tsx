import { Bar, BarChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_MARGIN_RIGHT, formatDifficulty, formatTimeLabel } from "./raid-score-histogram-format";
import type { HistogramChartData, HistogramChartRow, ScoreMarker, ScoreRange } from "./RaidScoreHistogram";

type DisplayRange = { xStart: number; xEnd: number };

// The recharts part of RaidScoreHistogram, loaded lazily so recharts stays out of the route's initial bundle.
export default function RaidScoreHistogramBars({
  chartData,
  yAxisMax,
  highlightRange,
  previewRange,
  difficultyBoundaryLines,
  myScoreMarker,
}: {
  chartData: HistogramChartData;
  yAxisMax: number;
  highlightRange: DisplayRange | null;
  previewRange: DisplayRange | null;
  difficultyBoundaryLines: { key: string; x: number }[];
  myScoreMarker: ScoreMarker | null;
}) {
  const { rows } = chartData;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: CHART_MARGIN_RIGHT, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          className="stroke-neutral-200 dark:stroke-neutral-700"
        />
        <XAxis
          dataKey="x"
          type="number"
          domain={chartData.xDomain}
          ticks={chartData.xTicks}
          tickFormatter={(value) => formatXAxisTick(Number(value), chartData)}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          width={42}
          orientation="right"
          domain={[0, yAxisMax]}
          tickFormatter={(value) => formatCount(Number(value))}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
          content={({ active, payload }) => {
            const row = active ? getTooltipRow(payload) : null;
            if (!row) {
              return null;
            }
            return (
              <div className="rounded-md border border-neutral-200 bg-white p-3 text-xs shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">{formatTooltipTitle(row)}</p>
                {row.scoreRange && (
                  <p className="mt-1 text-neutral-500 dark:text-neutral-400">{formatScoreRange(row.scoreRange)}</p>
                )}
                <p className="mt-1 text-neutral-500 dark:text-neutral-400">{row.count.toLocaleString()}명</p>
              </div>
            );
          }}
        />
        {highlightRange && (
          <ReferenceArea
            x1={highlightRange.xStart}
            x2={highlightRange.xEnd}
            fill="rgb(148, 163, 184)"
            fillOpacity={0.12}
            strokeOpacity={0}
            style={{ pointerEvents: "none" }}
          />
        )}
        {previewRange && (
          <ReferenceArea
            x1={previewRange.xStart}
            x2={previewRange.xEnd}
            fill="var(--raid-selection-fill)"
            fillOpacity={0.06}
            strokeOpacity={0}
            style={{ pointerEvents: "none" }}
          />
        )}
        <Bar dataKey="count" fill="rgb(115, 115, 115)" maxBarSize={12} isAnimationActive={false} />
        {difficultyBoundaryLines.map((line) => (
          <ReferenceLine
            key={line.key}
            x={line.x}
            stroke="var(--raid-boundary-stroke)"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            ifOverflow="extendDomain"
          />
        ))}
        {myScoreMarker && (
          <ReferenceLine
            x={myScoreMarker.x}
            stroke="var(--raid-score-marker-stroke)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            ifOverflow="hidden"
            label={{
              content: MyScoreReferenceLineLabel,
            }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

function MyScoreReferenceLineLabel(props: unknown) {
  const viewBox =
    typeof props === "object" && props !== null && "viewBox" in props
      ? (props.viewBox as { x?: unknown; y?: unknown } | undefined)
      : undefined;

  if (typeof viewBox?.x !== "number" || typeof viewBox.y !== "number") {
    return <g />;
  }

  return (
    <text
      x={viewBox.x + 6}
      y={viewBox.y + 12}
      fill="var(--raid-score-marker-stroke)"
      fontSize={11}
      fontWeight={700}
      textAnchor="start"
    >
      내 점수
    </text>
  );
}

function getTooltipRow(payload: unknown): HistogramChartRow | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  return (payload[0] as { payload?: HistogramChartRow }).payload ?? null;
}

function formatXAxisTick(value: number, chartData: HistogramChartData): string {
  return chartData.xTickLabels?.[value.toString()] ?? "";
}

function formatTooltipTitle(row: HistogramChartRow): string {
  const timeRange = `${formatTimeLabel(row.timeStartSec)}-${formatTimeLabel(row.timeEndSec)}`;
  if (!row.difficulty) {
    return timeRange;
  }
  return `${formatDifficulty(row.difficulty)} ${timeRange}`;
}

function formatScoreRange(range: ScoreRange): string {
  if (range.lt === undefined) {
    return `${range.gte.toLocaleString()}점 이상`;
  }
  return `${range.gte.toLocaleString()}-${(range.lt - 1).toLocaleString()}점`;
}

function formatCount(value: number): string {
  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toString();
}
