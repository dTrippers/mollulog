import { ArrowPathIcon, CheckIcon } from "@heroicons/react/16/solid";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ShopSection } from "~/components/v2/features/events/ShopSection";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { PageMain } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import type { TreasureHuntConfig, TreasureHuntRoundConfig } from "~/domain/event-shop";
import type { TreasureHuntBoardCoordinate, TreasureHuntBoardOrientation } from "~/domain/treasure-hunt";
import {
  loadTreasureHuntBoard,
  MAX_UNDO_SNAPSHOTS,
  normalizeTreasureHuntBoardRounds,
  type PersistedTreasureHuntBoard,
  type RecordedTreasure,
  saveTreasureHuntBoard,
  type TreasureHuntBoardSnapshot,
} from "~/lib/treasure-hunt/board-persistence";
import {
  createBoardObservation,
  createTreasureHuntComposition,
  getPlacementFailure,
  getRemainingTreasureShapes,
  isObservationStructurallyValid,
  placementSize,
  shapeKey,
} from "~/lib/treasure-hunt/board-utils";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { useTreasureHuntBoardAnalysis } from "~/lib/treasure-hunt/useTreasureHuntBoardAnalysis";
import { treasureHuntLocale } from "~/locales/ko";

type TreasureHuntScreenProps = { eventUid: string; config: TreasureHuntConfig | null };
type SelectedShape = { width: number; height: number; orientation: TreasureHuntBoardOrientation };
const EMPTY_BOARD: TreasureHuntBoardSnapshot = { round: 1, knownEmpty: [], foundTreasures: [] };

export function TreasureHuntScreen({ eventUid, config }: TreasureHuntScreenProps) {
  if (!config) {
    return (
      <PageMain>
        <StatusNotice tone="neutral">{treasureHuntLocale.noData}</StatusNotice>
      </PageMain>
    );
  }
  return <ConfiguredTreasureHuntScreen key={eventUid} eventUid={eventUid} config={config} />;
}

