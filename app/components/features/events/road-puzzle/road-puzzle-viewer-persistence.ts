import type { RoadPuzzleMap, RoadPuzzleCoordinate } from "~/domain/event-shop";
import type { RailCounts } from "~/domain/road-puzzle/solver";

export type RoadPuzzleViewerState = {
  marks: RoadPuzzleCoordinate[];
  remaining: RailCounts | null;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function roadPuzzleViewerStorageKey(eventUid: string, round: number, mapNumber: number): string {
  const storedRound = round >= 7 ? 7 : round;
  return `road-puzzle-viewer::v1::${eventUid}::r${storedRound}::m${mapNumber}`;
}

export function loadRoadPuzzleViewerState(
  eventUid: string,
  round: number,
  mapNumber: number,
  map: RoadPuzzleMap,
  storage: StorageLike | null = getBrowserStorage(),
): RoadPuzzleViewerState | null {
  if (!storage) return null;

  try {
    const saved = storage.getItem(roadPuzzleViewerStorageKey(eventUid, round, mapNumber));
    if (saved === null) return null;
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed) || !Array.isArray(parsed.marks) || !(parsed.remaining === null || isRecord(parsed.remaining))) {
      return null;
    }
    if (!parsed.marks.every(isCoordinate)) return null;

    const validTiles = new Set(
      map.tiles.filter(({ type }) => type === 5).map(({ x, y, z }) => `${x},${y},${z}`),
    );
    const marks = new Map<string, RoadPuzzleCoordinate>();
    for (const mark of parsed.marks) {
      const key = coordinateKey(mark);
      if (validTiles.has(key)) marks.set(key, mark);
    }

    const remaining = isValidRemaining(parsed.remaining, map) ? { ...parsed.remaining } : null;
    if (
      remaining &&
      (Object.keys(map.deck) as (keyof RailCounts)[]).every((kind) => remaining[kind] === map.deck[kind])
    ) {
      return { marks: [...marks.values()], remaining: null };
    }
    return { marks: [...marks.values()], remaining };
  } catch {
    return null;
  }
}

export function saveRoadPuzzleViewerState(
  eventUid: string,
  round: number,
  mapNumber: number,
  state: RoadPuzzleViewerState,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(roadPuzzleViewerStorageKey(eventUid, round, mapNumber), JSON.stringify(state));
  } catch {
    // A blocked or full browser storage must not interrupt map input.
  }
}

export function clearRoadPuzzleViewerState(
  eventUid: string,
  round: number,
  mapNumber: number,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    storage.removeItem(roadPuzzleViewerStorageKey(eventUid, round, mapNumber));
  } catch {
    // A blocked browser storage must not interrupt map input.
  }
}

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isValidRemaining(value: Record<string, unknown> | null, map: RoadPuzzleMap): value is RailCounts {
  if (value === null) return false;
  return (Object.keys(map.deck) as (keyof RailCounts)[]).every((kind) => {
    const count = value[kind];
    return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && count <= map.deck[kind];
  });
}

function isCoordinate(value: unknown): value is RoadPuzzleCoordinate {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isSafeInteger(value.x) &&
    typeof value.y === "number" &&
    Number.isSafeInteger(value.y) &&
    typeof value.z === "number" &&
    Number.isSafeInteger(value.z) &&
    value.x + value.y + value.z === 0
  );
}

function coordinateKey({ x, y, z }: RoadPuzzleCoordinate): string {
  return `${x},${y},${z}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
