import type { TreasureHuntBoardCoordinate, TreasureHuntBoardOrientation } from "~/domain/treasure-hunt";

const STORAGE_VERSION = 1;
export const MAX_UNDO_SNAPSHOTS = 100;

export type RecordedTreasure = TreasureHuntBoardCoordinate & {
  id: number;
  width: number;
  height: number;
  orientation: TreasureHuntBoardOrientation;
};

export type TreasureHuntBoardSnapshot = {
  round: number;
  knownEmpty: TreasureHuntBoardCoordinate[];
  foundTreasures: RecordedTreasure[];
};

export type PersistedTreasureHuntBoard = {
  version: typeof STORAGE_VERSION;
  board: TreasureHuntBoardSnapshot;
  undoStack: TreasureHuntBoardSnapshot[];
  nextTreasureId: number;
};

export function normalizeTreasureHuntBoardRounds(
  board: PersistedTreasureHuntBoard,
  loopRound: number,
): PersistedTreasureHuntBoard {
  const normalizeSnapshot = (snapshot: TreasureHuntBoardSnapshot): TreasureHuntBoardSnapshot => ({
    ...snapshot,
    round: Math.min(snapshot.round, loopRound),
  });

  return {
    ...board,
    board: normalizeSnapshot(board.board),
    undoStack: board.undoStack.map(normalizeSnapshot),
  };
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function treasureHuntBoardStorageKey(eventUid: string): string {
  return `treasure-hunt-board::v${STORAGE_VERSION}::${encodeURIComponent(eventUid)}`;
}

export function loadTreasureHuntBoard(
  eventUid: string,
  storage: StorageLike | null = getBrowserStorage(),
): PersistedTreasureHuntBoard | null {
  if (!storage) return null;

  try {
    const saved = storage.getItem(treasureHuntBoardStorageKey(eventUid));
    if (saved === null) return null;
    const parsed: unknown = JSON.parse(saved);
    return isPersistedBoard(parsed) ? { ...parsed, undoStack: parsed.undoStack.slice(-MAX_UNDO_SNAPSHOTS) } : null;
  } catch {
    return null;
  }
}

export function saveTreasureHuntBoard(
  eventUid: string,
  board: PersistedTreasureHuntBoard,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    const boundedBoard = { ...board, undoStack: board.undoStack.slice(-MAX_UNDO_SNAPSHOTS) };
    storage.setItem(treasureHuntBoardStorageKey(eventUid), JSON.stringify(boundedBoard));
  } catch {
    // A blocked or full browser storage must not interrupt board input.
  }
}

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isPersistedBoard(value: unknown): value is PersistedTreasureHuntBoard {
  if (!isRecord(value) || value.version !== STORAGE_VERSION || !isSnapshot(value.board)) return false;
  return (
    Array.isArray(value.undoStack) &&
    value.undoStack.every(isSnapshot) &&
    typeof value.nextTreasureId === "number" &&
    Number.isSafeInteger(value.nextTreasureId) &&
    value.nextTreasureId > 0
  );
}

function isSnapshot(value: unknown): value is TreasureHuntBoardSnapshot {
  return (
    isRecord(value) &&
    typeof value.round === "number" &&
    Number.isSafeInteger(value.round) &&
    value.round > 0 &&
    Array.isArray(value.knownEmpty) &&
    value.knownEmpty.every(isCoordinate) &&
    Array.isArray(value.foundTreasures) &&
    value.foundTreasures.every(isRecordedTreasure)
  );
}

function isCoordinate(value: unknown): value is TreasureHuntBoardCoordinate {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isSafeInteger(value.x) &&
    typeof value.y === "number" &&
    Number.isSafeInteger(value.y) &&
    value.x >= 0 &&
    value.y >= 0
  );
}

function isRecordedTreasure(value: unknown): value is RecordedTreasure {
  if (!isRecord(value) || !isCoordinate(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "number" &&
    Number.isSafeInteger(record.id) &&
    record.id > 0 &&
    typeof record.width === "number" &&
    Number.isSafeInteger(record.width) &&
    record.width > 0 &&
    typeof record.height === "number" &&
    Number.isSafeInteger(record.height) &&
    record.height > 0 &&
    (record.orientation === "horizontal" || record.orientation === "vertical")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