function ConfiguredTreasureHuntScreen({ eventUid, config }: { eventUid: string; config: TreasureHuntConfig }) {
  const [persisted, setPersisted] = useState<PersistedTreasureHuntBoard>({
    version: 1,
    board: EMPTY_BOARD,
    undoStack: [],
    nextTreasureId: 1,
  });
  const [restored, setRestored] = useState(false);
  const [placement, setPlacement] = useState<SelectedShape | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [cellPointer, setCellPointer] = useState<TreasureHuntBoardCoordinate | null>(null);
  const [keyboardCoordinate, setKeyboardCoordinate] = useState<TreasureHuntBoardCoordinate>({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingCalculationRef = useRef(false);
  const previousAnalysisStatusRef = useRef("calculating");

  useEffect(() => {
    const saved = loadTreasureHuntBoard(eventUid);
    if (saved) setPersisted(normalizeTreasureHuntBoardRounds(saved, config.loopRound));
    setRestored(true);
  }, [config.loopRound, eventUid]);

  useEffect(() => {
    if (restored) saveTreasureHuntBoard(eventUid, persisted);
  }, [eventUid, persisted, restored]);

  const round = getRoundConfig(config, persisted.board.round);
  const composition = useMemo(() => createTreasureHuntComposition(round), [round]);
  const observation = useMemo(() => createBoardObservation(persisted.board), [persisted.board]);
  const structurallyValid = isObservationStructurallyValid(composition, observation);
  const analysis = useTreasureHuntBoardAnalysis(composition, observation, structurallyValid);
  useEffect(() => {
    const completedCalculation = previousAnalysisStatusRef.current === "calculating" && analysis.status === "ok";
    previousAnalysisStatusRef.current = analysis.status;
    if (!completedCalculation || !pendingCalculationRef.current) return;
    pendingCalculationRef.current = false;
    trackGoogleAnalyticsEvent("minigame_calculated", { game: "treasure_hunt" });
  }, [analysis.status]);
  const remaining = getRemainingTreasureShapes(round, persisted.board.foundTreasures);
  const foundCount = persisted.board.foundTreasures.length;
  const complete = structurallyValid && remaining.length > 0 && remaining.every((shape) => shape.remaining === 0);
  const occupied = useMemo(() => {
    const cells = new Map<string, RecordedTreasure>();
    for (const treasure of persisted.board.foundTreasures) {
      const size = placementSize(treasure.width, treasure.height, treasure.orientation);
      for (let y = treasure.y; y < treasure.y + size.height; y += 1) {
        for (let x = treasure.x; x < treasure.x + size.width; x += 1) cells.set(`${x},${y}`, treasure);
      }
    }
    return cells;
  }, [persisted.board.foundTreasures]);
  const empty = useMemo(
    () => new Set(persisted.board.knownEmpty.map(({ x, y }) => `${x},${y}`)),
    [persisted.board.knownEmpty],
  );
  const selected = persisted.board.foundTreasures.find((treasure) => treasure.id === selectedId) ?? null;
  const remainingCount = remaining.reduce((sum, shape) => sum + shape.remaining, 0);
  const probabilityReady =
    analysis.status === "ok" || (analysis.status === "calculating" && analysis.result?.status === "ok");
  const isCalculating = analysis.status === "calculating";

  function commitBoard(board: TreasureHuntBoardSnapshot, nextTreasureId = persisted.nextTreasureId) {
    pendingCalculationRef.current = true;
    setPersisted((current) => ({
      ...current,
      board,
      undoStack: [...current.undoStack, current.board].slice(-MAX_UNDO_SNAPSHOTS),
      nextTreasureId,
    }));
    setPlacement(null);
    setSelectedId(null);
    setInvalidMessage(null);
  }

  function handleCell(x: number, y: number) {
    setInvalidMessage(null);
    if (placement) {
      const failure = getPlacementFailure(round, persisted.board, placement, { x, y });
      if (failure) {
        setInvalidMessage(
          failure === "overlap" ? treasureHuntLocale.placementOverlap : treasureHuntLocale.placementOutOfBounds,
        );
        return;
      }
      const found: RecordedTreasure = { id: persisted.nextTreasureId, x, y, ...placement };
      commitBoard(
        { ...persisted.board, foundTreasures: [...persisted.board.foundTreasures, found] },
        persisted.nextTreasureId + 1,
      );
      return;
    }
    const treasure = occupied.get(`${x},${y}`);
    if (treasure) {
      setSelectedId(treasure.id);
      return;
    }
    const key = `${x},${y}`;
    const knownEmpty = empty.has(key)
      ? persisted.board.knownEmpty.filter((cell) => `${cell.x},${cell.y}` !== key)
      : [...persisted.board.knownEmpty, { x, y }];
    commitBoard({ ...persisted.board, knownEmpty });
  }

  function undo() {
    const previous = persisted.undoStack.at(-1);
    if (!previous) return;
    pendingCalculationRef.current = true;
    setPersisted((current) => ({ ...current, board: previous, undoStack: current.undoStack.slice(0, -1) }));
    setPlacement(null);
    setSelectedId(null);
    setInvalidMessage(null);
  }

  function reset() {
    commitBoard({ round: persisted.board.round, knownEmpty: [], foundTreasures: [] });
  }

  function changeRound(nextRound: number) {
    if (nextRound === persisted.board.round) return;
    commitBoard({ round: nextRound, knownEmpty: [], foundTreasures: [] });
  }

  function startNextRound(nextRound: number) {
    commitBoard({ round: nextRound, knownEmpty: [], foundTreasures: [] });
  }

  function handleBoardKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && (placement || selectedId !== null)) {
      event.preventDefault();
      setPlacement(null);
      setSelectedId(null);
      setCellPointer(null);
      return;
    }
    const directions: Record<string, TreasureHuntBoardCoordinate> = {
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
    };
    const delta = directions[event.key];
    if (!delta) return;
    const candidates = focusableCoordinates
      .filter(({ x, y }) =>
        delta.x
          ? y === focusedCell.y && Math.sign(x - focusedCell.x) === delta.x
          : x === focusedCell.x && Math.sign(y - focusedCell.y) === delta.y,
      )
      .sort(
        (a, b) =>
          Math.abs(a.x - focusedCell.x) +
          Math.abs(a.y - focusedCell.y) -
          (Math.abs(b.x - focusedCell.x) + Math.abs(b.y - focusedCell.y)),
      );
    const next = candidates[0];
    if (!next) return;
    event.preventDefault();
    setKeyboardCoordinate(next);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-board-x="${next.x}"][data-board-y="${next.y}"]`)
      ?.focus();
  }

  function removeSelected() {
    if (!selected) return;
    commitBoard({
      ...persisted.board,
      foundTreasures: persisted.board.foundTreasures.filter((treasure) => treasure.id !== selected.id),
    });
  }

  const rows = Array.from({ length: composition.boardWidth * composition.boardHeight }, (_, index) => ({
    x: index % composition.boardWidth,
    y: Math.floor(index / composition.boardWidth),
  }));
  const focusableCoordinates = rows.filter(({ x, y }) => {
    const treasure = occupied.get(`${x},${y}`);
    return (!complete && !treasure) || (treasure?.x === x && treasure.y === y);
  });
  const focusedCell = focusableCoordinates.some(({ x, y }) => x === keyboardCoordinate.x && y === keyboardCoordinate.y)
    ? keyboardCoordinate
    : (focusableCoordinates[0] ?? { x: 0, y: 0 });
  const placementPreview =
    placement && cellPointer
      ? {
          size: placementSize(placement.width, placement.height, placement.orientation),
          valid: getPlacementFailure(round, persisted.board, placement, cellPointer) === null,
        }
      : null;
  const nextRound = persisted.board.round < config.loopRound ? persisted.board.round + 1 : config.loopRound;
  const nextRoundLabel =
    nextRound === config.loopRound ? treasureHuntLocale.roundAfter(config.loopRound) : `${nextRound}회차`;

  return (
    <PageMain>
      <div className="space-y-v2-block-gap">
        <ShopSection
          title={treasureHuntLocale.boardTitle}
          persistenceKey="event-treasure-hunt-section::board"
          variant="shop"
        >
          <section className="space-y-v2-block-gap">
            <p className="text-sm text-v2-fg-secondary">{treasureHuntLocale.boardCaption}</p>

            <div className="flex min-w-0 items-center gap-2">
              <span id="treasure-hunt-round-label" className="shrink-0 text-sm text-v2-fg-secondary">
                {treasureHuntLocale.boardRound}
              </span>
              {/* biome-ignore lint/a11y/useSemanticElements: The pressed buttons form a named single-selection control. */}
              <div
                role="group"
                aria-labelledby="treasure-hunt-round-label"
                className="min-w-0 flex-1 overflow-x-auto pb-1"
              >
                <div className="flex w-max gap-1 whitespace-nowrap">
                  {Array.from({ length: config.loopRound }, (_, index) => index + 1).map((value) => {
                    const label =
                      value === config.loopRound ? treasureHuntLocale.roundAfter(config.loopRound) : `${value}회차`;
                    return (
                      <ToggleChip
                        key={value}
                        pressed={persisted.board.round === value}
                        onPressedChange={() => changeRound(value)}
                      >
                        {label}
                      </ToggleChip>
                    );
                  })}
                </div>
              </div>
            </div>

            {analysis.status === "failed" ? (
              <StatusNotice
                tone="danger"
                action={
                  <Button size="sm" onClick={analysis.retry}>
                    {treasureHuntLocale.retry}
                  </Button>
                }
              >
                {treasureHuntLocale.boardFailed}
              </StatusNotice>
            ) : !structurallyValid || analysis.status === "inconsistent" ? (
              <StatusNotice
                tone="danger"
                action={
                  <Button size="sm" onClick={undo} disabled={persisted.undoStack.length === 0}>
                    {treasureHuntLocale.undo}
                  </Button>
                }
              >
                {treasureHuntLocale.boardInconsistent}
              </StatusNotice>
            ) : complete ? (
              <StatusNotice tone="success">{treasureHuntLocale.noRemainingTreasure}</StatusNotice>
            ) : analysis.result?.status === "ok" ? (
              <p className="text-sm font-medium text-v2-fg-secondary">
                {treasureHuntLocale.recommendation(
                  analysis.result.recommended.length,
                  Math.round(maximumProbability(analysis.result.cells) * 100),
                )}
              </p>
            ) : null}

            {/* Wide pages put the remaining treasures beside the board instead of below it. */}
            <div className="@container">
              <div className="grid items-start gap-v2-group-gap @min-[48rem]:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
                <div className="relative mx-auto w-full max-w-[34rem] rounded-lg bg-v2-surface p-2">
                  {/* biome-ignore lint/a11y/useSemanticElements: The custom treasure board is an interactive, keyboard-navigable ARIA grid. */}
                  <div
                    ref={gridRef}
                    role="grid"
                    aria-label={treasureHuntLocale.boardTitle}
                    aria-rowcount={composition.boardHeight}
                    aria-colcount={composition.boardWidth}
                    className={`grid gap-1 transition-opacity duration-v2-base motion-reduce:transition-none ${isCalculating && probabilityReady ? "opacity-60" : ""}`}
                    style={{
                      gridTemplateColumns: `repeat(${composition.boardWidth}, minmax(0, 1fr))`,
                      aspectRatio: `${composition.boardWidth} / ${composition.boardHeight}`,
                    }}
                  >
                    {rows.map(({ x, y }) => {
                      const key = `${x},${y}`;
                      const treasure = occupied.get(key);
                      if (treasure && (treasure.x !== x || treasure.y !== y)) return null;
                      if (treasure) {
                        const size = placementSize(treasure.width, treasure.height, treasure.orientation);
                        const isSelected = selectedId === treasure.id;
                        return (
                          // biome-ignore lint/a11y/useSemanticElements: Interactive board controls use gridcell semantics for the grid keyboard model.
                          <button
                            key={`treasure-${treasure.id}`}
                            type="button"
                            role="gridcell"
                            aria-rowindex={y + 1}
                            aria-colindex={x + 1}
                            aria-label={`${y + 1}행 ${x + 1}열, ${treasure.width}×${treasure.height} 보물`}
                            aria-selected={isSelected}
                            tabIndex={focusedCell.x === x && focusedCell.y === y ? 0 : -1}
                            data-board-x={x}
                            data-board-y={y}
                            onFocus={() => {
                              setKeyboardCoordinate({ x, y });
                              setCellPointer({ x, y });
                            }}
                            onBlur={() => setCellPointer(null)}
                            onMouseEnter={() => setCellPointer({ x, y })}
                            onMouseLeave={() => setCellPointer(null)}
                            onKeyDown={handleBoardKeyDown}
                            onClick={() => (placement ? handleCell(x, y) : setSelectedId(treasure.id))}
                            className={`z-10 flex min-h-0 items-center justify-center rounded-sm bg-v2-fg text-xs font-semibold text-v2-canvas outline-none focus-visible:ring-2 focus-visible:ring-v2-focus ${isSelected ? "ring-2 ring-inset ring-v2-focus" : ""}`}
                            style={{
                              gridColumn: `${x + 1} / span ${Math.min(size.width, composition.boardWidth - x)}`,
                              gridRow: `${y + 1} / span ${Math.min(size.height, composition.boardHeight - y)}`,
                            }}
                          >
                            {treasure.width}×{treasure.height}
                          </button>
                        );
                      }
                      const probability = analysis.result?.cells?.[y]?.[x];
                      const showProbability = !complete && probabilityReady && !empty.has(key) && probability != null;
                      const recommended =
                        analysis.status === "ok" &&
                        Boolean(analysis.result?.recommended.some((cell) => cell.x === x && cell.y === y));
                      return (
                        // biome-ignore lint/a11y/useSemanticElements: Interactive board controls use gridcell semantics for the grid keyboard model.
                        <button
                          key={key}
                          type="button"
                          role="gridcell"
                          aria-rowindex={y + 1}
                          aria-colindex={x + 1}
                          aria-label={getCellLabel(
                            x,
                            y,
                            showProbability ? probability : null,
                            recommended,
                            empty.has(key),
                          )}
                          disabled={complete}
                          tabIndex={focusedCell.x === x && focusedCell.y === y ? 0 : -1}
                          data-board-x={x}
                          data-board-y={y}
                          onFocus={() => {
                            setKeyboardCoordinate({ x, y });
                            setCellPointer({ x, y });
                          }}
                          onBlur={() => setCellPointer(null)}
                          onMouseEnter={() => setCellPointer({ x, y })}
                          onMouseLeave={() => setCellPointer(null)}
                          onKeyDown={handleBoardKeyDown}
                          onClick={() => handleCell(x, y)}
                          className={`flex min-h-0 items-center justify-center rounded-sm text-xs tabular-nums text-v2-fg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-focus ${getHeatClass(showProbability ? Math.round(probability * 100) : empty.has(key) ? -1 : 0)} ${recommended ? "ring-2 ring-inset ring-v2-fg font-bold" : ""} ${placement ? "cursor-crosshair" : ""}`}
                          style={{ gridColumn: x + 1, gridRow: y + 1 }}
                        >
                          {showProbability ? (
                            Math.round(probability * 100)
                          ) : empty.has(key) ? (
                            <CheckIcon className="size-4" aria-label="빈 칸" />
                          ) : null}
                        </button>
                      );
                    })}
                    {placementPreview && cellPointer ? (
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none z-20 rounded-sm border-2 border-dashed ${placementPreview.valid ? "border-v2-focus bg-v2-highlight" : "border-v2-danger bg-v2-danger-subtle"}`}
                        style={{
                          gridColumn: `${cellPointer.x + 1} / span ${Math.max(1, Math.min(placementPreview.size.width, composition.boardWidth - cellPointer.x))}`,
                          gridRow: `${cellPointer.y + 1} / span ${Math.max(1, Math.min(placementPreview.size.height, composition.boardHeight - cellPointer.y))}`,
                        }}
                      />
                    ) : null}
                  </div>
                  {isCalculating && analysis.showSpinner ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-v2-surface/60">
                      <span
                        role="status"
                        className="inline-flex items-center gap-2 rounded-md bg-v2-elevated px-3 py-2 text-sm font-medium text-v2-fg shadow-lg"
                      >
                        <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        {treasureHuntLocale.boardCalculating}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 space-y-v2-group-gap">
                  <div className="flex flex-col gap-2">
                    <p
                      className="text-sm text-v2-fg-secondary"
                      role={invalidMessage ? "alert" : "status"}
                      aria-live="polite"
                    >
                      {invalidMessage ??
                        (selected
                          ? `${selected.width}×${selected.height} 보물을 선택했어요.`
                          : placement
                            ? `${placement.width}×${placement.height} 보물을 놓을 칸을 선택해주세요.`
                            : "칸을 선택해 빈 칸 또는 보물 위치를 기록하세요.")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selected ? (
                        <Button variant="danger-subtle" size="sm" onClick={removeSelected}>
                          보물 기록 지우기
                        </Button>
                      ) : null}
                      {placement || selected ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setPlacement(null);
                            setSelectedId(null);
                            setInvalidMessage(null);
                          }}
                        >
                          취소
                        </Button>
                      ) : null}
                      <Button size="sm" onClick={undo} disabled={persisted.undoStack.length === 0}>
                        {treasureHuntLocale.undo}
                      </Button>
                      <Button size="sm" onClick={reset}>
                        {treasureHuntLocale.reset}
                      </Button>
                      <Button
                        size="sm"
                        variant={complete ? "primary" : "secondary"}
                        onClick={() => startNextRound(nextRound)}
                      >
                        {complete ? treasureHuntLocale.nextRoundLabel(nextRoundLabel) : treasureHuntLocale.nextRound}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-v2-fg">
                      {treasureHuntLocale.remainingTreasures} · {remainingCount}
                    </h3>
                    {remaining.map((shape) => (
                      <div
                        key={shapeKey(shape.width, shape.height)}
                        className="flex flex-wrap items-center gap-2 rounded-md bg-v2-surface px-3 py-2"
                      >
                        <TreasureShapeGlyph width={shape.width} height={shape.height} />
                        <span className="font-medium text-v2-fg">
                          {shape.width}×{shape.height}
                        </span>
                        <span className="text-xs text-v2-fg-secondary">
                          {treasureHuntLocale.remainingCount(shape.remaining, shape.total)}
                        </span>
                        <div className="ml-auto flex gap-2">
                          {(
                            [
                              "horizontal",
                              ...(shape.width === shape.height ? [] : ["vertical"]),
                            ] as TreasureHuntBoardOrientation[]
                          ).map((orientation) => {
                            const active =
                              placement?.width === shape.width &&
                              placement.height === shape.height &&
                              placement.orientation === orientation;
                            const label =
                              shape.width === shape.height
                                ? treasureHuntLocale.place
                                : orientation === "horizontal"
                                  ? treasureHuntLocale.horizontal
                                  : treasureHuntLocale.vertical;
                            return (
                              <Button
                                key={orientation}
                                variant={active ? "primary" : "secondary"}
                                size="sm"
                                aria-pressed={active}
                                disabled={shape.remaining === 0 || complete}
                                onClick={() => {
                                  setSelectedId(null);
                                  setPlacement(
                                    active ? null : { width: shape.width, height: shape.height, orientation },
                                  );
                                }}
                              >
                                {label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="sr-only" aria-live="polite">
              {foundCount}개 보물 기록
            </p>
          </section>
        </ShopSection>

        <ShopSection
          title={treasureHuntLocale.roundDetails}
          persistenceKey="event-treasure-hunt-section::round-details"
          storageKey="event-treasure-hunt-section::round-details"
          variant="shop"
        >
          <TreasureRoundDetails config={config} />
        </ShopSection>
      </div>
    </PageMain>
  );
}

function TreasureRoundDetails({ config }: { config: TreasureHuntConfig }) {
  const firstRound = getRoundConfig(config, 1);
  return (
    <div className="@container space-y-v2-group-gap">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <p className="mb-2 text-xs font-medium text-v2-fg-secondary">{treasureHuntLocale.boardSize}</p>
          <div className="flex h-10 items-center text-sm font-medium tabular-nums text-v2-fg">
            {firstRound.boardWidth}×{firstRound.boardHeight}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-v2-fg-secondary">{treasureHuntLocale.cellCost}</p>
          <div className="flex h-10 items-center">
            <TreasureResourceThumb reward={firstRound.cellCost} quantity={firstRound.cellCost.quantity} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-v2-fg-secondary">{treasureHuntLocale.openCellReward}</p>
          <div className="flex min-h-10 flex-wrap items-center gap-1">
            {firstRound.openCellRewards.map((reward) => (
              <TreasureResourceThumb
                key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
                reward={reward}
                quantity={reward.quantity}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="grid items-start gap-v2-block-gap @min-[48rem]:grid-cols-2">
        {config.rounds.map((round) => {
          const occupiedCells = round.treasures.reduce(
            (sum, treasure) => sum + treasure.width * treasure.height * treasure.count,
            0,
          );
          const label =
            round.round === config.loopRound ? treasureHuntLocale.roundAfter(config.loopRound) : `${round.round}회차`;
          return (
            <div key={round.round} className="min-w-0 rounded-md bg-v2-surface p-v2-tile-p">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <strong className="text-v2-fg">
                  {label} · {round.boardWidth}×{round.boardHeight}
                </strong>
                <span className="text-xs tabular-nums text-v2-fg-secondary">
                  이론상 {(occupiedCells * round.cellCost.quantity).toLocaleString()}~
                  {(round.boardWidth * round.boardHeight * round.cellCost.quantity).toLocaleString()}
                </span>
              </div>
              <div className="mt-2 space-y-3">
                {round.treasures.map((treasure) => (
                  <div
                    key={treasure.uid}
                    className="grid grid-cols-1 gap-y-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start sm:gap-x-2"
                  >
                    <div className="flex min-w-0 items-center gap-2 sm:h-10">
                      <TreasureShapeGlyph width={treasure.width} height={treasure.height} />
                      <span className="min-w-0 whitespace-nowrap text-xs text-v2-fg-secondary">
                        {treasure.width}×{treasure.height} · {treasure.count.toLocaleString()}개
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {treasure.rewards.map((reward) => (
                        <TreasureResourceThumb
                          key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
                          reward={reward}
                          quantity={reward.quantity * treasure.count}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TreasureShapeGlyph({ width, height }: { width: number; height: number }) {
  return (
    <span aria-hidden="true" className="inline-flex w-7 shrink-0 items-center justify-center">
      <span className="grid gap-px" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}>
        {Array.from({ length: width * height }, (_, index) => {
          const row = Math.floor(index / width);
          const column = index % width;
          return <span key={`${row}-${column}`} className="size-1.5 bg-v2-fg-secondary" />;
        })}
      </span>
    </span>
  );
}

function TreasureResourceThumb({
  reward,
  quantity,
}: {
  reward: {
    resourceType: TreasureHuntRoundConfig["cellCost"]["resourceType"];
    resourceUid: string;
    resourceName?: string;
    imageUrl?: string | null;
    rarity?: number | null;
  };
  quantity: number;
}) {
  return (
    <ResourceThumb
      itemUid={reward.resourceUid}
      resourceType={reward.resourceType}
      imageUrl={reward.imageUrl ?? undefined}
      rarity={reward.rarity ?? 1}
      quantity={quantity}
      name={reward.resourceName}
      size="md"
      tooltip
    />
  );
}

function getRoundConfig(config: TreasureHuntConfig, roundNumber: number): TreasureHuntRoundConfig {
  const targetRound = roundNumber >= config.loopRound ? config.loopRound : roundNumber;
  const round = config.rounds.find((candidate) => candidate.round === targetRound);
  if (!round) throw new Error(`Treasure hunt round ${targetRound} is missing its configuration.`);
  return round;
}

function getCellLabel(x: number, y: number, probability: number | null, recommended: boolean, empty: boolean) {
  const label = `${y + 1}행 ${x + 1}열`;
  if (empty) return `${label}, 빈 칸으로 기록됨`;
  if (probability === null) return `${label}, 확률 계산 중`;
  return `${label}, 보물 확률 ${Math.round(probability * 100)}%${recommended ? ", 추천 칸" : ""}`;
}

function getHeatClass(percent: number) {
  if (percent < 0) return "border border-v2-control-border bg-v2-canvas";
  if (percent <= 0) return "bg-v2-treasure-heat-0";
  if (percent <= 20) return "bg-v2-treasure-heat-1";
  if (percent <= 40) return "bg-v2-treasure-heat-2";
  if (percent <= 60) return "bg-v2-treasure-heat-3";
  if (percent <= 80) return "bg-v2-treasure-heat-4";
  return "bg-v2-treasure-heat-5";
}

function maximumProbability(cells: (number | null)[][] | null): number {
  let maximum = 0;
  for (const row of cells ?? [])
    for (const probability of row) if (probability !== null) maximum = Math.max(maximum, probability);
  return maximum;
}
