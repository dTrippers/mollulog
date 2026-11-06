import { ArrowPathIcon, FlagIcon, MapPinIcon, PlayIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { ShopSection } from "~/components/v2/features/events/ShopSection";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { PageMain } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import type {
  MinigamePayment,
  RewardItem,
  RoadPuzzleConfig,
  RoadPuzzleCoordinate,
  RoadPuzzleMap,
} from "~/domain/event-shop";
import { getRoadPuzzleRoundRows } from "~/domain/road-puzzle/calculator";
import type { RailCounts } from "~/domain/road-puzzle/solver";
import { roadPuzzleLocale } from "~/locales/ko";
import { useRoadPuzzleStats } from "~/lib/event-shop/hooks/useRoadPuzzleStats";
import { RoadPuzzleMapSvg } from "./RoadPuzzleMapSvg";
import { RoadPuzzleRouteSummary } from "./RoadPuzzleRouteSummary";
import {
  clearRoadPuzzleViewerState,
  loadRoadPuzzleViewerState,
  type RoadPuzzleViewerState,
  roadPuzzleViewerStorageKey,
  saveRoadPuzzleViewerState,
} from "./road-puzzle-viewer-persistence";
import { useRoadPuzzleMapAnalysis } from "./useRoadPuzzleMapAnalysis";

const EMPTY_ROAD_PUZZLE_MAPS: RoadPuzzleMap[] = [];
const EMPTY_ROAD_PUZZLE_MAP: RoadPuzzleMap = {
  uid: "",
  name: "",
  deck: { straight: 0, longCurve: 0, shortCurve: 0 },
  tiles: [],
  fixedRails: [],
};
const EMPTY_VIEWER_STATE: RoadPuzzleViewerState = { marks: [], remaining: null };
const VIEWER_ROUNDS = [1, 2, 3, 4, 5, 6, 7] as const;

function parsedRound(searchParams: URLSearchParams): number {
  const value = Number(searchParams.get("round"));
  if (!Number.isFinite(value)) return 1;
  if (value >= 7) return 7;
  return (VIEWER_ROUNDS as readonly number[]).includes(value) ? value : 1;
}

function parsedMapNumber(searchParams: URLSearchParams): number {
  const value = Number(searchParams.get("map"));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 1;
}

function findRound(config: RoadPuzzleConfig, selectedRound: number) {
  return (
    config.rounds.find((round) => round.round === selectedRound) ??
    config.rounds.find((round) => round.isLoop && selectedRound >= round.round)
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto whitespace-nowrap text-xs text-v2-fg-secondary">
      <span className="inline-flex items-center gap-1">
        <PlayIcon className="size-3 text-v2-fg" aria-hidden="true" />
        {roadPuzzleLocale.start}
      </span>
      <span className="inline-flex items-center gap-1">
        <FlagIcon className="size-3 text-v2-fg" aria-hidden="true" />
        {roadPuzzleLocale.end}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-full border border-v2-fg" aria-hidden="true" />
        {roadPuzzleLocale.transit}
      </span>
      <span className="inline-flex items-center gap-1" title={roadPuzzleLocale.rewardHelp}>
        <MapPinIcon className="size-3 text-v2-fg" aria-hidden="true" />
        {roadPuzzleLocale.reward}
        <span className="sr-only">{roadPuzzleLocale.rewardHelp}</span>
      </span>
    </div>
  );
}

function RoadPuzzleRewardCards({ rewards }: { rewards: readonly RewardItem[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {rewards.map((reward) => (
        <ResourceThumb
          key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
          resourceType={reward.resourceType}
          itemUid={reward.resourceUid}
          imageUrl={reward.imageUrl ?? undefined}
          name={reward.resourceName}
          rarity={reward.rarity}
          quantity={reward.quantity}
          tooltip
        />
      ))}
    </div>
  );
}

function RoadPuzzleRoundRewards({ config }: { config: RoadPuzzleConfig }) {
  const rows = getRoadPuzzleRoundRows(config, {}, 1, 7, 1);
  const hasRewardData =
    rows.length === 7 &&
    rows.every(
      ({ completionRewards, pathRewards }) =>
        completionRewards.length > 0 &&
        completionRewards.every(({ resourceName }) => Boolean(resourceName)) &&
        pathRewards.every(({ resourceName }) => Boolean(resourceName)),
    );

  return (
    <ShopSection
      title={roadPuzzleLocale.roundDetails}
      persistenceKey="event-road-puzzle-section::round-rewards"
      variant="shop"
    >
      {hasRewardData ? (
        <div className="space-y-v2-block-gap">
          {rows.map(({ round, isLoop, completionRewards, pathRewards }) => (
            <div key={round} className="space-y-2 rounded-md bg-v2-surface p-v2-tile-p">
              <span className="whitespace-nowrap text-sm font-semibold text-v2-fg">
                {isLoop ? roadPuzzleLocale.mapRound(7) : roadPuzzleLocale.roundLabel(round)}
              </span>
              <div className="grid grid-cols-1 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-start sm:gap-x-2">
                <span className="text-xs text-v2-fg-secondary">{roadPuzzleLocale.totalRewards}</span>
                <RoadPuzzleRewardCards rewards={completionRewards} />
              </div>
              {!isLoop && (
                <div className="grid grid-cols-1 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)] sm:items-start sm:gap-x-2">
                  <span className="text-xs text-v2-fg-secondary">{roadPuzzleLocale.pathRewards}</span>
                  <RoadPuzzleRewardCards rewards={pathRewards} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <StatusNotice tone="neutral">{roadPuzzleLocale.rewardDataMissing}</StatusNotice>
      )}
    </ShopSection>
  );
}

export type RoadPuzzleViewerPageProps = {
  config: RoadPuzzleConfig | null;
  payment: MinigamePayment | null;
};

export function RoadPuzzleViewerPage({ config, payment }: RoadPuzzleViewerPageProps) {
  const { uid: eventUid } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRound = parsedRound(searchParams);
  const selectedMapNumber = parsedMapNumber(searchParams);
  const roundConfig = config ? findRound(config, selectedRound) : undefined;
  const mapNumber = roundConfig?.isLoop ? selectedMapNumber : 1;
  const mapUid = roundConfig?.mapUids[mapNumber - 1];
  const selectedMap = config?.maps.find((map) => map.uid === mapUid);
  const calculation = useRoadPuzzleStats(config?.maps ?? EMPTY_ROAD_PUZZLE_MAPS, Boolean(config));
  const [highlightedRailKind, setHighlightedRailKind] = useState<keyof RailCounts | null>(null);
  const [showPendingChip, setShowPendingChip] = useState(false);
  const [focusedCell, setFocusedCell] = useState<RoadPuzzleCoordinate | null>(null);
  const stateKey = eventUid && selectedMap ? roadPuzzleViewerStorageKey(eventUid, selectedRound, mapNumber) : "";
  const [viewerEntry, setViewerEntry] = useState<{ key: string; value: RoadPuzzleViewerState }>({
    key: "",
    value: EMPTY_VIEWER_STATE,
  });
  const [undoByKey, setUndoByKey] = useState<Record<string, RoadPuzzleCoordinate[][]>>({});
  const stateReady = !stateKey || viewerEntry.key === stateKey;
  const viewerState = viewerEntry.key === stateKey ? viewerEntry.value : EMPTY_VIEWER_STATE;
  const historyKey = stateKey || selectedMap?.uid || "";
  const undoStack = undoByKey[historyKey] ?? [];

  useEffect(() => {
    if (!stateKey || !selectedMap || !eventUid) {
      setViewerEntry({ key: stateKey, value: EMPTY_VIEWER_STATE });
      return;
    }
    setViewerEntry({
      key: stateKey,
      value: loadRoadPuzzleViewerState(eventUid, selectedRound, mapNumber, selectedMap) ?? EMPTY_VIEWER_STATE,
    });
  }, [eventUid, mapNumber, selectedMap, selectedRound, stateKey]);

  useEffect(() => {
    if (!stateKey || !eventUid || !selectedMap || !stateReady) return;
    if (viewerState.marks.length === 0 && viewerState.remaining === null) {
      clearRoadPuzzleViewerState(eventUid, selectedRound, mapNumber);
    } else {
      saveRoadPuzzleViewerState(eventUid, selectedRound, mapNumber, viewerState);
    }
  }, [eventUid, mapNumber, selectedMap, selectedRound, stateKey, stateReady, viewerState]);

  const selectedMapUidRef = useRef(selectedMap?.uid);
  const updateViewerState = (update: (current: RoadPuzzleViewerState) => RoadPuzzleViewerState) => {
    if (!stateReady) return;
    setViewerEntry((current) => ({
      key: stateKey,
      value: update(current.key === stateKey ? current.value : EMPTY_VIEWER_STATE),
    }));
  };

  const marks = viewerState.marks;
  const remaining = viewerState.remaining;
  const isProgress = Boolean(
    remaining &&
      selectedMap &&
      (Object.keys(selectedMap.deck) as (keyof RailCounts)[]).some((kind) => remaining[kind] < selectedMap.deck[kind]),
  );
  const hasInteractiveState = marks.length > 0 || isProgress;
  const interactiveCalculation = useRoadPuzzleMapAnalysis(
    selectedMap ?? EMPTY_ROAD_PUZZLE_MAP,
    marks,
    remaining,
    Boolean(selectedMap && stateReady && hasInteractiveState),
  );
  const baselineSolution =
    selectedMap && calculation.status === "ready" ? (calculation.resultsByUid[selectedMap.uid] ?? null) : null;
  const displayedAnalysis =
    hasInteractiveState &&
    interactiveCalculation.status !== "failed" &&
    interactiveCalculation.analysisMapUid === selectedMap?.uid
      ? interactiveCalculation.analysis
      : null;
  const routeFromAnalysis =
    displayedAnalysis?.witness && displayedAnalysis.requiredVector
      ? { witness: displayedAnalysis.witness, minimumVector: displayedAnalysis.requiredVector }
      : null;
  const solution = hasInteractiveState
    ? interactiveCalculation.status === "failed"
      ? null
      : displayedAnalysis
        ? routeFromAnalysis
        : baselineSolution
    : baselineSolution;
  const analysisPending = hasInteractiveState && interactiveCalculation.status === "pending";
  const calculationPending = hasInteractiveState ? analysisPending : calculation.status === "pending";
  const calculationFailed = hasInteractiveState
    ? interactiveCalculation.status === "failed"
    : calculation.status === "failed";
  const showStaleResult = analysisPending && Boolean(displayedAnalysis || baselineSolution);
  const showAnalysisError =
    hasInteractiveState && interactiveCalculation.status === "ready" && displayedAnalysis?.status === "no-route";
  const summaryCalculating = hasInteractiveState
    ? analysisPending && !displayedAnalysis && !baselineSolution
    : calculationPending;
  const summaryProgress = displayedAnalysis
    ? displayedAnalysis.status === "incomplete" || displayedAnalysis.status === "completable"
    : analysisPending
      ? false
      : isProgress;
  const retryCalculation = hasInteractiveState ? interactiveCalculation.retry : calculation.retry;

  const toggleMark = (cell: RoadPuzzleCoordinate) => {
    if (!stateReady) return;
    setUndoByKey((current) => ({
      ...current,
      [historyKey]: [...(current[historyKey] ?? []), viewerState.marks.map((mark) => ({ ...mark }))],
    }));
    updateViewerState((current) => {
      const key = `${cell.x},${cell.y},${cell.z}`;
      const hasMark = current.marks.some((mark) => `${mark.x},${mark.y},${mark.z}` === key);
      return {
        ...current,
        marks: hasMark
          ? current.marks.filter((mark) => `${mark.x},${mark.y},${mark.z}` !== key)
          : [...current.marks, cell],
      };
    });
  };

  const updateRemaining = (kind: keyof RailCounts, value: number) => {
    if (!selectedMap || !stateReady) return;
    updateViewerState((current) => {
      const next = { ...(current.remaining ?? selectedMap.deck), [kind]: value };
      const unchanged = (Object.keys(selectedMap.deck) as (keyof RailCounts)[]).every(
        (railKind) => next[railKind] === selectedMap.deck[railKind],
      );
      return { ...current, remaining: unchanged ? null : next };
    });
  };

  const undoMark = () => {
    const previousMarks = undoStack.at(-1);
    if (!previousMarks) return;
    setUndoByKey((current) => {
      const currentHistory = current[historyKey];
      return currentHistory ? { ...current, [historyKey]: currentHistory.slice(0, -1) } : current;
    });
    updateViewerState((current) => ({ ...current, marks: previousMarks }));
  };

  const resetState = () => {
    updateViewerState(() => EMPTY_VIEWER_STATE);
    setUndoByKey((current) => ({ ...current, [historyKey]: [] }));
    if (stateKey && eventUid) clearRoadPuzzleViewerState(eventUid, selectedRound, mapNumber);
  };

  useEffect(() => {
    const mapChanged = selectedMapUidRef.current !== selectedMap?.uid;
    selectedMapUidRef.current = selectedMap?.uid;
    if (mapChanged) {
      setHighlightedRailKind(null);
      setFocusedCell(null);
    }
  }, [selectedMap?.uid]);

  useEffect(() => {
    if (!calculationPending) {
      setShowPendingChip(false);
      return;
    }
    setShowPendingChip(false);
    const timer = setTimeout(() => setShowPendingChip(true), 300);
    return () => clearTimeout(timer);
  }, [calculationPending]);

  const setSelection = (round: number, map: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("round", String(round));
    next.set("map", String(map));
    setSearchParams(next, { replace: true });
  };

  const missingData = !config || !payment || !roundConfig || !selectedMap;

  return (
    <PageMain>
      <div className="space-y-v2-section-gap">
        <ShopSection title={roadPuzzleLocale.title} persistenceKey="event-road-puzzle-section::board" variant="shop">
          {missingData ? (
            <StatusNotice tone="neutral">{roadPuzzleLocale.noData}</StatusNotice>
          ) : (
            <div className="space-y-v2-block-gap">
              <SelectionChips
                labelId="road-puzzle-round-label"
                label={roadPuzzleLocale.round}
                options={VIEWER_ROUNDS.map((round) => ({
                  value: round,
                  text: round === 7 ? roadPuzzleLocale.mapRound(7) : roadPuzzleLocale.roundLabel(round),
                }))}
                selected={selectedRound}
                onSelect={(round) => setSelection(round, 1)}
              />
              {roundConfig.isLoop && (
                <SelectionChips
                  labelId="road-puzzle-map-label"
                  label={roadPuzzleLocale.map}
                  options={[1, 2, 3, 4, 5].map((number) => ({
                    value: number,
                    text: roadPuzzleLocale.mapNumber(number),
                  }))}
                  selected={selectedMapNumber}
                  onSelect={(number) => setSelection(selectedRound, number)}
                />
              )}

              <p className="text-xs text-v2-fg-secondary">{roadPuzzleLocale.viewerGuide}</p>

              {showAnalysisError && (
                <StatusNotice
                  tone="warning"
                  action={
                    <Button size="sm" disabled={undoStack.length === 0} onClick={undoMark}>
                      {roadPuzzleLocale.undo}
                    </Button>
                  }
                >
                  {roadPuzzleLocale.noRouteThroughMarks}
                </StatusNotice>
              )}

              {calculationFailed && (
                <StatusNotice
                  tone="danger"
                  action={
                    <Button size="sm" onClick={retryCalculation}>
                      {roadPuzzleLocale.retry}
                    </Button>
                  }
                >
                  {roadPuzzleLocale.routeFailed}
                </StatusNotice>
              )}

              <div className="grid items-start gap-v2-group-gap md:grid-cols-[minmax(0,2.5fr)_minmax(0,2fr)]">
                <div className="relative rounded-md bg-v2-surface p-v2-tile-p">
                  {showPendingChip && (
                    <div className="absolute inset-x-0 top-2 z-10 flex justify-center" role="status">
                      <span className="inline-flex items-center gap-2 rounded-md bg-v2-elevated px-3 py-1.5 text-sm font-medium text-v2-fg shadow-sm">
                        <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        {roadPuzzleLocale.computingRoute}
                      </span>
                    </div>
                  )}
                  <RoadPuzzleMapSvg
                    map={selectedMap}
                    solution={calculationFailed ? null : solution}
                    round={selectedRound}
                    mapNumber={mapNumber}
                    highlightedRailKind={highlightedRailKind}
                    marks={marks}
                    focusedCell={focusedCell}
                    onToggleMark={toggleMark}
                    onFocusCell={setFocusedCell}
                    noRoute={displayedAnalysis?.status === "no-route" && !calculationFailed}
                    isStale={showStaleResult}
                  />
                  <Legend />
                </div>

                <div>
                  {!hasInteractiveState && calculation.status === "ready" && baselineSolution === null && (
                    <p className="mb-3 text-sm text-v2-fg-secondary" role="status">
                      {roadPuzzleLocale.routeNotFound}
                    </p>
                  )}
                  <RoadPuzzleRouteSummary
                    map={selectedMap}
                    solution={calculationFailed ? null : baselineSolution}
                    analysis={calculationFailed ? null : displayedAnalysis}
                    remaining={remaining}
                    payment={payment}
                    isCalculating={summaryCalculating}
                    isStale={showStaleResult}
                    isProgress={summaryProgress}
                    hasState={marks.length > 0 || isProgress}
                    selectedRailKind={highlightedRailKind}
                    onRemainingChange={updateRemaining}
                    onReset={resetState}
                    onSelectRailKind={(kind) => setHighlightedRailKind((current) => (current === kind ? null : kind))}
                  />
                </div>
              </div>

              <p className="sr-only" role="status" aria-live="polite">
                {!hasInteractiveState
                  ? calculation.status === "ready"
                    ? roadPuzzleLocale.calculationComplete
                    : calculationFailed
                      ? roadPuzzleLocale.routeFailed
                      : ""
                  : calculationPending
                    ? ""
                    : calculationFailed
                      ? roadPuzzleLocale.routeFailed
                      : displayedAnalysis?.status === "no-route"
                        ? roadPuzzleLocale.noRouteThroughMarks
                        : displayedAnalysis?.status === "completable"
                          ? roadPuzzleLocale.canCompleteNow
                          : displayedAnalysis?.status === "incomplete"
                            ? roadPuzzleLocale.progressExpectationLive(
                                Math.round(displayedAnalysis.expectedStickers ?? 0),
                              )
                            : roadPuzzleLocale.calculationComplete}
              </p>
            </div>
          )}
        </ShopSection>
        {config && <RoadPuzzleRoundRewards config={config} />}
      </div>
    </PageMain>
  );
}

function SelectionChips({
  labelId,
  label,
  options,
  selected,
  onSelect,
}: {
  labelId: string;
  label: string;
  options: { value: number; text: string }[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span id={labelId} className="shrink-0 text-sm text-v2-fg-secondary">
        {label}
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: The pressed chips form a named single-selection control. */}
      <div role="group" aria-labelledby={labelId} className="min-w-0 flex-1 overflow-x-auto pb-1">
        <div className="flex w-max gap-1 whitespace-nowrap">
          {options.map(({ value, text }) => (
            <ToggleChip key={value} pressed={selected === value} onPressedChange={() => onSelect(value)}>
              {text}
            </ToggleChip>
          ))}
        </div>
      </div>
    </div>
  );
}
