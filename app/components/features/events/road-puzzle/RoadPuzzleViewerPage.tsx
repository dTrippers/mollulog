import { ArrowPathIcon, FlagIcon, PlayIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button, Callout, FilterButtons, HoverTooltip, Section } from "~/components/primitives";
import type { MinigamePayment, RoadPuzzleConfig, RoadPuzzleMap } from "~/domain/event-shop";
import type { RailCounts } from "~/domain/road-puzzle/solver";
import { roadPuzzleLocale } from "~/locales/ko";
import { useRoadPuzzleStats } from "../shop/hooks/useRoadPuzzleStats";
import { RoadPuzzleMapSvg } from "./RoadPuzzleMapSvg";
import { RoadPuzzleRouteSummary } from "./RoadPuzzleRouteSummary";

const EMPTY_ROAD_PUZZLE_MAPS: RoadPuzzleMap[] = [];
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
    <div className="mt-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <PlayIcon className="size-3 text-foreground" aria-hidden="true" />
        {roadPuzzleLocale.start}
      </span>
      <span className="inline-flex items-center gap-1">
        <FlagIcon className="size-3 text-foreground" aria-hidden="true" />
        {roadPuzzleLocale.end}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-full border border-foreground" aria-hidden="true" />
        {roadPuzzleLocale.transit}
      </span>
    </div>
  );
}

export type RoadPuzzleViewerPageProps = {
  config: RoadPuzzleConfig | null;
  payment: MinigamePayment | null;
};

export function RoadPuzzleViewerPage({ config, payment }: RoadPuzzleViewerPageProps) {
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
  const selectedMapUidRef = useRef(selectedMap?.uid);

  useEffect(() => {
    const mapChanged = selectedMapUidRef.current !== selectedMap?.uid;
    selectedMapUidRef.current = selectedMap?.uid;
    if (mapChanged) setHighlightedRailKind(null);
    if (calculation.status !== "pending") {
      setShowPendingChip(false);
      return;
    }
    setShowPendingChip(false);
    const timer = setTimeout(() => setShowPendingChip(true), 300);
    return () => clearTimeout(timer);
  }, [calculation.status, selectedMap?.uid]);

  const setSelection = (round: number, map: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("round", String(round));
    next.set("map", String(map));
    setSearchParams(next, { replace: true });
  };

  const calculationPending = calculation.status === "pending";
  const calculationFailed = calculation.status === "failed";
  const solution =
    selectedMap && calculation.status === "ready" ? (calculation.resultsByUid[selectedMap.uid] ?? null) : null;
  const missingData = !config || !payment || !roundConfig || !selectedMap;

  const roundButtons = VIEWER_ROUNDS.map((round) => ({
    text: round === 7 ? roadPuzzleLocale.mapRound(7) : roadPuzzleLocale.roundLabel(round),
    active: selectedRound === round,
    onToggle: (active: boolean) => {
      if (active) setSelection(round, 1);
    },
  }));
  const mapButtons = [1, 2, 3, 4, 5].map((number) => ({
    text: roadPuzzleLocale.mapNumber(number),
    active: selectedMapNumber === number,
    onToggle: (active: boolean) => {
      if (active) setSelection(selectedRound, number);
    },
  }));

  return (
    <Section title={roadPuzzleLocale.title}>
      {missingData ? (
        <Callout>{roadPuzzleLocale.noData}</Callout>
      ) : (
        <>
          <div className="mb-2">
            <span id="road-puzzle-round-label" className="mb-1 block text-xs font-semibold text-muted-foreground">
              {roadPuzzleLocale.round}
            </span>
            <fieldset aria-labelledby="road-puzzle-round-label" className="m-0 min-w-0 border-0 p-0">
              <FilterButtons exclusive atLeastOne size="sm" buttonProps={roundButtons} className="my-0" />
            </fieldset>
          </div>
          {roundConfig.isLoop && (
            <div>
              <span id="road-puzzle-map-label" className="mb-1 block text-xs font-semibold text-muted-foreground">
                {roadPuzzleLocale.map}
              </span>
              <fieldset aria-labelledby="road-puzzle-map-label" className="m-0 min-w-0 border-0 p-0">
                <FilterButtons exclusive atLeastOne size="sm" buttonProps={mapButtons} className="my-0" />
              </fieldset>
            </div>
          )}

          {calculationFailed && (
            <div className="my-3" role="alert">
              <Callout tone="destructive" className="flex flex-wrap items-center justify-between gap-3">
                <span>{roadPuzzleLocale.routeFailed}</span>
                <Button text={roadPuzzleLocale.retry} size="sm" variant="secondary" onClick={calculation.retry} />
              </Callout>
            </div>
          )}

          <div className="mt-4 grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="relative rounded-md bg-card p-3">
              {showPendingChip && (
                <div className="absolute inset-x-0 top-2 z-10 flex justify-center" role="status">
                  <span className="inline-flex items-center gap-2 rounded-md bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-sm">
                    <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {roadPuzzleLocale.computingRoute}
                  </span>
                </div>
              )}
              <RoadPuzzleMapSvg
                map={selectedMap}
                solution={calculationPending || calculationFailed ? null : solution}
                round={selectedRound}
                mapNumber={mapNumber}
                highlightedRailKind={highlightedRailKind}
              />
              <Legend />
            </div>

            <div>
              {calculation.status === "ready" && solution === null && (
                <p className="mb-3 text-sm text-muted-foreground" role="status">
                  {roadPuzzleLocale.routeNotFound}
                </p>
              )}
              <RoadPuzzleRouteSummary
                map={selectedMap}
                solution={calculationFailed || calculationPending ? null : solution}
                payment={payment}
                isCalculating={calculationPending}
                selectedRailKind={highlightedRailKind}
                onSelectRailKind={(kind) => setHighlightedRailKind((current) => (current === kind ? null : kind))}
              />
            </div>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {calculation.status === "ready"
              ? roadPuzzleLocale.calculationComplete
              : calculationFailed
                ? roadPuzzleLocale.routeFailed
                : ""}
          </p>
        </>
      )}
    </Section>
  );
}
