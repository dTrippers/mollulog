import type { StudentDirectoryDisplayField, StudentDirectoryGroupBy } from "~/models/student-directory";
import {
  createStudentFilterState,
  type SortBy,
  STUDENT_DIRECTORY_DISPLAY_VALUES,
  STUDENT_DIRECTORY_GROUP_VALUES,
  STUDENT_FILTER_OPTION_VALUES,
  type StudentFilterState,
} from "./StudentFilter";

export type StudentFilterStateNormalizationOptions = {
  defaultSort: SortBy;
  allowedSorts: readonly SortBy[];
  defaultGroup?: StudentDirectoryGroupBy;
  allowedGroups?: readonly StudentDirectoryGroupBy[];
  defaultDisplay?: StudentDirectoryDisplayField;
  allowedDisplays?: readonly StudentDirectoryDisplayField[];
};

export type StudentFilterCookieOptions = StudentFilterStateNormalizationOptions & {
  cookieName: string;
  cookiePath: string;
};

export const MAX_STUDENT_FILTER_COOKIE_SIZE = 2048;
export const STUDENT_FILTER_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

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

function getDefaultGroup({
  defaultGroup = "none",
  allowedGroups = STUDENT_DIRECTORY_GROUP_VALUES,
}: StudentFilterStateNormalizationOptions) {
  return allowedGroups.includes(defaultGroup) ? defaultGroup : "none";
}

function getDefaultDisplay({
  defaultDisplay = "none",
  allowedDisplays = STUDENT_DIRECTORY_DISPLAY_VALUES,
}: StudentFilterStateNormalizationOptions) {
  return allowedDisplays.includes(defaultDisplay) ? defaultDisplay : "none";
}

function createDefaultStudentFilterState(options: StudentFilterStateNormalizationOptions): StudentFilterState {
  return {
    ...createStudentFilterState(getDefaultSort(options)),
    groupBy: getDefaultGroup(options),
    displayBy: getDefaultDisplay(options),
  };
}

function filterKnownNumbers(value: unknown, allowedValues: readonly number[]): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set(allowedValues);
  const seen = new Set<number>();
  return value.filter((item): item is number => {
    if (typeof item !== "number" || !Number.isInteger(item) || !allowed.has(item) || seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}

export function normalizeStudentFilterState(
  value: unknown,
  options: StudentFilterStateNormalizationOptions,
): StudentFilterState {
  const defaults = createDefaultStudentFilterState(options);
  if (!isRecord(value)) {
    return defaults;
  }

  const isDirectoryState = Boolean(options.allowedGroups || options.allowedDisplays);
  const normalized: StudentFilterState = {
    ...defaults,
    attackTypes: filterKnownValues(value.attackTypes, STUDENT_FILTER_OPTION_VALUES.attackTypes),
    defenseTypes: filterKnownValues(value.defenseTypes, STUDENT_FILTER_OPTION_VALUES.defenseTypes),
    roles: filterKnownValues(value.roles, STUDENT_FILTER_OPTION_VALUES.roles),
    tacticRoles: filterKnownValues(value.tacticRoles, STUDENT_FILTER_OPTION_VALUES.tacticRoles),
    positions: filterKnownValues(value.positions, STUDENT_FILTER_OPTION_VALUES.positions),
    schools: isDirectoryState ? filterKnownValues(value.schools, STUDENT_FILTER_OPTION_VALUES.schools) : [],
    equipmentSlots: isDirectoryState
      ? ([0, 1, 2].map((index) =>
          filterKnownValues(
            Array.isArray(value.equipmentSlots) ? value.equipmentSlots[index] : undefined,
            STUDENT_FILTER_OPTION_VALUES.equipmentTypes,
          ),
        ) as [string[], string[], string[]])
      : [[], [], []],
    initialTiers: isDirectoryState
      ? filterKnownNumbers(value.initialTiers, STUDENT_FILTER_OPTION_VALUES.initialTiers)
      : [],
  };

  if (options.allowedSorts.includes(value.sort as SortBy)) {
    normalized.sort = value.sort as SortBy;
  }

  const allowedGroups = options.allowedGroups ?? ["none"];
  if (allowedGroups.includes(value.groupBy as StudentDirectoryGroupBy)) {
    normalized.groupBy = value.groupBy as StudentDirectoryGroupBy;
  }

  const allowedDisplays = options.allowedDisplays ?? ["none"];
  if (allowedDisplays.includes(value.displayBy as StudentDirectoryDisplayField)) {
    normalized.displayBy = value.displayBy as StudentDirectoryDisplayField;
  }

  return normalized;
}

type PersistedStudentFilterState = Pick<
  StudentFilterState,
  "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions" | "sort"
> &
  Partial<Pick<StudentFilterState, "schools" | "equipmentSlots" | "initialTiers" | "groupBy" | "displayBy">>;

function toPersistedStudentFilterState(
  state: StudentFilterState,
  options: StudentFilterStateNormalizationOptions,
): PersistedStudentFilterState {
  const persisted: PersistedStudentFilterState = {
    attackTypes: state.attackTypes,
    defenseTypes: state.defenseTypes,
    roles: state.roles,
    tacticRoles: state.tacticRoles,
    positions: state.positions,
    sort: state.sort,
  };
  if (options.allowedGroups || options.allowedDisplays) {
    persisted.schools = state.schools;
    persisted.equipmentSlots = state.equipmentSlots;
    persisted.initialTiers = state.initialTiers;
    persisted.groupBy = state.groupBy;
    persisted.displayBy = state.displayBy;
  }
  return persisted;
}

function getCookieValue(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0 || cookie.slice(0, separatorIndex).trim() !== cookieName) {
      continue;
    }
    return cookie.slice(separatorIndex + 1).trim();
  }

  return null;
}

export function readStudentFilterStateFromCookie(
  cookieHeader: string | null,
  options: StudentFilterCookieOptions,
): StudentFilterState {
  const defaults = createDefaultStudentFilterState(options);
  const encodedValue = getCookieValue(cookieHeader, options.cookieName);
  if (!encodedValue || encodedValue.length > MAX_STUDENT_FILTER_COOKIE_SIZE) {
    return defaults;
  }

  try {
    return normalizeStudentFilterState(JSON.parse(decodeURIComponent(encodedValue)), options);
  } catch {
    return defaults;
  }
}

export function serializeStudentFilterStateCookie(
  options: StudentFilterStateNormalizationOptions,
  state: StudentFilterState,
): string | null {
  try {
    const normalized = normalizeStudentFilterState(state, options);
    const serialized = encodeURIComponent(JSON.stringify(toPersistedStudentFilterState(normalized, options)));
    return serialized.length <= MAX_STUDENT_FILTER_COOKIE_SIZE ? serialized : null;
  } catch {
    return null;
  }
}

function isHttps(): boolean {
  try {
    return typeof location !== "undefined" && location.protocol === "https:";
  } catch {
    return false;
  }
}

function getBrowserDocument(): Document | null {
  try {
    return typeof document === "undefined" ? null : document;
  } catch {
    return null;
  }
}

export function writeStudentFilterStateCookie(options: StudentFilterCookieOptions, state: StudentFilterState): void {
  const browserDocument = getBrowserDocument();
  if (!browserDocument) {
    return;
  }

  const serialized = serializeStudentFilterStateCookie(options, state);
  if (!serialized) {
    return;
  }

  try {
    const secure = isHttps() ? "; Secure" : "";
    browserDocument.cookie = `${options.cookieName}=${serialized}; Path=${options.cookiePath}; Max-Age=${STUDENT_FILTER_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    // Keep the student list usable when browser cookies are unavailable.
  }
}
