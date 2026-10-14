import type { SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { type Difficulty, parseDifficulty } from "~/domain/raid-score";
import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";

export type StoredRaidRankFilterSettings = {
  difficulty: Difficulty | null;
  includeStudents: { uid: string; tiers: number[] }[];
  excludeStudents: { uid: string; tiers: number[] }[];
  filterNotOwned: boolean;
  allowBorrowedStudent: boolean;
};

export const DEFAULT_RAID_RANK_FILTER_SETTINGS: StoredRaidRankFilterSettings = {
  difficulty: null,
  includeStudents: [],
  excludeStudents: [],
  filterNotOwned: false,
  allowBorrowedStudent: false,
};

const RAID_RANK_FILTER_STORAGE_PREFIX = "mollulog::raid-rank-filter";

type KeyParts = {
  raidType: RaidType;
  seasonIndex: number;
  defenseType: Defense;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getRaidRankFilterStorageKey({ raidType, seasonIndex, defenseType }: KeyParts): string {
  return `${RAID_RANK_FILTER_STORAGE_PREFIX}:${raidType}:${seasonIndex}:${defenseType}`;
}

function normalizeStudentFilters(value: unknown): { uid: string; tiers: number[] }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const student = entry as { uid?: unknown; tiers?: unknown };
    if (typeof student.uid !== "string" || student.uid.length === 0 || !Array.isArray(student.tiers)) {
      return [];
    }

    const tiers = Array.from(
      new Set(student.tiers.filter((tier): tier is number => Number.isSafeInteger(tier) && tier > 0)),
    );

    return [{ uid: student.uid, tiers }];
  });
}

export function normalizeRaidRankFilterSettings(value: unknown): StoredRaidRankFilterSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RAID_RANK_FILTER_SETTINGS };
  }

  const settings = value as Partial<Record<keyof StoredRaidRankFilterSettings, unknown>>;
  return {
    difficulty: parseDifficulty(typeof settings.difficulty === "string" ? settings.difficulty : null),
    includeStudents: normalizeStudentFilters(settings.includeStudents),
    excludeStudents: normalizeStudentFilters(settings.excludeStudents),
    filterNotOwned: typeof settings.filterNotOwned === "boolean" ? settings.filterNotOwned : false,
    allowBorrowedStudent: typeof settings.allowBorrowedStudent === "boolean" ? settings.allowBorrowedStudent : false,
  };
}

export function hasActiveRaidRankFilterSettings(value: unknown): boolean {
  const settings = normalizeRaidRankFilterSettings(value);
  return (
    settings.difficulty !== null ||
    settings.includeStudents.length > 0 ||
    settings.excludeStudents.length > 0 ||
    settings.filterNotOwned ||
    settings.allowBorrowedStudent
  );
}

export function hasAppliedRaidRankFilterSettings(value: unknown, signedIn: boolean): boolean {
  const settings = normalizeRaidRankFilterSettings(value);
  return (
    settings.difficulty !== null ||
    settings.includeStudents.length > 0 ||
    settings.excludeStudents.length > 0 ||
    (signedIn && settings.filterNotOwned)
  );
}

function getStorage(storage?: StorageLike): StorageLike | undefined {
  if (storage) {
    return storage;
  }
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage;
}

export function readRaidRankFilterSettings(key: string, storage?: StorageLike): StoredRaidRankFilterSettings {
  try {
    const activeStorage = getStorage(storage);
    const saved = activeStorage?.getItem(key);
    return saved ? normalizeRaidRankFilterSettings(JSON.parse(saved)) : { ...DEFAULT_RAID_RANK_FILTER_SETTINGS };
  } catch {
    return { ...DEFAULT_RAID_RANK_FILTER_SETTINGS };
  }
}

export function writeRaidRankFilterSettings(key: string, value: unknown, storage?: StorageLike): void {
  try {
    const activeStorage = getStorage(storage);
    if (!activeStorage) {
      return;
    }

    const settings = normalizeRaidRankFilterSettings(value);
    if (hasActiveRaidRankFilterSettings(settings)) {
      activeStorage.setItem(key, JSON.stringify(settings));
    } else {
      activeStorage.removeItem(key);
    }
  } catch {
    // Keep rank search usable when browser storage is unavailable.
  }
}

export function clearRaidRankFilterSettings(key: string, storage?: StorageLike): void {
  try {
    getStorage(storage)?.removeItem(key);
  } catch {
    // Keep rank search usable when browser storage is unavailable.
  }
}

export function useRaidRankFilterSettings({ raidType, seasonIndex, defenseType }: KeyParts) {
  const key = getRaidRankFilterStorageKey({ raidType, seasonIndex, defenseType });
  const [entry, setEntry] = useState(() => ({ key, settings: { ...DEFAULT_RAID_RANK_FILTER_SETTINGS } }));
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    setEntry({ key, settings: readRaidRankFilterSettings(key) });
    setLoadedKey(key);
  }, [key]);

  useEffect(() => {
    if (loadedKey !== key || entry.key !== key) {
      return;
    }
    writeRaidRankFilterSettings(key, entry.settings);
  }, [entry, key, loadedKey]);

  const setSettings = useCallback(
    (updater: SetStateAction<StoredRaidRankFilterSettings>) => {
      setEntry((current) => {
        if (current.key !== key) {
          return current;
        }
        const next = typeof updater === "function" ? updater(current.settings) : updater;
        return { key, settings: normalizeRaidRankFilterSettings(next) };
      });
    },
    [key],
  );

  const clearSettings = useCallback(() => {
    clearRaidRankFilterSettings(key);
    setEntry((current) =>
      current.key === key ? { key, settings: { ...DEFAULT_RAID_RANK_FILTER_SETTINGS } } : current,
    );
  }, [key]);

  return {
    settings: entry.key === key ? entry.settings : { ...DEFAULT_RAID_RANK_FILTER_SETTINGS },
    setSettings,
    clearSettings,
  };
}
