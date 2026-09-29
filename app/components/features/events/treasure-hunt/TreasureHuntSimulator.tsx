import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout, FilterButtons, Section } from "~/components/primitives";
import type { TreasureHuntConfig } from "~/domain/event-shop";
import type { TreasureHuntBoardCoordinate, TreasureHuntBoardOrientation } from "~/domain/treasure-hunt";
import { treasureHuntLocale } from "~/locales/ko";
import {
  loadTreasureHuntBoard,
  MAX_UNDO_SNAPSHOTS,
  normalizeTreasureHuntBoardRounds,
  type PersistedTreasureHuntBoard,
  type RecordedTreasure,
  saveTreasureHuntBoard,
  type TreasureHuntBoardSnapshot,
} from "./board-persistence";
import {
  createBoardObservation,
  createTreasureHuntComposition,
  getPlacementFailure,
  getRemainingTreasureShapes,
  isObservationStructurallyValid,
  type PlacementFailure,
  placementSize,
  probabilityPercent,
  shapeKey,
} from "./board-utils";
import { getRoundConfig, TreasureHuntRoundDetails } from "./TreasureHuntRoundDetails";
import { ShapeIcon } from "./TreasureHuntRoundRow";
import { useTreasureHuntBoardAnalysis } from "./useTreasureHuntBoardAnalysis";

type TreasureHuntSimulatorProps = {
  eventUid: string;
  config: TreasureHuntConfig | null;
};

type PlacementSelection = {
  width: number;
  height: number;
  orientation: TreasureHuntBoardOrientation;
};

type CellPointer = TreasureHuntBoardCoordinate & { failure?: PlacementFailure };

const EMPTY_BOARD: TreasureHuntBoardSnapshot = { round: 1, knownEmpty: [], foundTreasures: [] };

export function TreasureHuntSimulator({ eventUid, config }: TreasureHuntSimulatorProps) {
  if (!config) {
    return <Callout>{treasureHuntLocale.noData}</Callout>;
  }

  return <ConfiguredTreasureHuntSimulator key={eventUid} eventUid={eventUid} config={config} />;
}

