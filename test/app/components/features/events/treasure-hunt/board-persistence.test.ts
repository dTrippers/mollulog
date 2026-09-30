import { describe, expect, it } from "@jest/globals";
import {
  loadTreasureHuntBoard,
  normalizeTreasureHuntBoardRounds,
  type PersistedTreasureHuntBoard,
  saveTreasureHuntBoard,
  treasureHuntBoardStorageKey,
} from "~/components/features/events/treasure-hunt/board-persistence";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const savedBoard: PersistedTreasureHuntBoard = {
  version: 1,
  board: {
    round: 1,
    knownEmpty: [{ x: 0, y: 0 }],
    foundTreasures: [{ id: 1, x: 2, y: 1, width: 3, height: 1, orientation: "vertical" }],
  },
  undoStack: [],
  nextTreasureId: 2,
};

describe("treasure hunt board persistence", () => {
  it("saves and restores each event's board independently", () => {
    const storage = createMemoryStorage();
    saveTreasureHuntBoard("event/one", savedBoard, storage);

    expect(loadTreasureHuntBoard("event/one", storage)).toEqual(savedBoard);
    expect(loadTreasureHuntBoard("event/two", storage)).toBeNull();
    expect(treasureHuntBoardStorageKey("event/one")).not.toContain("event/one");
  });

  it("preserves structurally valid records without interpreting their current composition", () => {
    const storage = createMemoryStorage();
    saveTreasureHuntBoard("event", savedBoard, storage);

    expect(loadTreasureHuntBoard("event", storage)?.board.foundTreasures).toEqual(savedBoard.board.foundTreasures);
  });

  it("keeps only the latest 100 undo snapshots when saving", () => {
    const storage = createMemoryStorage();
    const undoStack = Array.from({ length: 105 }, (_, index) => ({
      round: 1,
      knownEmpty: [{ x: index, y: 0 }],
      foundTreasures: [],
    }));

    saveTreasureHuntBoard("event", { ...savedBoard, undoStack }, storage);

    const restored = loadTreasureHuntBoard("event", storage);
    expect(restored?.undoStack).toHaveLength(100);
    expect(restored?.undoStack[0]?.knownEmpty).toEqual([{ x: 5, y: 0 }]);
    expect(restored?.undoStack.at(-1)?.knownEmpty).toEqual([{ x: 104, y: 0 }]);
  });

  it("normalizes restored current and undo rounds to the loop round without changing records", () => {
    const board = {
      ...savedBoard,
      board: { ...savedBoard.board, round: 99 },
      undoStack: [
        { ...savedBoard.board, round: 12 },
        { ...savedBoard.board, round: 3 },
      ],
    };

    const normalized = normalizeTreasureHuntBoardRounds(board, 7);

    expect(normalized.board.round).toBe(7);
    expect(normalized.board.knownEmpty).toEqual(savedBoard.board.knownEmpty);
    expect(normalized.board.foundTreasures).toEqual(savedBoard.board.foundTreasures);
    expect(normalized.undoStack.map((snapshot) => snapshot.round)).toEqual([7, 3]);
    expect(normalized.undoStack[0]?.foundTreasures).toEqual(savedBoard.board.foundTreasures);
  });

  it("ignores storage access and parse failures without throwing", () => {
    const storageFailure = {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
    };
    const invalidJson = { getItem: () => "{", setItem: () => undefined };

    expect(loadTreasureHuntBoard("event", storageFailure)).toBeNull();
    expect(() => saveTreasureHuntBoard("event", savedBoard, storageFailure)).not.toThrow();
    expect(loadTreasureHuntBoard("event", invalidJson)).toBeNull();
  });
});
