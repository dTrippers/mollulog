import { useEffect, useState } from "react";
import {
  createStudentFilterState,
  type SortBy,
  STUDENT_FILTER_OPTION_VALUES,
  type StudentFilterState,
} from "./StudentFilter";

export type PersistentStudentFilterStateOptions = {
  storageKey: string;
  defaultSort: SortBy;
  allowedSorts: readonly SortBy[];
};

type StudentFilterStateNormalizationOptions = Pick<PersistentStudentFilterStateOptions, "defaultSort" | "allowedSorts">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filterKnownValues<T extends string>(value: unknown, allowedValues: readonly T[]): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set(allowedValues);
  const seen = new Set<T>();
  return value.filter((item): item is T => {
    if (typeof item !== "string" || !allowed.has(item as T) || seen.has(item as T)) {
      return false;
    }
    seen.add(item as T);
    return true;
  });
}

function getDefaultSort({ defaultSort, allowedSorts }: StudentFilterStateNormalizationOptions): SortBy {
  return allowedSorts.includes(defaultSort) ? defaultSort : "recent";
}

function createDefaultStudentFilterState(options: StudentFilterStateNormalizationOptions): StudentFilterState {
  return createStudentFilterState(getDefaultSort(options));
}

export function normalizeStudentFilterState(
  value: unknown,
  options: StudentFilterStateNormalizationOptions,
): StudentFilterState {
  const defaults = createDefaultStudentFilterState(options);
  if (!isRecord(value)) {
    return defaults;
  }

  const normalized: StudentFilterState = {
    ...defaults,
    attackTypes: filterKnownValues(value.attackTypes, STUDENT_FILTER_OPTION_VALUES.attackTypes),
    defenseTypes: filterKnownValues(value.defenseTypes, STUDENT_FILTER_OPTION_VALUES.defenseTypes),
    roles: filterKnownValues(value.roles, STUDENT_FILTER_OPTION_VALUES.roles),
    tacticRoles: filterKnownValues(value.tacticRoles, STUDENT_FILTER_OPTION_VALUES.tacticRoles),
    positions: filterKnownValues(value.positions, STUDENT_FILTER_OPTION_VALUES.positions),
  };

  if (options.allowedSorts.includes(value.sort as SortBy)) {
    normalized.sort = value.sort as SortBy;
  }
  if (typeof value.search === "string") {
    normalized.search = value.search;
  }

  return normalized;
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readStudentFilterState(options: PersistentStudentFilterStateOptions): StudentFilterState {
  const defaults = createDefaultStudentFilterState(options);
  const storage = getBrowserStorage();
  if (!storage) {
    return defaults;
  }

  try {
    const saved = storage.getItem(options.storageKey);
    return saved ? normalizeStudentFilterState(JSON.parse(saved), options) : defaults;
  } catch {
    return defaults;
  }
}

function toPersistedStudentFilterState(state: StudentFilterState): StudentFilterState {
  return {
    attackTypes: state.attackTypes,
    defenseTypes: state.defenseTypes,
    roles: state.roles,
    tacticRoles: state.tacticRoles,
    positions: state.positions,
    ...(state.sort === undefined ? {} : { sort: state.sort }),
    ...(state.search === undefined ? {} : { search: state.search }),
  };
}

export function writeStudentFilterState(options: PersistentStudentFilterStateOptions, state: StudentFilterState): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    const normalized = normalizeStudentFilterState(state, options);
    storage.setItem(options.storageKey, JSON.stringify(toPersistedStudentFilterState(normalized)));
  } catch {
    // Keep the student list usable when browser storage is unavailable.
  }
}

export function usePersistentStudentFilterState(options: PersistentStudentFilterStateOptions) {
  const { allowedSorts, defaultSort, storageKey } = options;
  const [state, setState] = useState<StudentFilterState>(() => createDefaultStudentFilterState(options));
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);

  useEffect(() => {
    setHydratedStorageKey(null);
    setState(readStudentFilterState({ storageKey, defaultSort, allowedSorts }));
    setHydratedStorageKey(storageKey);
  }, [allowedSorts, defaultSort, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) {
      return;
    }

    writeStudentFilterState({ storageKey, defaultSort, allowedSorts }, state);
  }, [allowedSorts, defaultSort, hydratedStorageKey, state, storageKey]);

  return [state, setState] as const;
}