function ConfiguredTreasureHuntSimulator({ eventUid, config }: { eventUid: string; config: TreasureHuntConfig }) {
  const [persisted, setPersisted] = useState<PersistedTreasureHuntBoard>(() => ({
    version: 1,
    board: EMPTY_BOARD,
    undoStack: [],
    nextTreasureId: 1,
  }));
  const [restored, setRestored] = useState(false);
  const [placement, setPlacement] = useState<PlacementSelection | null>(null);
  const [selectedTreasureId, setSelectedTreasureId] = useState<number | null>(null);
  const [lastRecordedTreasure, setLastRecordedTreasure] = useState<{ width: number; height: number } | null>(null);
  const [cellPointer, setCellPointer] = useState<CellPointer | null>(null);
  const [keyboardCoordinate, setKeyboardCoordinate] = useState<TreasureHuntBoardCoordinate>({ x: 0, y: 0 });
  const [invalidCell, setInvalidCell] = useState<CellPointer | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadTreasureHuntBoard(eventUid);
    if (loaded) setPersisted(normalizeTreasureHuntBoardRounds(loaded, config.loopRound));
    setRestored(true);
  }, [config.loopRound, eventUid]);

  useEffect(() => {
    if (restored) saveTreasureHuntBoard(eventUid, persisted);
  }, [eventUid, persisted, restored]);

  useEffect(
    () => () => {
      if (invalidTimerRef.current !== null) clearTimeout(invalidTimerRef.current);
    },
    [],
  );

  const currentRound = persisted.board.round;
  const roundConfig = getRoundConfig(config, currentRound);
  const composition = useMemo(() => createTreasureHuntComposition(roundConfig), [roundConfig]);
  const observation = useMemo(() => createBoardObservation(persisted.board), [persisted.board]);
  const structurallyValid = isObservationStructurallyValid(composition, observation);
  const analysis = useTreasureHuntBoardAnalysis(composition, observation, structurallyValid);
  const remainingShapes = getRemainingTreasureShapes(roundConfig, persisted.board.foundTreasures);
  const remainingCount = remainingShapes.reduce((total, shape) => total + shape.remaining, 0);
  const allTreasuresRecorded = structurallyValid && remainingCount === 0;
  const complete = structurallyValid && analysis.status === "ok" && remainingCount === 0;
  const knownEmpty = useMemo(
    () => new Set(persisted.board.knownEmpty.map(({ x, y }) => coordinateKey(x, y))),
    [persisted.board.knownEmpty],
  );
  const foundByCell = useMemo(() => {
    const map = new Map<string, RecordedTreasure>();
    for (const treasure of persisted.board.foundTreasures) {
      const size = placementSize(treasure.width, treasure.height, treasure.orientation);
      for (let y = Math.max(0, treasure.y); y < Math.min(composition.boardHeight, treasure.y + size.height); y += 1) {
        for (let x = Math.max(0, treasure.x); x < Math.min(composition.boardWidth, treasure.x + size.width); x += 1) {
          map.set(coordinateKey(x, y), treasure);
        }
      }
    }
    return map;
  }, [composition.boardHeight, composition.boardWidth, persisted.board.foundTreasures]);
  const selectedTreasure = persisted.board.foundTreasures.find(({ id }) => id === selectedTreasureId) ?? null;
  const probabilityAvailable =
    analysis.status === "ok" || (analysis.status === "calculating" && analysis.result?.status === "ok");
  const recommendationsVisible = analysis.status === "ok" && analysis.result?.status === "ok";
  const recommended = useMemo(
    () =>
      new Set(
        (recommendationsVisible ? (analysis.result?.recommended ?? []) : []).map(({ x, y }) => coordinateKey(x, y)),
      ),
    [analysis.result?.recommended, recommendationsVisible],
  );
  const isCalculating = analysis.status === "calculating";
  const nextRound = currentRound < config.loopRound ? currentRound + 1 : currentRound;
  const nextRoundLabel =
    nextRound === config.loopRound ? treasureHuntLocale.roundAfter(config.loopRound) : `${nextRound}회차`;
  const toolMessage = getToolMessage({
    analysisStatus: analysis.status,
    complete: allTreasuresRecorded,
    invalidCell,
    placement,
    lastRecordedTreasure,
    selectedTreasure,
  });

  function commitBoard(nextBoard: TreasureHuntBoardSnapshot, nextTreasureId = persisted.nextTreasureId) {
    setPersisted((current) => ({
      ...current,
      board: nextBoard,
      undoStack: [...current.undoStack, current.board].slice(-MAX_UNDO_SNAPSHOTS),
      nextTreasureId,
    }));
    setPlacement(null);
    setSelectedTreasureId(null);
    setLastRecordedTreasure(null);
    setInvalidCell(null);
  }

  function setToolAnnouncement(message: string) {
    setAnnouncement(message);
  }

  function showPlacementFailure(coordinate: TreasureHuntBoardCoordinate, failure: PlacementFailure) {
    setInvalidCell({ ...coordinate, failure });
    if (invalidTimerRef.current !== null) clearTimeout(invalidTimerRef.current);
    invalidTimerRef.current = setTimeout(() => setInvalidCell(null), 1000);
  }

  function handleCellClick(coordinate: TreasureHuntBoardCoordinate) {
    setKeyboardCoordinate(coordinate);
    setInvalidCell(null);
    setLastRecordedTreasure(null);
    if (placement) {
      const failure = getPlacementFailure(roundConfig, persisted.board, placement, coordinate);
      if (failure) {
        showPlacementFailure(coordinate, failure);
        return;
      }
      const foundTreasure: RecordedTreasure = {
        id: persisted.nextTreasureId,
        x: coordinate.x,
        y: coordinate.y,
        width: placement.width,
        height: placement.height,
        orientation: placement.orientation,
      };
      commitBoard(
        { ...persisted.board, foundTreasures: [...persisted.board.foundTreasures, foundTreasure] },
        persisted.nextTreasureId + 1,
      );
      setLastRecordedTreasure({ width: placement.width, height: placement.height });
      setToolAnnouncement(treasureHuntLocale.treasureRecorded(placement.width, placement.height));
      return;
    }
    if (selectedTreasureId !== null) setSelectedTreasureId(null);

    const existing = persisted.board.foundTreasures.find((treasure) => {
      const size = placementSize(treasure.width, treasure.height, treasure.orientation);
      return (
        coordinate.x >= treasure.x &&
        coordinate.x < treasure.x + size.width &&
        coordinate.y >= treasure.y &&
        coordinate.y < treasure.y + size.height
      );
    });
    if (existing) {
      setSelectedTreasureId(existing.id);
      setToolAnnouncement(treasureHuntLocale.treasureSelected(existing.width, existing.height));
      return;
    }

    const key = coordinateKey(coordinate.x, coordinate.y);
    const nextEmpty = knownEmpty.has(key)
      ? persisted.board.knownEmpty.filter((cell) => coordinateKey(cell.x, cell.y) !== key)
      : [...persisted.board.knownEmpty, coordinate];
    commitBoard({ ...persisted.board, knownEmpty: nextEmpty });
    setToolAnnouncement(knownEmpty.has(key) ? treasureHuntLocale.emptyRecordRemoved : treasureHuntLocale.emptyRecorded);
  }

  function handleUndo() {
    if (persisted.undoStack.length === 0) return;
    const previous = persisted.undoStack[persisted.undoStack.length - 1];
    setPersisted((current) => ({
      ...current,
      board: previous,
      undoStack: current.undoStack.slice(0, -1),
    }));
    setPlacement(null);
    setSelectedTreasureId(null);
    setLastRecordedTreasure(null);
    setInvalidCell(null);
    setToolAnnouncement("");
  }

  function handleReset() {
    commitBoard({ round: persisted.board.round, knownEmpty: [], foundTreasures: [] });
    setToolAnnouncement("");
  }

  function handleNextRound() {
    const round = currentRound < config.loopRound ? currentRound + 1 : currentRound;
    commitBoard({ round, knownEmpty: [], foundTreasures: [] });
    setToolAnnouncement("");
  }

  function handleRoundChange(round: number) {
    setLastRecordedTreasure(null);
    if (round === persisted.board.round) return;
    commitBoard({ ...persisted.board, round });
    setToolAnnouncement("");
  }

  function handleClearSelectedTreasure() {
    if (!selectedTreasure) return;
    commitBoard({
      ...persisted.board,
      foundTreasures: persisted.board.foundTreasures.filter(({ id }) => id !== selectedTreasure.id),
    });
    setToolAnnouncement("");
  }

  function cancelSelection() {
    setPlacement(null);
    setSelectedTreasureId(null);
    setLastRecordedTreasure(null);
    setCellPointer(null);
    setInvalidCell(null);
    setToolAnnouncement("");
  }

  function choosePlacement(shape: { width: number; height: number }, orientation: TreasureHuntBoardOrientation) {
    if (
      placement?.width === shape.width &&
      placement.height === shape.height &&
      placement.orientation === orientation
    ) {
      cancelSelection();
      return;
    }
    setLastRecordedTreasure(null);
    setSelectedTreasureId(null);
    setPlacement({ ...shape, orientation });
    setInvalidCell(null);
    setToolAnnouncement("");
  }

  function handleInteractionKeyDown(event: KeyboardEvent<HTMLFieldSetElement>) {
    setLastRecordedTreasure(null);
    if (event.key === "Escape") {
      if (placement || selectedTreasureId !== null) {
        event.preventDefault();
        cancelSelection();
      }
      return;
    }
    if (!gridRef.current?.contains(event.target as Node)) return;
    const directions: Record<string, TreasureHuntBoardCoordinate> = {
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
    };
    const delta = directions[event.key];
    if (!delta) return;
    const focusables = [
      ...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-board-x]:not(:disabled)") ?? []),
    ];
    const candidates = focusables
      .map((button) => ({
        button,
        x: Number(button.dataset.boardX),
        y: Number(button.dataset.boardY),
      }))
      .filter(({ x, y }) =>
        delta.x
          ? y === keyboardCoordinate.y && Math.sign(x - keyboardCoordinate.x) === delta.x
          : x === keyboardCoordinate.x && Math.sign(y - keyboardCoordinate.y) === delta.y,
      )
      .sort(
        (a, b) =>
          Math.abs(a.x - keyboardCoordinate.x) +
          Math.abs(a.y - keyboardCoordinate.y) -
          (Math.abs(b.x - keyboardCoordinate.x) + Math.abs(b.y - keyboardCoordinate.y)),
      );
    const next = candidates[0];
    if (next) {
      event.preventDefault();
      setKeyboardCoordinate({ x: next.x, y: next.y });
      next.button.focus();
    }
  }

  const roundButtons = Array.from({ length: config.loopRound }, (_, index) => {
    const round = index + 1;
    const label = round === config.loopRound ? treasureHuntLocale.roundAfter(config.loopRound) : `${round}회차`;
    return {
      text: label,
      active: currentRound === round,
      onToggle: (active: boolean) => active && handleRoundChange(round),
    };
  });
  const boardCoordinates = Array.from({ length: composition.boardWidth * composition.boardHeight }, (_, index) => ({
    x: index % composition.boardWidth,
    y: Math.floor(index / composition.boardWidth),
  }));
  const focusableCoordinates = boardCoordinates.filter(({ x, y }) => {
    const treasure = foundByCell.get(coordinateKey(x, y));
    return complete ? treasure?.x === x && treasure.y === y : !treasure || (treasure.x === x && treasure.y === y);
  });
  const focusedCell = focusableCoordinates.some(({ x, y }) => x === keyboardCoordinate.x && y === keyboardCoordinate.y)
    ? keyboardCoordinate
    : (focusableCoordinates[0] ?? { x: 0, y: 0 });
  const placementPreview =
    placement && cellPointer ? getPreview(placement, cellPointer, roundConfig, persisted.board) : null;

  return (
    <div className="space-y-8">
      <Section title={treasureHuntLocale.boardTitle}>
        <fieldset className="m-0 min-w-0 max-w-[484px] space-y-3 border-0 p-0" onKeyDown={handleInteractionKeyDown}>
          <legend className="sr-only">{treasureHuntLocale.boardTitle}</legend>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span id="treasure-hunt-round-label" className="shrink-0 text-sm font-medium text-foreground">
              {treasureHuntLocale.boardRound}
            </span>
            {/* biome-ignore lint/a11y/useSemanticElements: FilterButtons exposes pressed state, while this named group provides the required round selector semantics. */}
            <div role="group" aria-labelledby="treasure-hunt-round-label" className="min-w-0">
              <FilterButtons
                className="my-0"
                buttonGroupClassName="gap-y-1.5"
                exclusive
                atLeastOne
                size="sm"
                buttonProps={roundButtons}
              />
            </div>
          </div>

          {complete ? (
            <p className="text-sm text-muted-foreground">{treasureHuntLocale.noRemainingTreasure}</p>
          ) : analysis.result?.status === "ok" && (analysis.status === "ok" || analysis.status === "calculating") ? (
            <p className={`text-sm font-medium text-foreground ${isCalculating ? "opacity-50" : ""}`}>
              {treasureHuntLocale.recommendation(
                analysis.result.recommended.length,
                probabilityPercent(maximumProbability(analysis.result.cells)),
              )}
            </p>
          ) : null}

          {!structurallyValid || analysis.status === "inconsistent" ? (
            <div role="alert" className="flex flex-wrap items-center gap-3">
              <Callout tone="default" className="min-w-0 flex-1">
                {treasureHuntLocale.boardInconsistent}
              </Callout>
              <Button
                text={treasureHuntLocale.undo}
                size="sm"
                variant="secondary"
                onClick={handleUndo}
                disabled={persisted.undoStack.length === 0}
              />
            </div>
          ) : analysis.status === "failed" ? (
            <div role="alert" className="flex flex-wrap items-center gap-3">
              <Callout tone="destructive" className="min-w-0 flex-1">
                {treasureHuntLocale.boardFailed}
              </Callout>
              <Button text={treasureHuntLocale.retry} size="sm" variant="secondary" onClick={analysis.retry} />
            </div>
          ) : null}

          <div className="space-y-3 rounded-md bg-card p-2 md:p-3">
            <div className="mb-2 flex min-h-5 items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>{treasureHuntLocale.boardCaption}</p>
              {isCalculating && analysis.showSpinner ? (
                <span className="inline-flex items-center gap-1.5" role="status">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-primary motion-reduce:animate-none" />
                  {treasureHuntLocale.boardCalculating}
                </span>
              ) : null}
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: The interactive CSS grid uses roving focus and spanning treasure blocks that a native table cannot preserve. */}
            <div
              ref={gridRef}
              role="grid"
              aria-label={treasureHuntLocale.boardTitle}
              aria-rowcount={composition.boardHeight}
              aria-colcount={composition.boardWidth}
              className={`relative grid w-full gap-0.5 ${isCalculating && probabilityAvailable ? "opacity-50" : ""}`}
              style={{
                gridTemplateColumns: `repeat(${composition.boardWidth}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${composition.boardHeight}, minmax(0, 1fr))`,
                aspectRatio: `${composition.boardWidth} / ${composition.boardHeight}`,
              }}
            >
              {boardCoordinates.map(({ x, y }) => {
                const key = coordinateKey(x, y);
                if (foundByCell.has(key)) return null;
                const isEmpty = knownEmpty.has(key);
                const probability = analysis.result?.cells?.[y]?.[x];
                const canShowProbability =
                  !complete && probabilityAvailable && !isEmpty && probability !== null && probability !== undefined;
                const isRecommended = recommendationsVisible && recommended.has(key);
                const isFocused = focusedCell.x === x && focusedCell.y === y;
                const isInvalid = invalidCell?.x === x && invalidCell?.y === y;
                const ghostAnchor = placement && cellPointer?.x === x && cellPointer.y === y;
                const tileClass = isEmpty
                  ? "border border-border bg-background text-transparent"
                  : canShowProbability
                    ? probabilityClass(probabilityPercent(probability))
                    : complete
                      ? "bg-muted text-transparent"
                      : "bg-muted text-muted-foreground";
                return (
                  // biome-ignore lint/a11y/useSemanticElements: Native buttons provide keyboard-operable controls for this custom ARIA gridcell.
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    aria-rowindex={y + 1}
                    aria-colindex={x + 1}
                    aria-label={getCellLabel({
                      x,
                      y,
                      probability: canShowProbability ? probability : null,
                      recommended: isRecommended,
                      empty: isEmpty,
                      complete,
                    })}
                    disabled={complete}
                    tabIndex={isFocused ? 0 : -1}
                    data-board-x={x}
                    data-board-y={y}
                    onFocus={() => {
                      setKeyboardCoordinate({ x, y });
                      setCellPointer({ x, y });
                    }}
                    onBlur={() => setCellPointer(null)}
                    onMouseEnter={() => setCellPointer({ x, y })}
                    onMouseLeave={() => setCellPointer(null)}
                    onClick={() => handleCellClick({ x, y })}
                    className={`relative z-0 flex aspect-square min-w-0 items-center justify-center rounded-sm text-xs tabular-nums transition-colors md:text-sm ${tileClass} ${isRecommended ? "ring-2 ring-inset ring-primary font-bold" : ""} ${isFocused ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""} ${isInvalid ? "!border-2 !border-destructive" : ""} ${ghostAnchor && placementPreview?.valid ? "ring-2 ring-inset ring-primary" : ""} ${ghostAnchor && placementPreview && !placementPreview.valid ? "!border-2 !border-destructive" : ""}`}
                    style={{ gridColumn: x + 1, gridRow: y + 1 }}
                  >
                    {canShowProbability ? probabilityPercent(probability) : null}
                  </button>
                );
              })}

              {persisted.board.foundTreasures.map((treasure) => {
                if (
                  treasure.x < 0 ||
                  treasure.y < 0 ||
                  treasure.x >= composition.boardWidth ||
                  treasure.y >= composition.boardHeight
                ) {
                  return null;
                }
                const size = placementSize(treasure.width, treasure.height, treasure.orientation);
                const visibleWidth = Math.min(size.width, composition.boardWidth - treasure.x);
                const visibleHeight = Math.min(size.height, composition.boardHeight - treasure.y);
                const selected = selectedTreasureId === treasure.id;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: Native buttons provide keyboard-operable controls for this custom ARIA gridcell.
                  <button
                    key={`treasure-${treasure.id}`}
                    type="button"
                    role="gridcell"
                    aria-rowindex={treasure.y + 1}
                    aria-colindex={treasure.x + 1}
                    aria-label={`${treasure.y + 1}행 ${treasure.x + 1}열, ${treasure.width}×${treasure.height} 보물`}
                    aria-selected={selected}
                    tabIndex={focusedCell.x === treasure.x && focusedCell.y === treasure.y ? 0 : -1}
                    data-board-x={treasure.x}
                    data-board-y={treasure.y}
                    onFocus={() => {
                      setKeyboardCoordinate({ x: treasure.x, y: treasure.y });
                      setCellPointer({ x: treasure.x, y: treasure.y });
                    }}
                    onBlur={() => setCellPointer(null)}
                    onMouseEnter={() => setCellPointer({ x: treasure.x, y: treasure.y })}
                    onMouseLeave={() => setCellPointer(null)}
                    onClick={() => {
                      if (placement) {
                        handleCellClick({ x: treasure.x, y: treasure.y });
                        return;
                      }
                      setLastRecordedTreasure(null);
                      setSelectedTreasureId(treasure.id);
                      setToolAnnouncement(treasureHuntLocale.treasureSelected(treasure.width, treasure.height));
                    }}
                    className={`z-10 flex min-h-0 items-center justify-center rounded-sm bg-foreground/60 text-xs font-medium text-background ${selected ? "ring-2 ring-inset ring-primary" : ""}`}
                    style={{
                      gridColumn: `${treasure.x + 1} / span ${visibleWidth}`,
                      gridRow: `${treasure.y + 1} / span ${visibleHeight}`,
                    }}
                  >
                    {treasure.width}×{treasure.height}
                  </button>
                );
              })}

              {placementPreview && cellPointer ? (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none z-20 rounded-sm border-2 border-dashed ${placementPreview.valid ? "border-primary bg-primary/20" : "border-destructive bg-destructive/20"}`}
                  style={{
                    gridColumn: `${cellPointer.x + 1} / span ${placementPreview.width}`,
                    gridRow: `${cellPointer.y + 1} / span ${placementPreview.height}`,
                  }}
                />
              ) : null}
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className={`min-h-5 text-sm ${toolMessage.destructive ? "text-destructive" : "text-muted-foreground"}`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {toolMessage.text}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedTreasure ? (
                    <Button
                      text={treasureHuntLocale.clearTreasureRecord}
                      size="sm"
                      variant="danger-subtle"
                      onClick={handleClearSelectedTreasure}
                    />
                  ) : null}
                  {placement || selectedTreasure ? (
                    <Button text={treasureHuntLocale.cancel} size="sm" variant="secondary" onClick={cancelSelection} />
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  text={treasureHuntLocale.undo}
                  size="sm"
                  variant="secondary"
                  onClick={handleUndo}
                  disabled={persisted.undoStack.length === 0}
                />
                <Button text={treasureHuntLocale.reset} size="sm" variant="default" onClick={handleReset} />
                <Button
                  text={complete ? treasureHuntLocale.nextRoundLabel(nextRoundLabel) : treasureHuntLocale.nextRound}
                  size="sm"
                  variant={complete ? "primary" : "secondary"}
                  onClick={handleNextRound}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{treasureHuntLocale.remainingTreasures}</p>
              <div className="space-y-1">
                {remainingShapes.map((shape) => {
                  const disabled = shape.remaining === 0 || complete;
                  const square = shape.width === shape.height;
                  const orientations: TreasureHuntBoardOrientation[] = square
                    ? ["horizontal"]
                    : ["horizontal", "vertical"];
                  return (
                    <div key={shapeKey(shape.width, shape.height)} className="flex flex-wrap items-center gap-2 py-1">
                      <div className={disabled ? "opacity-40" : ""}>
                        <ShapeIcon width={shape.width} height={shape.height} />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {shape.width}×{shape.height}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {treasureHuntLocale.remainingCount(shape.remaining, shape.total)}
                      </span>
                      <div className="ml-auto flex gap-1.5">
                        {orientations.map((orientation) => {
                          const active =
                            placement?.width === shape.width &&
                            placement.height === shape.height &&
                            placement.orientation === orientation;
                          const text = square
                            ? treasureHuntLocale.place
                            : orientation === "horizontal"
                              ? treasureHuntLocale.horizontal
                              : treasureHuntLocale.vertical;
                          return (
                            <Button
                              key={orientation}
                              text={text}
                              size="sm"
                              variant={active ? "primary" : "secondary"}
                              pressed={active}
                              disabled={disabled}
                              onClick={() => choosePlacement(shape, orientation)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </fieldset>
      </Section>

      <TreasureHuntRoundDetails config={config} />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
        {analysis.status === "ok" && analysis.result?.status === "ok"
          ? ` ${treasureHuntLocale.recommendation(analysis.result.recommended.length, probabilityPercent(maximumProbability(analysis.result.cells)))}`
          : ""}
      </p>
    </div>
  );
}

export function getToolMessage({
  analysisStatus,
  complete,
  invalidCell,
  placement,
  lastRecordedTreasure,
  selectedTreasure,
}: {
  analysisStatus: string;
  complete: boolean;
  invalidCell: CellPointer | null;
  placement: PlacementSelection | null;
  lastRecordedTreasure: { width: number; height: number } | null;
  selectedTreasure: RecordedTreasure | null;
}) {
  if (invalidCell?.failure === "overlap") return { text: treasureHuntLocale.placementOverlap, destructive: true };
  if (invalidCell?.failure === "out-of-bounds")
    return { text: treasureHuntLocale.placementOutOfBounds, destructive: true };
  if (complete) return { text: treasureHuntLocale.allTreasuresFound, destructive: false };
  if (selectedTreasure) {
    return {
      text: treasureHuntLocale.treasureSelected(selectedTreasure.width, selectedTreasure.height),
      destructive: false,
    };
  }
  if (placement) {
    return {
      text: treasureHuntLocale.placementInstruction(
        placement.width,
        placement.height,
        placement.orientation === "horizontal" ? treasureHuntLocale.horizontal : treasureHuntLocale.vertical,
      ),
      destructive: false,
    };
  }
  if (lastRecordedTreasure) {
    return {
      text: treasureHuntLocale.treasureRecorded(lastRecordedTreasure.width, lastRecordedTreasure.height),
      destructive: false,
    };
  }
  if (analysisStatus === "inconsistent") return { text: treasureHuntLocale.boardInconsistent, destructive: true };
  return { text: treasureHuntLocale.emptyBoardHelp, destructive: false };
}

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function probabilityClass(displayedPercent: number): string {
  if (displayedPercent === 0) return "bg-muted text-muted-foreground";
  if (displayedPercent <= 20) return "bg-primary/10 text-foreground";
  if (displayedPercent <= 40) return "bg-primary/20 text-foreground";
  if (displayedPercent <= 60) return "bg-primary/35 text-foreground";
  if (displayedPercent <= 80) return "bg-primary/50 text-foreground";
  return "bg-primary/70 text-foreground dark:bg-primary dark:text-primary-foreground";
}

function maximumProbability(cells: (number | null)[][] | null): number {
  if (!cells) return 0;
  let maximum = 0;
  for (const row of cells) {
    for (const probability of row) {
      if (probability !== null) maximum = Math.max(maximum, probability);
    }
  }
  return maximum;
}

function getCellLabel({
  x,
  y,
  probability,
  recommended,
  empty,
  complete,
}: {
  x: number;
  y: number;
  probability: number | null;
  recommended: boolean;
  empty: boolean;
  complete: boolean;
}): string {
  const location = `${y + 1}행 ${x + 1}열`;
  if (empty) return `${location}, 빈 칸으로 기록됨`;
  if (complete) return `${location}, 남은 보물 없음`;
  if (probability === null) return `${location}, 확률 계산 중`;
  return `${location}, 보물 확률 ${probabilityPercent(probability)}%${recommended ? ", 추천 칸" : ""}`;
}

function getPreview(
  placement: PlacementSelection,
  coordinate: TreasureHuntBoardCoordinate,
  round: ReturnType<typeof getRoundConfig>,
  board: TreasureHuntBoardSnapshot,
) {
  const size = placementSize(placement.width, placement.height, placement.orientation);
  return {
    width: Math.max(1, Math.min(size.width, round.boardWidth - coordinate.x)),
    height: Math.max(1, Math.min(size.height, round.boardHeight - coordinate.y)),
    valid: getPlacementFailure(round, board, placement, coordinate) === null,
  };
}
