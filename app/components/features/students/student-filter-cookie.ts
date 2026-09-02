import {
  createStudentFilterState,
  type SortBy,
  STUDENT_FILTER_OPTION_VALUES,
  type StudentFilterState,
} from "./StudentFilter";

export type StudentFilterStateNormalizationOptions = {
  defaultSort: SortBy;
  allowedSorts: readonly SortBy[];
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

  return normalized;
}

type PersistedStudentFilterState = Pick<
  StudentFilterState,
  "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions" | "sort"
>;

function toPersistedStudentFilterState(state: StudentFilterState): PersistedStudentFilterState {
  return {
    attackTypes: state.attackTypes,
    defenseTypes: state.defenseTypes,
    roles: state.roles,
    tacticRoles: state.tacticRoles,
    positions: state.positions,
    sort: state.sort,
  };
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
    const serialized = encodeURIComponent(JSON.stringify(toPersistedStudentFilterState(normalized)));
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
