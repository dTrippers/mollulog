import type { TreasureHuntRoundConfig } from "~/domain/event-shop";
import type {
  TreasureHuntBoardCoordinate,
  TreasureHuntBoardObservation,
  TreasureHuntBoardOrientation,
  TreasureHuntComposition,
} from "~/domain/treasure-hunt";
import type { RecordedTreasure, TreasureHuntBoardSnapshot } from "./board-persistence";

export type RemainingTreasureShape = {
  width: number;
  height: number;
  total: number;
  remaining: number;
};

export type PlacementFailure = "overlap" | "out-of-bounds";

export function createTreasureHuntComposition(round: TreasureHuntRoundConfig): TreasureHuntComposition {
  return {
    boardWidth: round.boardWidth,
    boardHeight: round.boardHeight,
    pieces: round.treasures.map(({ width, height, count }) => ({ width, height, count })),
  };
}

export function createBoardObservation(snapshot: TreasureHuntBoardSnapshot): TreasureHuntBoardObservation {
  return {
    knownEmpty: snapshot.knownEmpty,
    foundTreasures: snapshot.foundTreasures.map(({ x, y, width, height, orientation }) => ({
      x,
      y,
      width,
      height,
      orientation,
    })),
  };
}

export function getRemainingTreasureShapes(
  round: TreasureHuntRoundConfig,
  foundTreasures: readonly RecordedTreasure[],
): RemainingTreasureShape[] {
  const shapes = new Map<string, RemainingTreasureShape>();
  for (const treasure of round.treasures) {
    const key = shapeKey(treasure.width, treasure.height);
    const existing = shapes.get(key);
    if (existing) {
      existing.total += treasure.count;
      existing.remaining += treasure.count;
    } else {
      shapes.set(key, {
        width: treasure.width,
        height: treasure.height,
        total: treasure.count,
        remaining: treasure.count,
      });
    }
  }

  for (const found of foundTreasures) {
    const shape = shapes.get(shapeKey(found.width, found.height));
    if (shape) shape.remaining = Math.max(0, shape.remaining - 1);
  }
  return [...shapes.values()];
}

export function placementSize(
  width: number,
  height: number,
  orientation: TreasureHuntBoardOrientation,
): { width: number; height: number } {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  return orientation === "horizontal" ? { width: longSide, height: shortSide } : { width: shortSide, height: longSide };
}

export function getPlacementFailure(
  round: TreasureHuntRoundConfig,
  snapshot: TreasureHuntBoardSnapshot,
  treasure: Pick<RecordedTreasure, "width" | "height" | "orientation">,
  coordinate: TreasureHuntBoardCoordinate,
): PlacementFailure | null {
  const size = placementSize(treasure.width, treasure.height, treasure.orientation);
  if (coordinate.x + size.width > round.boardWidth || coordinate.y + size.height > round.boardHeight) {
    return "out-of-bounds";
  }

  const occupied = new Set<string>();
  for (const empty of snapshot.knownEmpty) occupied.add(coordinateKey(empty));
  for (const found of snapshot.foundTreasures) {
    const foundSize = placementSize(found.width, found.height, found.orientation);
    const endX = Math.min(round.boardWidth, found.x + foundSize.width);
    const endY = Math.min(round.boardHeight, found.y + foundSize.height);
    for (let y = Math.max(0, found.y); y < endY; y += 1) {
      for (let x = Math.max(0, found.x); x < endX; x += 1) occupied.add(coordinateKey({ x, y }));
    }
  }
  for (const cell of rectangleCoordinates(coordinate, size.width, size.height)) {
    if (occupied.has(coordinateKey(cell))) return "overlap";
  }
  return null;
}

/** Structural compatibility for restored observations; geometric impossibility remains the engine's job. */
export function isObservationStructurallyValid(
  composition: TreasureHuntComposition,
  observation: TreasureHuntBoardObservation,
): boolean {
  const knownEmpty = new Set<string>();
  for (const empty of observation.knownEmpty) {
    if (!isCoordinateOnBoard(empty, composition) || knownEmpty.has(coordinateKey(empty))) return false;
    knownEmpty.add(coordinateKey(empty));
  }

  const configuredCounts = new Map<string, number>();
  for (const piece of composition.pieces) {
    const key = shapeKey(piece.width, piece.height);
    configuredCounts.set(key, (configuredCounts.get(key) ?? 0) + piece.count);
  }
  const foundCounts = new Map<string, number>();
  const occupied = new Set<string>();
  for (const treasure of observation.foundTreasures) {
    if (!isCoordinateOnBoard(treasure, composition)) return false;
    const key = shapeKey(treasure.width, treasure.height);
    const configuredCount = configuredCounts.get(key);
    if (configuredCount === undefined) return false;
    const foundCount = (foundCounts.get(key) ?? 0) + 1;
    if (foundCount > configuredCount) return false;
    foundCounts.set(key, foundCount);

    const size = placementSize(treasure.width, treasure.height, treasure.orientation);
    if (treasure.x + size.width > composition.boardWidth || treasure.y + size.height > composition.boardHeight) {
      return false;
    }
    for (const cell of rectangleCoordinates(treasure, size.width, size.height)) {
      const key = coordinateKey(cell);
      if (knownEmpty.has(key) || occupied.has(key)) return false;
      occupied.add(key);
    }
  }
  return true;
}

export function shapeKey(width: number, height: number): string {
  return `${Math.min(width, height)}x${Math.max(width, height)}`;
}

export function probabilityPercent(probability: number): number {
  return Math.round(probability * 100);
}

function isCoordinateOnBoard(coordinate: TreasureHuntBoardCoordinate, composition: TreasureHuntComposition): boolean {
  return (
    Number.isSafeInteger(coordinate.x) &&
    Number.isSafeInteger(coordinate.y) &&
    coordinate.x >= 0 &&
    coordinate.y >= 0 &&
    coordinate.x < composition.boardWidth &&
    coordinate.y < composition.boardHeight
  );
}

function rectangleCoordinates(
  origin: TreasureHuntBoardCoordinate,
  width: number,
  height: number,
): TreasureHuntBoardCoordinate[] {
  const coordinates: TreasureHuntBoardCoordinate[] = [];
  for (let y = origin.y; y < origin.y + height; y += 1) {
    for (let x = origin.x; x < origin.x + width; x += 1) coordinates.push({ x, y });
  }
  return coordinates;
}

function coordinateKey(coordinate: TreasureHuntBoardCoordinate): string {
  return `${coordinate.x},${coordinate.y}`;
}
