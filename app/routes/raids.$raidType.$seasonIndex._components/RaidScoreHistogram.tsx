import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Input from "~/components/primitives/Input";
import type { Attack, Defense } from "~/graphql/graphql";
import {
  type ClearTimeDifficultyBand,
  type ClearTimeDistribution,
  fetchClearTimeDistribution,
} from "~/lib/ranks/clear-time-distribution";
import { type RangeStats, fetchRangeStats } from "~/lib/ranks/range-stats";
import { difficultyLocale } from "~/locales/ko";
import type { RaidType, Role } from "~/models/content.d";
import RaidScoreRangeDetail from "./RaidScoreRangeDetail";
import RaidStatsCard from "./RaidStatsCard";

type StudentInfo = {
  name: string;
  role: Role;
  attackType: Attack;
  defenseType: Defense;
};

type RaidScoreHistogramProps = {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
  clearLevels: Record<string, number>;
  allStudents: Record<string, StudentInfo>;
  recruitedStudentTiers: Record<string, number>;
  hasRecruitedStudentData: boolean;
};

type ScoreRange = {
  gte: number;
  lt?: number;
};

type SelectedRange = {
  scoreRanges: ScoreRange[];
  displayRange: {
    xStart: number;
    xEnd: number;
  };
};

type HistogramChartRow = {
  id: string;
  x: number;
  xStart: number;
  xEnd: number;
  count: number;
  difficulty?: string;
  timeStartSec: number;
  timeEndSec: number;
  scoreRange?: ScoreRange;
};

type DifficultyBandStat = ClearTimeDifficultyBand & {
  count: number;
  ratio: number;
};

type HistogramChartData = {
  rows: HistogramChartRow[];
  xDomain: [number, number];
  xTicks?: number[];
  xTickLabels?: Record<string, string>;
};

type ScoreMarker = {
  x: number;
  difficulty: string;
  timeSec: number;
};

const rangeStatsCache = new Map<string, RangeStats>();
const reportedDifficultyBandStatsMismatches = new Set<string>();
const RANGE_STATS_CACHE_MAX_SIZE = 50;
const MY_SCORE_STORAGE_PREFIX = "raid-clear-time-distribution:my-score";
const CHART_PADDING_PX = 12;
const CHART_MARGIN_RIGHT = 4;
const Y_AXIS_WIDTH = 42;
const CHART_SKELETON_BARS = [
  { key: "bar-1", heightClassName: "h-1/3" },
  { key: "bar-2", heightClassName: "h-1/2" },
  { key: "bar-3", heightClassName: "h-1/4" },
  { key: "bar-4", heightClassName: "h-2/3" },
  { key: "bar-5", heightClassName: "h-2/5" },
  { key: "bar-6", heightClassName: "h-3/4" },
  { key: "bar-7", heightClassName: "h-1/2" },
  { key: "bar-8", heightClassName: "h-1/4" },
  { key: "bar-9", heightClassName: "h-3/5" },
  { key: "bar-10", heightClassName: "h-1/3" },
  { key: "bar-11", heightClassName: "h-2/5" },
  { key: "bar-12", heightClassName: "h-3/5" },
] as const;

