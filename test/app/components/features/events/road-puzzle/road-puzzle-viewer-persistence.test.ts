import { describe, expect, it } from "@jest/globals";
import {
  clearRoadPuzzleViewerState,
  loadRoadPuzzleViewerState,
  roadPuzzleViewerStorageKey,
  type StorageLike,
  saveRoadPuzzleViewerState,
} from "~/components/features/events/road-puzzle/road-puzzle-viewer-persistence";
import type { RoadPuzzleMap } from "~/domain/event-shop";

const map: RoadPuzzleMap = {
  uid: "map-1",
  name: "Map 1",
  deck: { straight: 7, longCurve: 12, shortCurve: 11 },
  tiles: [
    { x: 0, y: 0, z: 0, type: 1, rotation: 0 },
    { x: 1, y: -1, z: 0, type: 5, rotation: 0 },
  ],
  fixedRails: [],
};

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("road puzzle viewer persistence", () => {
  it("uses a versioned key scoped to event, round and map, with loop rounds sharing r7", () => {
    expect(roadPuzzleViewerStorageKey("event 10846", 3, 2)).toBe("road-puzzle-viewer::v1::event 10846::r3::m2");
    expect(roadPuzzleViewerStorageKey("10846", 7, 1)).toBe(roadPuzzleViewerStorageKey("10846", 12, 1));
    expect(roadPuzzleViewerStorageKey("10846", 7, 1)).not.toBe(roadPuzzleViewerStorageKey("10846", 7, 2));
  });

  it("saves and reloads marks and the remaining deck", () => {
    const storage = new MemoryStorage();
    const state = {
      marks: [{ x: 1, y: -1, z: 0 }],
      remaining: { straight: 3, longCurve: 7, shortCurve: 8 },
    };

    saveRoadPuzzleViewerState("10846", 7, 1, state, storage);

    expect(loadRoadPuzzleViewerState("10846", 7, 1, map, storage)).toEqual(state);
  });

  it("drops marks absent from the selected map and an out-of-range remaining vector", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      roadPuzzleViewerStorageKey("10846", 1, 1),
      JSON.stringify({
        marks: [
          { x: 1, y: -1, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 3, y: -3, z: 0 },
        ],
        remaining: { straight: 8, longCurve: 7, shortCurve: 8 },
      }),
    );

    expect(loadRoadPuzzleViewerState("10846", 1, 1, map, storage)).toEqual({
      marks: [{ x: 1, y: -1, z: 0 }],
      remaining: null,
    });
  });

  it("ignores malformed values and values stored under another version", () => {
    const storage = new MemoryStorage();
    const key = roadPuzzleViewerStorageKey("10846", 1, 1);
    storage.setItem(key, "not json");
    expect(loadRoadPuzzleViewerState("10846", 1, 1, map, storage)).toBeNull();

    storage.setItem("road-puzzle-viewer::v2::10846::r1::m1", JSON.stringify({ marks: [], remaining: null }));
    expect(loadRoadPuzzleViewerState("10846", 1, 1, map, storage)).toBeNull();
  });

  it("treats blocked storage as unavailable for reads, writes and clearing", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(loadRoadPuzzleViewerState("10846", 1, 1, map, blocked)).toBeNull();
    expect(() => saveRoadPuzzleViewerState("10846", 1, 1, { marks: [], remaining: null }, blocked)).not.toThrow();
    expect(() => clearRoadPuzzleViewerState("10846", 1, 1, blocked)).not.toThrow();
  });

  it("removes the saved state when reset", () => {
    const storage = new MemoryStorage();
    saveRoadPuzzleViewerState("10846", 7, 1, { marks: [{ x: 1, y: -1, z: 0 }], remaining: null }, storage);

    clearRoadPuzzleViewerState("10846", 7, 1, storage);

    expect(loadRoadPuzzleViewerState("10846", 7, 1, map, storage)).toBeNull();
  });
});
