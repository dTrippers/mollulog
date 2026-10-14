import { describe, expect, it } from "@jest/globals";
import { Defense } from "~/graphql/graphql";
import {
  clearRaidRankFilterSettings,
  getRaidRankFilterStorageKey,
  hasActiveRaidRankFilterSettings,
  hasAppliedRaidRankFilterSettings,
  normalizeRaidRankFilterSettings,
  readRaidRankFilterSettings,
  writeRaidRankFilterSettings,
} from "~/routes/raids.$raidType.$seasonIndex._components/rank-filter-settings";

class MemoryStorage {
  private values = new Map<string, string>();

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

describe("raid rank filter settings storage", () => {
  it("shows the clear action only for filters currently applied to this user", () => {
    expect(hasAppliedRaidRankFilterSettings({ filterNotOwned: true }, false)).toBe(false);
    expect(hasAppliedRaidRankFilterSettings({ allowBorrowedStudent: true }, true)).toBe(false);
    expect(hasAppliedRaidRankFilterSettings({ filterNotOwned: true }, true)).toBe(true);
    expect(hasAppliedRaidRankFilterSettings({ includeStudents: [{ uid: "10085", tiers: [] }] }, false)).toBe(true);
  });

  it("uses an independent key for each raid season and defense type", () => {
    const base = { raidType: "total_assault" as const, seasonIndex: 84, defenseType: Defense.Light };
    const baseKey = getRaidRankFilterStorageKey(base);

    expect(getRaidRankFilterStorageKey({ ...base, defenseType: Defense.Special })).not.toBe(baseKey);
    expect(getRaidRankFilterStorageKey({ ...base, seasonIndex: 85 })).not.toBe(baseKey);
    expect(getRaidRankFilterStorageKey({ ...base, raidType: "elimination" })).not.toBe(baseKey);
  });

  it("normalizes saved filter values and never keeps exact parties", () => {
    expect(
      normalizeRaidRankFilterSettings({
        difficulty: "torment",
        includeStudents: [
          { uid: "10085", tiers: [5, 9, 10, 0, "bad", 5] },
          { uid: "", tiers: [] },
        ],
        excludeStudents: [{ uid: "10086", tiers: [] }],
        filterNotOwned: true,
        allowBorrowedStudent: true,
        exactParties: [["10085"]],
      }),
    ).toEqual({
      difficulty: "torment",
      includeStudents: [{ uid: "10085", tiers: [5, 9, 10] }],
      excludeStudents: [{ uid: "10086", tiers: [] }],
      filterNotOwned: true,
      allowBorrowedStudent: true,
    });
    expect(
      hasActiveRaidRankFilterSettings({
        difficulty: null,
        includeStudents: [],
        excludeStudents: [],
        filterNotOwned: false,
        allowBorrowedStudent: false,
        exactParties: [["10085"]],
      }),
    ).toBe(false);
  });

  it("reads, writes, and clears only the selected storage key", () => {
    const storage = new MemoryStorage();
    const key = "mollulog::raid-rank-filter:total_assault:84:light";
    const settings = normalizeRaidRankFilterSettings({ difficulty: "insane", allowBorrowedStudent: true });

    writeRaidRankFilterSettings(key, { ...settings, exactParties: [["10085"]] }, storage);
    expect(JSON.parse(storage.getItem(key) ?? "{}")).toEqual(settings);
    expect(readRaidRankFilterSettings(key, storage)).toEqual(settings);
    expect(hasActiveRaidRankFilterSettings(readRaidRankFilterSettings(key, storage))).toBe(true);

    clearRaidRankFilterSettings(key, storage);
    expect(storage.getItem(key)).toBeNull();
  });

  it("restores each defense and season from its own saved key, with empty defaults", () => {
    const storage = new MemoryStorage();
    const base = { raidType: "total_assault" as const, seasonIndex: 84, defenseType: Defense.Light };
    const lightKey = getRaidRankFilterStorageKey(base);
    const specialKey = getRaidRankFilterStorageKey({ ...base, defenseType: Defense.Special });
    const nextSeasonKey = getRaidRankFilterStorageKey({ ...base, seasonIndex: 85 });

    writeRaidRankFilterSettings(lightKey, { difficulty: "torment" }, storage);
    writeRaidRankFilterSettings(specialKey, { includeStudents: [{ uid: "10085", tiers: [9] }] }, storage);

    expect(readRaidRankFilterSettings(lightKey, storage).difficulty).toBe("torment");
    expect(readRaidRankFilterSettings(specialKey, storage).includeStudents).toEqual([{ uid: "10085", tiers: [9] }]);
    expect(readRaidRankFilterSettings(nextSeasonKey, storage)).toEqual(normalizeRaidRankFilterSettings(null));
  });

  it("removes empty settings and falls back safely on corrupt or unavailable storage", () => {
    const storage = new MemoryStorage();
    const key = "raid-filter";
    storage.setItem(key, "not-json");
    expect(readRaidRankFilterSettings(key, storage)).toEqual(normalizeRaidRankFilterSettings(null));

    writeRaidRankFilterSettings(key, {}, storage);
    expect(storage.getItem(key)).toBeNull();

    const unavailableStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
    };
    expect(readRaidRankFilterSettings(key, unavailableStorage)).toEqual(normalizeRaidRankFilterSettings(null));
    expect(() => writeRaidRankFilterSettings(key, {}, unavailableStorage)).not.toThrow();
    expect(() => clearRaidRankFilterSettings(key, unavailableStorage)).not.toThrow();
  });
});