export default function RaidScoreHistogram({
  raidType,
  season,
  defenseType,
  clearLevels,
  allStudents,
  recruitedStudentTiers,
  hasRecruitedStudentData,
}: RaidScoreHistogramProps) {
  const [overviewDistribution, setOverviewDistribution] = useState<ClearTimeDistribution | null>(null);
  const [chartDistribution, setChartDistribution] = useState<ClearTimeDistribution | null>(null);
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null);
  const [selectedBandKey, setSelectedBandKey] = useState<string>("all");
  const [distributionLoading, setDistributionLoading] = useState(false);
  const [rangeStats, setRangeStats] = useState<RangeStats | null>(null);
  const [rangeStatsLoading, setRangeStatsLoading] = useState(false);
  const [rangeStatsLoadedKey, setRangeStatsLoadedKey] = useState<string | null>(null);
  const myScoreStorageKey = `${MY_SCORE_STORAGE_PREFIX}:${raidType}:${season}:${defenseType}`;
  const [myScoreInput, setMyScoreInput] = useState("");
  const [myScoreStorageLoadedKey, setMyScoreStorageLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      setMyScoreInput(formatScoreInput(window.localStorage.getItem(myScoreStorageKey) ?? ""));
    } catch {
      setMyScoreInput("");
    }
    setMyScoreStorageLoadedKey(myScoreStorageKey);
  }, [myScoreStorageKey]);

  useEffect(() => {
    if (myScoreStorageLoadedKey !== myScoreStorageKey) {
      return;
    }
    try {
      if (myScoreInput) {
        window.localStorage.setItem(myScoreStorageKey, myScoreInput);
      } else {
        window.localStorage.removeItem(myScoreStorageKey);
      }
    } catch {
      // Ignore localStorage errors.
    }
  }, [myScoreInput, myScoreStorageKey, myScoreStorageLoadedKey]);

  useEffect(() => {
    let cancelled = false;
    setOverviewDistribution(null);
    setChartDistribution(null);
    setSelectedBandKey("all");
    setSelectedRange(null);
    setDistributionLoading(true);
    setRangeStats(null);
    setRangeStatsLoading(false);
    setRangeStatsLoadedKey(null);

    const loadDistribution = async () => {
      try {
        const response = await fetchClearTimeDistribution({
          raidType,
          season,
          defenseType,
        });
        if (cancelled) {
          return;
        }
        if (response.axis.binCount === 0 || response.totalCount === 0) {
          setOverviewDistribution(null);
          setChartDistribution(null);
          setRangeStats(null);
          setRangeStatsLoading(false);
          setRangeStatsLoadedKey(null);
          setDistributionLoading(false);
          return;
        }
        setOverviewDistribution(response);
        setChartDistribution(response);
        setDistributionLoading(false);
      } catch {
        if (!cancelled) {
          setOverviewDistribution(null);
          setChartDistribution(null);
          setRangeStats(null);
          setRangeStatsLoading(false);
          setRangeStatsLoadedKey(null);
          setDistributionLoading(false);
        }
      }
    };

    loadDistribution();

    return () => {
      cancelled = true;
    };
  }, [raidType, season, defenseType]);

  const bands = overviewDistribution?.bands ?? [];

  useEffect(() => {
    if (!overviewDistribution) {
      return;
    }

    if (selectedBandKey === "all") {
      setChartDistribution(overviewDistribution);
      setSelectedRange(null);
      setDistributionLoading(false);
      setRangeStats(null);
      setRangeStatsLoadedKey(null);
      return;
    }

    let cancelled = false;
    setSelectedRange(null);
    setDistributionLoading(true);
    setRangeStats(null);
    setRangeStatsLoadedKey(null);

    const loadDifficultyDistribution = async () => {
      try {
        const response = await fetchClearTimeDistribution({
          raidType,
          season,
          defenseType,
          difficulty: selectedBandKey,
        });
        if (cancelled) {
          return;
        }
        setChartDistribution(response);
        setSelectedRange(distributionToSelectedRange(response, selectedBandKey));
        setDistributionLoading(false);
      } catch {
        if (!cancelled) {
          setChartDistribution(overviewDistribution);
          setSelectedRange(null);
          setDistributionLoading(false);
          setRangeStatsLoading(false);
          setRangeStatsLoadedKey(null);
        }
      }
    };

    loadDifficultyDistribution();

    return () => {
      cancelled = true;
    };
  }, [defenseType, overviewDistribution, raidType, season, selectedBandKey]);

  const selectedSampleSize = useMemo(() => {
    if (selectedBandKey === "all") {
      return overviewDistribution?.totalCount ?? 0;
    }
    return overviewDistribution?.bands.find((band) => band.difficulty === selectedBandKey)?.sampleCount ?? 0;
  }, [overviewDistribution, selectedBandKey]);

  const currentRangeStatsCacheKey = useMemo(() => {
    if (!overviewDistribution || (selectedBandKey !== "all" && !selectedRange)) {
      return null;
    }
    return getRangeStatsCacheKey({ raidType, season, defenseType, range: selectedRange });
  }, [defenseType, overviewDistribution, raidType, season, selectedBandKey, selectedRange]);

  useEffect(() => {
    if (selectedBandKey !== "all" && !selectedRange) {
      setRangeStats(null);
      setRangeStatsLoading(distributionLoading);
      return;
    }

    const cacheKey = getRangeStatsCacheKey({ raidType, season, defenseType, range: selectedRange });
    const cached = getCachedRangeStats(cacheKey);
    if (cached) {
      setRangeStats(cached);
      setRangeStatsLoading(false);
      setRangeStatsLoadedKey(cacheKey);
      return;
    }

    let cancelled = false;
    setRangeStats(null);
    setRangeStatsLoadedKey(null);
    setRangeStatsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = selectedRange
          ? mergeRangeStats(
              await Promise.all(
                selectedRange.scoreRanges.map((range) =>
                  fetchRangeStats({
                    raidType,
                    season,
                    defenseType,
                    scoreGte: range.gte,
                    scoreLt: range.lt,
                    topParties: selectedRange.scoreRanges.length > 1 ? 20 : 5,
                  }),
                ),
              ),
            )
          : await fetchRangeStats({
              raidType,
              season,
              defenseType,
              topParties: 5,
            });
        if (cancelled) {
          return;
        }
        setCachedRangeStats(cacheKey, response);
        setRangeStats(response);
        setRangeStatsLoading(false);
        setRangeStatsLoadedKey(cacheKey);
      } catch {
        if (!cancelled) {
          setRangeStats(null);
          setRangeStatsLoading(false);
          setRangeStatsLoadedKey(cacheKey);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [raidType, season, defenseType, selectedBandKey, selectedRange, distributionLoading]);

  if (!overviewDistribution || !chartDistribution) {
    if (distributionLoading) {
      return (
        <RaidScoreHistogramSkeleton
          allStudents={allStudents}
          recruitedStudentTiers={recruitedStudentTiers}
          sampleSize={Object.values(clearLevels).reduce((sum, count) => sum + count, 0)}
        />
      );
    }
    return null;
  }

  const selectBand = (bandKey: string) => {
    setSelectedBandKey(bandKey);
  };

  const selectRange = (range: SelectedRange) => {
    setSelectedRange((current) => (current && isSameSelectedRange(current, range) ? current : range));
  };

  const displayedRangeStats = currentRangeStatsCacheKey
    ? (rangeStats ?? getCachedRangeStats(currentRangeStatsCacheKey) ?? null)
    : rangeStats;
  const rangeStatsReady =
    currentRangeStatsCacheKey === null ||
    rangeStatsLoadedKey === currentRangeStatsCacheKey ||
    rangeStatsCache.has(currentRangeStatsCacheKey);
  const waitingForSelectedRange = selectedBandKey !== "all" && !selectedRange && distributionLoading;
  const detailLoading = rangeStatsLoading || !rangeStatsReady || waitingForSelectedRange;
  const displayedMyScoreInput = myScoreStorageLoadedKey === myScoreStorageKey ? myScoreInput : "";

  return (
    <div className="space-y-4">
      <RaidStatsCard
        title="클리어 시간 분포"
        description="구간을 드래그해서 해당 구간의 학생 출전 정보를 확인할 수 있어요"
      >
        <div className="space-y-3">
          <HistogramChart
            overviewDistribution={overviewDistribution}
            chartDistribution={chartDistribution}
            bands={bands}
            clearLevels={clearLevels}
            selectedRange={selectedRange}
            selectedBandKey={selectedBandKey}
            myScoreInput={displayedMyScoreInput}
            onMyScoreInputChange={(value) => setMyScoreInput(formatScoreInput(value))}
            onSelectRange={selectRange}
            onSelectBand={selectBand}
          />
        </div>
      </RaidStatsCard>

      <RaidScoreRangeDetail
        rangeStats={displayedRangeStats}
        loading={detailLoading}
        sampleSize={selectedSampleSize}
        allStudents={allStudents}
        recruitedStudentTiers={recruitedStudentTiers}
        hasRecruitedStudentData={hasRecruitedStudentData}
      />
    </div>
  );
}

function RaidScoreHistogramSkeleton({
  allStudents,
  recruitedStudentTiers,
  sampleSize,
}: {
  allStudents: Record<string, StudentInfo>;
  recruitedStudentTiers: Record<string, number>;
  sampleSize: number;
}) {
  return (
    <div className="space-y-4">
      <RaidStatsCard
        title="클리어 시간 분포"
        description="구간을 드래그해서 해당 구간의 학생 출전 정보를 확인할 수 있어요"
      >
        <div className="space-y-3" aria-hidden="true">
          <div className="flex flex-wrap gap-1.5">
            <span className="h-8 w-12 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
            <span className="h-8 w-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
            <span className="h-8 w-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          </div>
          <div className="h-64 rounded-md bg-white/40 p-3 dark:bg-neutral-900/30">
            <div className="flex h-full items-end gap-1">
              {CHART_SKELETON_BARS.map(({ key, heightClassName }) => (
                <span
                  key={key}
                  className={`min-w-1 flex-1 animate-pulse rounded-t bg-neutral-200 dark:bg-neutral-700 ${heightClassName}`}
                />
              ))}
            </div>
          </div>
        </div>
      </RaidStatsCard>

      <RaidScoreRangeDetail
        rangeStats={null}
        loading
        sampleSize={sampleSize}
        allStudents={allStudents}
        recruitedStudentTiers={recruitedStudentTiers}
        hasRecruitedStudentData={false}
      />
    </div>
  );
}

function HistogramChart({
  overviewDistribution,
  chartDistribution,
  bands,
  clearLevels,
  selectedRange,
  selectedBandKey,
  myScoreInput,
  onMyScoreInputChange,
  onSelectRange,
  onSelectBand,
}: {
  overviewDistribution: ClearTimeDistribution;
  chartDistribution: ClearTimeDistribution;
  bands: ClearTimeDifficultyBand[];
  clearLevels: Record<string, number>;
  selectedRange: SelectedRange | null;
  selectedBandKey: string;
  myScoreInput: string;
  onMyScoreInputChange: (value: string) => void;
  onSelectRange: (range: SelectedRange) => void;
  onSelectBand: (bandKey: string) => void;
}) {
  const [dragStart, setDragStart] = useState<HistogramChartRow | null>(null);
  const [dragCurrent, setDragCurrent] = useState<HistogramChartRow | null>(null);
  const [highlightDifficulty, setHighlightDifficulty] = useState<string | null>(null);
  const dragStartRef = useRef<HistogramChartRow | null>(null);
  const dragCurrentRef = useRef<HistogramChartRow | null>(null);
  const chartData = useMemo(
    () => buildClearTimeChartData(chartDistribution, selectedBandKey),
    [chartDistribution, selectedBandKey],
  );
  const { rows } = chartData;
  const yAxisMax = Math.max(...rows.map((row) => row.count), 1);
  const difficultyBandStats = useMemo(
    () => buildDifficultyBandStats({ bands, clearLevels, totalCount: overviewDistribution.totalCount }),
    [bands, clearLevels, overviewDistribution.totalCount],
  );
  const previewRange =
    dragStart && dragCurrent
      ? rowsToDisplayRange(rowsBetween(dragStart, dragCurrent, rows))
      : (selectedRange?.displayRange ?? null);
  const highlightRange =
    selectedBandKey !== "all" && highlightDifficulty === selectedBandKey ? rowsToDisplayRange(rows) : null;
  const difficultyBoundaryLines = useMemo(
    () => (selectedBandKey === "all" ? buildDifficultyBoundaryLines(rows) : []),
    [rows, selectedBandKey],
  );
  const myScore = parseScoreInput(myScoreInput);
  const myScoreMarker = useMemo(
    () =>
      myScore === null
        ? null
        : buildScoreMarker({
            score: myScore,
            rows,
            bands: chartDistribution.bands,
            timeBudgetSec: chartDistribution.timeBudgetSec,
          }),
    [chartDistribution.bands, chartDistribution.timeBudgetSec, myScore, rows],
  );

  const updateDragStart = (row: HistogramChartRow | null) => {
    dragStartRef.current = row;
    dragCurrentRef.current = row;
    setDragStart(row);
    setDragCurrent(row);
  };

  const updateDragCurrent = (row: HistogramChartRow | null) => {
    dragCurrentRef.current = row;
    setDragCurrent(row);
  };

  const getPointerRow = (event: MouseEvent<HTMLDivElement>) =>
    getRowFromPointer({ event, rows, xDomain: chartData.xDomain });

  const handleDragEnd = () => {
    if (dragStartRef.current && dragCurrentRef.current) {
      const range = rowsToSelection(rowsBetween(dragStartRef.current, dragCurrentRef.current, rows));
      if (range) {
        onSelectRange(range);
      }
    }
    updateDragStart(null);
  };

  const draggable = rows.length > 0;

  return (
    <div className="space-y-2">
      <DifficultySummaryRail
        stats={difficultyBandStats}
        selectedBandKey={selectedBandKey}
        onSelectBand={onSelectBand}
        onHighlightDifficulty={setHighlightDifficulty}
      />

      <div
        className={`h-64 w-full select-none rounded-md border border-neutral-200 bg-white/40 p-3 [--raid-boundary-stroke:rgb(163,163,163)] [--raid-score-marker-stroke:rgb(37,99,235)] [--raid-selection-fill:rgb(14,165,233)] dark:border-neutral-700 dark:bg-neutral-900/30 dark:[--raid-boundary-stroke:rgb(115,115,115)] dark:[--raid-score-marker-stroke:rgb(96,165,250)] dark:[--raid-selection-fill:rgb(56,189,248)] ${
          draggable ? "cursor-crosshair" : "cursor-default"
        }`}
        onMouseDown={(event) => {
          if (!draggable) {
            return;
          }
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          updateDragStart(getPointerRow(event));
        }}
        onMouseMove={(event) => {
          if (draggable && dragStartRef.current) {
            updateDragCurrent(getPointerRow(event));
          }
        }}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
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
      </div>

      <MyScoreInput
        value={myScoreInput}
        marker={myScoreMarker}
        selectedBandKey={selectedBandKey}
        onChange={onMyScoreInputChange}
      />
    </div>
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

function MyScoreInput({
  value,
  marker,
  selectedBandKey,
  onChange,
}: {
  value: string;
  marker: ScoreMarker | null;
  selectedBandKey: string;
  onChange: (value: string) => void;
}) {
  const parsedScore = parseScoreInput(value);
  const helperText =
    parsedScore === null
      ? "내 점수 위치를 표시해요"
      : marker
        ? `${formatDifficulty(marker.difficulty)} / ${formatTimeLabelWithMilliseconds(marker.timeSec)}`
        : selectedBandKey === "all"
          ? "범위 밖의 점수예요"
          : "선택한 난이도 밖의 점수예요";
  const hasValidMarker = parsedScore !== null && marker !== null;

  return (
    <div className="flex flex-col items-end gap-1 pt-1">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="raid-clear-time-my-score"
          className="text-sm font-medium text-neutral-600 dark:text-neutral-300"
        >
          내 점수
        </label>
        <Input
          id="raid-clear-time-my-score"
          size="sm"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder="점수 입력"
          onChange={onChange}
          containerClassName="w-36"
          className="max-w-none text-right font-medium"
          aria-label="내 점수"
        />
      </div>
      <p
        className={`min-h-4 w-36 pr-3 text-right text-xs font-medium ${
          parsedScore === null
            ? "text-transparent"
            : hasValidMarker
              ? "text-blue-700 dark:text-blue-300"
              : "text-neutral-500 dark:text-neutral-400"
        }`}
      >
        {parsedScore === null ? "." : helperText}
      </p>
    </div>
  );
}

function DifficultySummaryRail({
  stats,
  selectedBandKey,
  onSelectBand,
  onHighlightDifficulty,
}: {
  stats: DifficultyBandStat[];
  selectedBandKey: string;
  onSelectBand: (bandKey: string) => void;
  onHighlightDifficulty: (difficulty: string | null) => void;
}) {
  if (stats.length === 0) {
    return null;
  }

  return (
    <div className="my-2 flex flex-wrap items-center gap-x-1 gap-y-1.5 md:gap-x-1.5">
      <button
        type="button"
        aria-pressed={selectedBandKey === "all"}
        className={`inline-flex cursor-pointer items-center gap-x-1 rounded-lg border border-neutral-200 px-2 py-1 text-sm tracking-tighter transition-colors dark:border-neutral-700 ${
          selectedBandKey === "all"
            ? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-700 dark:hover:bg-neutral-300"
            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
        }`}
        onClick={() => onSelectBand("all")}
      >
        전체
      </button>
      {stats.map((stat) => {
        const active = selectedBandKey === stat.difficulty;
        return (
          <button
            key={stat.difficulty}
            type="button"
            aria-pressed={active}
            className={`inline-flex cursor-pointer items-center gap-x-1 rounded-lg border border-neutral-200 px-2 py-1 text-left transition-colors dark:border-neutral-700 ${
              active
                ? "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-700 dark:hover:bg-neutral-300"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
            }`}
            onClick={() => onSelectBand(stat.difficulty)}
            onMouseEnter={() => onHighlightDifficulty(stat.difficulty)}
            onMouseLeave={() => onHighlightDifficulty(null)}
            onFocus={() => onHighlightDifficulty(stat.difficulty)}
            onBlur={() => onHighlightDifficulty(null)}
          >
            <span className="shrink-0 text-sm tracking-tighter">{formatDifficulty(stat.difficulty)}</span>
            <span
              className={`text-xs ${active ? "text-neutral-300 dark:text-neutral-700" : "text-neutral-500 dark:text-neutral-400"}`}
            >
              {stat.count.toLocaleString()}명
            </span>
            <span
              className={`text-xs ${active ? "text-neutral-300 dark:text-neutral-700" : "text-neutral-500 dark:text-neutral-400"}`}
            >
              {formatRatio(stat.ratio)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function buildClearTimeChartData(distribution: ClearTimeDistribution, selectedBandKey: string): HistogramChartData {
  if (selectedBandKey === "all") {
    return buildAllDifficultyClearTimeChartData(distribution);
  }
  return buildSingleDifficultyClearTimeChartData(distribution, selectedBandKey);
}

function buildAllDifficultyClearTimeChartData(distribution: ClearTimeDistribution): HistogramChartData {
  const rows: HistogramChartRow[] = [];
  const { axis } = distribution;
  const seriesByDifficulty = new Map(distribution.series.map((series) => [series.difficulty, series]));

  if (axis.binCount <= 0 || axis.binWidthSec <= 0) {
    return {
      rows,
      xDomain: [0, 0],
    };
  }

  for (const band of distribution.bands) {
    const series = seriesByDifficulty.get(band.difficulty);
    if (!series) {
      continue;
    }
    const segmentRows = buildRowsForBand({ distribution, band, counts: series.counts });
    for (const row of trimEmptyEdgeRows(segmentRows)) {
      const xStart = rows.length;
      rows.push({
        ...row,
        id: `${row.id}:${xStart}`,
        x: xStart + 0.5,
        xStart,
        xEnd: xStart + 1,
      });
    }
  }

  const { ticks, labels } = buildDifficultySegmentTicks(rows);

  return {
    rows,
    xDomain: [0, rows.length],
    xTicks: ticks,
    xTickLabels: labels,
  };
}

function buildSingleDifficultyClearTimeChartData(
  distribution: ClearTimeDistribution,
  selectedBandKey: string,
): HistogramChartData {
  const { axis } = distribution;
  const selectedBand = distribution.bands.find((band) => band.difficulty === selectedBandKey);
  const selectedSeries = distribution.series.find((series) => series.difficulty === selectedBandKey);

  if (axis.binCount <= 0 || axis.binWidthSec <= 0 || !selectedBand || !selectedSeries) {
    return {
      rows: [],
      xDomain: [0, 0],
    };
  }

  const rows = trimEmptyEdgeRows(
    buildRowsForBand({
      distribution,
      band: selectedBand,
      counts: selectedSeries.counts,
    }),
  ).map((row, index) => ({
    ...row,
    id: `${row.id}:${index}`,
    x: index + 0.5,
    xStart: index,
    xEnd: index + 1,
  }));
  const { ticks, labels } = buildTimeTicksForRows(rows);

  return {
    rows,
    xDomain: [0, rows.length],
    xTicks: ticks,
    xTickLabels: labels,
  };
}

function buildRowsForBand({
  distribution,
  band,
  counts,
}: {
  distribution: ClearTimeDistribution;
  band: ClearTimeDifficultyBand;
  counts: number[];
}): HistogramChartRow[] {
  const rows: HistogramChartRow[] = [];
  const { axis } = distribution;

  for (let bucketEnd = axis.maxSec; bucketEnd > axis.minSec; bucketEnd -= axis.binWidthSec) {
    const bucketStart = Math.max(axis.minSec, bucketEnd - axis.binWidthSec);
    const overlapStartSec = Math.max(bucketStart, band.minSec);
    const overlapEndSec = Math.min(bucketEnd, band.maxSec);
    if (overlapStartSec >= overlapEndSec) {
      continue;
    }

    const bucketIndex = Math.floor((bucketStart - axis.minSec) / axis.binWidthSec);
    rows.push({
      id: `${band.difficulty}:${bucketStart}`,
      x: rows.length + 0.5,
      xStart: rows.length,
      xEnd: rows.length + 1,
      count: counts[bucketIndex] ?? 0,
      difficulty: band.difficulty,
      timeStartSec: overlapStartSec,
      timeEndSec: overlapEndSec,
      scoreRange: timeBucketToScoreRange(band, distribution.timeBudgetSec, overlapStartSec, overlapEndSec),
    });
  }

  return rows;
}

function trimEmptyEdgeRows(rows: HistogramChartRow[]): HistogramChartRow[] {
  const firstNonEmptyIndex = rows.findIndex((row) => row.count > 0);
  if (firstNonEmptyIndex < 0) {
    return [];
  }
  let lastNonEmptyIndex = rows.length - 1;
  while (lastNonEmptyIndex > firstNonEmptyIndex && rows[lastNonEmptyIndex].count === 0) {
    lastNonEmptyIndex -= 1;
  }
  return rows.slice(firstNonEmptyIndex, lastNonEmptyIndex + 1);
}

function buildDifficultyBandStats({
  bands,
  clearLevels,
  totalCount,
}: {
  bands: ClearTimeDifficultyBand[];
  clearLevels: Record<string, number>;
  totalCount: number;
}): DifficultyBandStat[] {
  const totalClearCount = Object.values(clearLevels).reduce((sum, count) => sum + count, 0);
  const hasClearLevels = totalClearCount > 0;
  const denominator = hasClearLevels ? totalClearCount : totalCount;
  if (denominator <= 0) {
    return [];
  }

  reportDifficultyBandStatsMismatch({ bands, clearLevels, totalCount });

  return bands.flatMap<DifficultyBandStat>((band) => {
    const count = hasClearLevels ? (clearLevels[band.difficulty] ?? 0) : band.sampleCount;
    if (count <= 0) {
      return [];
    }
    return [
      {
        ...band,
        count,
        ratio: count / denominator,
      },
    ];
  });
}

function reportDifficultyBandStatsMismatch({
  bands,
  clearLevels,
  totalCount,
}: {
  bands: ClearTimeDifficultyBand[];
  clearLevels: Record<string, number>;
  totalCount: number;
}): void {
  const bandSampleCounts = new Map(bands.map((band) => [band.difficulty, band.sampleCount]));
  const missingClearLevels = bands
    .filter((band) => band.sampleCount > 0 && clearLevels[band.difficulty] === undefined)
    .map((band) => band.difficulty);
  const missingBands = Object.entries(clearLevels)
    .filter(([difficulty, count]) => count > 0 && !bandSampleCounts.has(difficulty))
    .map(([difficulty]) => difficulty);
  const mismatchedCounts = bands.flatMap((band) => {
    const overviewCount = clearLevels[band.difficulty];
    if (overviewCount === undefined || overviewCount === band.sampleCount) {
      return [];
    }

    return [{ difficulty: band.difficulty, overviewCount, distributionCount: band.sampleCount }];
  });

  if (missingClearLevels.length === 0 && missingBands.length === 0 && mismatchedCounts.length === 0) {
    return;
  }

  const reportKey = JSON.stringify({ missingClearLevels, missingBands, mismatchedCounts });
  if (reportedDifficultyBandStatsMismatches.has(reportKey)) {
    return;
  }

  reportedDifficultyBandStatsMismatches.add(reportKey);
  console.error("Raid difficulty stats mismatch between overview and clear-time distribution.", {
    clearLevels,
    totalCount,
    missingClearLevels,
    missingBands,
    mismatchedCounts,
  });
}

function getCachedRangeStats(cacheKey: string): RangeStats | undefined {
  const cached = rangeStatsCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }

  rangeStatsCache.delete(cacheKey);
  rangeStatsCache.set(cacheKey, cached);
  return cached;
}

function setCachedRangeStats(cacheKey: string, stats: RangeStats): void {
  rangeStatsCache.delete(cacheKey);
  rangeStatsCache.set(cacheKey, stats);

  while (rangeStatsCache.size > RANGE_STATS_CACHE_MAX_SIZE) {
    const oldestKey = rangeStatsCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    rangeStatsCache.delete(oldestKey);
  }
}

function distributionToSelectedRange(
  distribution: ClearTimeDistribution,
  selectedBandKey: string,
): SelectedRange | null {
  return rowsToSelection(buildClearTimeChartData(distribution, selectedBandKey).rows);
}

function timeBucketToScoreRange(
  band: ClearTimeDifficultyBand,
  timeBudgetSec: number,
  startSec: number,
  endSec: number,
): ScoreRange {
  const startScore = timeToScoreFromBand(band, timeBudgetSec, startSec);
  const endScore = timeToScoreFromBand(band, timeBudgetSec, endSec);
  return {
    gte: Math.min(startScore, endScore) + 1,
    lt: Math.max(startScore, endScore) + 1,
  };
}

function timeToScoreFromBand(band: ClearTimeDifficultyBand, timeBudgetSec: number, sec: number): number {
  return band.floorScore + band.scorePerSecond * (timeBudgetSec - sec);
}

function scoreToTimeFromBand(band: ClearTimeDifficultyBand, timeBudgetSec: number, score: number): number {
  return timeBudgetSec - (score - band.floorScore) / band.scorePerSecond;
}

function buildScoreMarker({
  score,
  rows,
  bands,
  timeBudgetSec,
}: {
  score: number;
  rows: HistogramChartRow[];
  bands: ClearTimeDifficultyBand[];
  timeBudgetSec: number;
}): ScoreMarker | null {
  const row = rows.find(
    (item) =>
      item.scoreRange && score >= item.scoreRange.gte && score < (item.scoreRange.lt ?? Number.POSITIVE_INFINITY),
  );
  if (!row?.difficulty) {
    return null;
  }

  const band = bands.find((item) => item.difficulty === row.difficulty);
  if (!band) {
    return null;
  }

  const timeSec = scoreToTimeFromBand(band, timeBudgetSec, score);
  if (timeSec < row.timeStartSec || timeSec > row.timeEndSec) {
    return {
      x: row.x,
      difficulty: row.difficulty,
      timeSec,
    };
  }

  const timeWidth = row.timeEndSec - row.timeStartSec;
  const x =
    timeWidth > 0
      ? row.xStart + Math.min(Math.max((row.timeEndSec - timeSec) / timeWidth, 0), 1) * (row.xEnd - row.xStart)
      : row.x;

  return {
    x,
    difficulty: row.difficulty,
    timeSec,
  };
}

function rowsBetween(
  start: HistogramChartRow,
  current: HistogramChartRow,
  rows: HistogramChartRow[],
): HistogramChartRow[] {
  const xStart = Math.min(start.x, current.x);
  const xEnd = Math.max(start.x, current.x);
  return rows.filter((row) => row.x >= xStart && row.x <= xEnd);
}

function rowsToSelection(rows: HistogramChartRow[]): SelectedRange | null {
  if (rows.length === 0) {
    return null;
  }
  const scoreRanges = mergeScoreRanges(rows.flatMap<ScoreRange>((row) => (row.scoreRange ? [row.scoreRange] : [])));
  if (scoreRanges.length === 0) {
    return null;
  }

  return {
    scoreRanges,
    displayRange: rowsToDisplayRange(rows),
  };
}

function mergeScoreRanges(ranges: ScoreRange[]): ScoreRange[] {
  const sortedRanges = [...ranges].sort((a, b) => a.gte - b.gte);
  const mergedRanges: ScoreRange[] = [];

  for (const range of sortedRanges) {
    const lastRange = mergedRanges.at(-1);
    if (!lastRange) {
      mergedRanges.push({ ...range });
      continue;
    }

    const lastLt = lastRange.lt ?? Number.POSITIVE_INFINITY;
    const rangeLt = range.lt ?? Number.POSITIVE_INFINITY;
    if (range.gte <= lastLt) {
      lastRange.lt = Math.max(lastLt, rangeLt);
      continue;
    }
    mergedRanges.push({ ...range });
  }

  return mergedRanges;
}

function rowsToDisplayRange(rows: HistogramChartRow[]): { xStart: number; xEnd: number } {
  if (rows.length === 0) {
    return { xStart: 0, xEnd: 0 };
  }
  return {
    xStart: Math.min(...rows.map((row) => row.xStart)),
    xEnd: Math.max(...rows.map((row) => row.xEnd)),
  };
}

function buildDifficultyBoundaryLines(rows: HistogramChartRow[]): { key: string; x: number }[] {
  if (rows.length === 0) {
    return [];
  }

  const lines: { key: string; x: number }[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.difficulty !== current.difficulty) {
      lines.push({ key: `${previous.difficulty}:${current.difficulty}:${index}`, x: index });
    }
  }
  return lines;
}

function buildDifficultySegmentTicks(rows: HistogramChartRow[]): {
  ticks: number[];
  labels: Record<string, string>;
} {
  const labels: Record<string, string> = {};
  const ticks: number[] = [];
  let segmentStartIndex = 0;

  for (let index = 1; index <= rows.length; index += 1) {
    if (index < rows.length && rows[index - 1].difficulty === rows[index].difficulty) {
      continue;
    }

    const startRow = rows[segmentStartIndex];
    const endRow = rows[index - 1];
    if (startRow?.difficulty && endRow) {
      const tick = (startRow.xStart + endRow.xEnd) / 2;
      const key = tick.toString();
      ticks.push(tick);
      labels[key] = formatDifficulty(startRow.difficulty);
    }
    segmentStartIndex = index;
  }

  return { ticks, labels };
}

function buildTimeTicksForRows(rows: HistogramChartRow[]): {
  ticks: number[];
  labels: Record<string, string>;
} {
  const labels: Record<string, string> = {};
  const ticks: number[] = [];
  const candidates = [rows[0], rows.find((row) => row.timeStartSec <= 1_800), rows.at(-1)].filter(
    (row): row is HistogramChartRow => row !== undefined,
  );

  for (const row of candidates) {
    const tick = row.x;
    const key = tick.toString();
    if (labels[key]) {
      continue;
    }
    ticks.push(tick);
    labels[key] = formatTimeLabel(row.timeEndSec >= 3_600 ? row.timeEndSec : row.timeStartSec);
  }

  return { ticks, labels };
}

function mergeRangeStats(stats: RangeStats[]): RangeStats {
  if (stats.length === 0) {
    return {
      sampleSize: 0,
      partyCounts: [],
      studentUsage: [],
      oftenUsedParties: [],
    };
  }
  if (stats.length === 1) {
    return stats[0];
  }

  const partyCounts = new Map<number, number>();
  const studentUsage = new Map<
    string,
    {
      ownCount: number;
      assistCount: number;
      slotsByTier: Map<number, number>;
      assistsByTier: Map<number, number>;
    }
  >();
  const oftenUsedParties = new Map<string, RangeStats["oftenUsedParties"][number]>();

  for (const item of stats) {
    for (const bucket of item.partyCounts) {
      partyCounts.set(bucket.partyCount, (partyCounts.get(bucket.partyCount) ?? 0) + bucket.entryCount);
    }

    for (const usage of item.studentUsage) {
      const merged = studentUsage.get(usage.studentUid) ?? {
        ownCount: 0,
        assistCount: 0,
        slotsByTier: new Map<number, number>(),
        assistsByTier: new Map<number, number>(),
      };
      merged.ownCount += usage.ownCount;
      merged.assistCount += usage.assistCount;
      for (const tier of usage.slotsByTier) {
        merged.slotsByTier.set(tier.tier, (merged.slotsByTier.get(tier.tier) ?? 0) + tier.count);
      }
      for (const tier of usage.assistsByTier) {
        merged.assistsByTier.set(tier.tier, (merged.assistsByTier.get(tier.tier) ?? 0) + tier.count);
      }
      studentUsage.set(usage.studentUid, merged);
    }

    for (const party of item.oftenUsedParties) {
      const key = getOftenUsedPartySignature(party);
      const current = oftenUsedParties.get(key);
      if (!current) {
        oftenUsedParties.set(key, { ...party });
        continue;
      }
      current.count += party.count;
      current.maxRank = Math.min(current.maxRank, party.maxRank);
      current.maxScore = Math.max(current.maxScore, party.maxScore);
    }
  }

  return {
    sampleSize: stats.reduce((sum, item) => sum + item.sampleSize, 0),
    partyCounts: Array.from(partyCounts.entries())
      .map(([partyCount, entryCount]) => ({ partyCount, entryCount }))
      .sort((a, b) => a.partyCount - b.partyCount),
    studentUsage: Array.from(studentUsage.entries())
      .map(([studentUid, usage]) => ({
        studentUid,
        ownCount: usage.ownCount,
        assistCount: usage.assistCount,
        slotsByTier: mapTierCountsToSortedArray(usage.slotsByTier),
        assistsByTier: mapTierCountsToSortedArray(usage.assistsByTier),
      }))
      .sort((a, b) => b.ownCount + b.assistCount - (a.ownCount + a.assistCount)),
    oftenUsedParties: Array.from(oftenUsedParties.values()).sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      return a.maxRank - b.maxRank;
    }),
  };
}

function mapTierCountsToSortedArray(tierCounts: Map<number, number>): { tier: number; count: number }[] {
  return Array.from(tierCounts.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.tier - a.tier);
}

function getOftenUsedPartySignature(party: RangeStats["oftenUsedParties"][number]): string {
  return JSON.stringify(party.parties);
}

function getRangeStatsCacheKey(params: {
  raidType: RaidType;
  season: number;
  defenseType: Defense;
  range: SelectedRange | null;
}) {
  if (!params.range) {
    return `${params.raidType}:${params.season}:${params.defenseType}:all`;
  }
  const rangeKey = params.range.scoreRanges.map((range) => `${range.gte}:${range.lt ?? "open"}`).join(",");
  return `${params.raidType}:${params.season}:${params.defenseType}:${rangeKey}`;
}

function isSameRange(left: ScoreRange, right: ScoreRange): boolean {
  return left.gte === right.gte && left.lt === right.lt;
}

function isSameSelectedRange(left: SelectedRange, right: SelectedRange): boolean {
  if (left.scoreRanges.length !== right.scoreRanges.length) {
    return false;
  }
  return left.scoreRanges.every((range, index) => isSameRange(range, right.scoreRanges[index]));
}

function getRowFromPointer({
  event,
  rows,
  xDomain,
}: {
  event: MouseEvent<HTMLDivElement>;
  rows: HistogramChartRow[];
  xDomain: [number, number];
}): HistogramChartRow | null {
  const rect = event.currentTarget.getBoundingClientRect();
  const plotLeft = rect.left + CHART_PADDING_PX;
  const plotRight = rect.right - CHART_PADDING_PX - Y_AXIS_WIDTH - CHART_MARGIN_RIGHT;
  const plotWidth = plotRight - plotLeft;
  if (plotWidth <= 0) {
    return null;
  }

  const ratio = Math.min(Math.max((event.clientX - plotLeft) / plotWidth, 0), 1);
  const x = xDomain[0] + (xDomain[1] - xDomain[0]) * ratio;
  return getClosestRow(rows, x);
}

function getClosestRow(rows: HistogramChartRow[], x: number): HistogramChartRow | null {
  return rows.reduce<HistogramChartRow | null>((closest, row) => {
    if (!closest) {
      return row;
    }
    return Math.abs(row.x - x) < Math.abs(closest.x - x) ? row : closest;
  }, null);
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

function formatTimeLabel(totalSeconds: number): string {
  const minute = Math.floor(totalSeconds / 60);
  const second = totalSeconds % 60;
  return `${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}`;
}

function formatTimeLabelWithMilliseconds(totalSeconds: number): string {
  const totalMilliseconds = Math.round(totalSeconds * 1_000);
  const minute = Math.floor(totalMilliseconds / 60_000);
  const second = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const millisecond = totalMilliseconds % 1_000;
  return `${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}.${millisecond.toString().padStart(3, "0")}`;
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

function parseScoreInput(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  const score = Number.parseInt(digits, 10);
  return Number.isFinite(score) && score > 0 ? score : null;
}

function formatScoreInput(value: string): string {
  const score = parseScoreInput(value);
  return score === null ? "" : score.toLocaleString();
}

function formatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDifficulty(difficulty: string): string {
  return difficultyLocale[difficulty as keyof typeof difficultyLocale] ?? difficulty;
}
