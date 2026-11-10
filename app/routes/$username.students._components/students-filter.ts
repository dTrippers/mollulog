import hangul from "hangul-js";
import { Attack, Defense } from "~/graphql/graphql";
import { attackTypeColor, attackTypeLocale, defenseTypeColor, defenseTypeShortLocale } from "~/locales/ko";
import type { Position, Role, TacticRole } from "~/models/content.d";

export type StudentsSort = "recent" | "old" | "name" | "tier";

export type StudentsFilterState = {
  attackTypes: Attack[];
  defenseTypes: Defense[];
  roles: Role[];
  tacticRoles: TacticRole[];
  positions: Position[];
  sort: StudentsSort;
  search: string;
};

export const STUDENTS_FILTER_COOKIE_NAME = "mollulog_user_students_filter";
export const STUDENTS_FILTER_COOKIE_PATH = "/";
export const STUDENTS_FILTER_SORTS = ["recent", "old", "name", "tier"] as const satisfies readonly StudentsSort[];
const DEFAULT_SORT: StudentsSort = "recent";
const MAX_COOKIE_SIZE = 2048;
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const ATTACK_OPTIONS = [Attack.Explosive, Attack.Piercing, Attack.Mystic, Attack.Sonic, Attack.Chemical].map(
  (value) => ({ value, label: attackTypeLocale[value], color: attackTypeColor[value] }),
);
export const DEFENSE_OPTIONS = [Defense.Light, Defense.Heavy, Defense.Special, Defense.Elastic, Defense.Composite].map(
  (value) => ({ value, label: defenseTypeShortLocale[value], color: defenseTypeColor[value] }),
);
export const ROLE_OPTIONS = [
  { value: "striker" as const, label: "스트라이커", color: "red" as const },
  { value: "special" as const, label: "스페셜", color: "blue" as const },
];
export const POSITION_OPTIONS = [
  { value: "front" as const, label: "FRONT" },
  { value: "middle" as const, label: "MIDDLE" },
  { value: "back" as const, label: "BACK" },
];
export const TACTIC_ROLE_OPTIONS = [
  { value: "attacker" as const, label: "딜러" },
  { value: "tank" as const, label: "탱커" },
  { value: "healer" as const, label: "힐러" },
  { value: "support" as const, label: "서포터" },
  { value: "tactical_support" as const, label: "T.S." },
];
export const SORT_LABELS: Record<StudentsSort, string> = {
  recent: "최신순",
  old: "과거순",
  name: "이름순",
  tier: "★ 순",
};

export function createStudentsFilterState(sort: StudentsSort = DEFAULT_SORT): StudentsFilterState {
  return { attackTypes: [], defenseTypes: [], roles: [], tacticRoles: [], positions: [], sort, search: "" };
}

export function hasActiveStudentsFilters(state: StudentsFilterState): boolean {
  return Boolean(
    state.search ||
      state.attackTypes.length ||
      state.defenseTypes.length ||
      state.roles.length ||
      state.tacticRoles.length ||
      state.positions.length,
  );
}

export function clearStudentsFilters(state: StudentsFilterState): StudentsFilterState {
  return createStudentsFilterState(state.sort);
}

export type FilterableStudent = {
  uid: string;
  name: string;
  attackType: Attack;
  defenseType: Defense;
  role: Role;
  position: Position;
  tacticRole: TacticRole;
  order: number;
  initialTier: number;
  tier: number | null;
};

function compareStudents(a: FilterableStudent, b: FilterableStudent, sort: StudentsSort): number {
  const byName = a.name.localeCompare(b.name, "ko");
  if (sort === "name") return byName || a.order - b.order || a.uid.localeCompare(b.uid);
  if (sort === "tier") {
    return (
      (b.tier ?? b.initialTier) - (a.tier ?? a.initialTier) || a.order - b.order || byName || a.uid.localeCompare(b.uid)
    );
  }
  const direction = sort === "old" ? 1 : -1;
  return direction * (a.order - b.order) || byName || a.uid.localeCompare(b.uid);
}

export function applyStudentsFilter<T extends FilterableStudent>(
  students: readonly T[],
  state: StudentsFilterState,
): T[] {
  return students
    .filter((student) => {
      if (state.attackTypes.length && !state.attackTypes.includes(student.attackType)) return false;
      if (state.defenseTypes.length && !state.defenseTypes.includes(student.defenseType)) return false;
      if (state.roles.length && !state.roles.includes(student.role)) return false;
      if (state.positions.length && !state.positions.includes(student.position)) return false;
      if (state.tacticRoles.length && !state.tacticRoles.includes(student.tacticRole)) return false;
      if (state.search && hangul.search(student.name, state.search) < 0) return false;
      return true;
    })
    .sort((a, b) => compareStudents(a, b, state.sort));
}

function knownValues<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  return value.filter((item): item is T => {
    if (typeof item !== "string" || !allowed.includes(item as T) || seen.has(item as T)) return false;
    seen.add(item as T);
    return true;
  });
}

// The cookie keeps the filter and the sort, not the search text, so the next visit starts with the same chips.
export function normalizeStudentsFilterState(value: unknown): StudentsFilterState {
  const defaults = createStudentsFilterState();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return defaults;
  const record = value as Record<string, unknown>;
  return {
    ...defaults,
    attackTypes: knownValues(
      record.attackTypes,
      ATTACK_OPTIONS.map(({ value }) => value),
    ),
    defenseTypes: knownValues(
      record.defenseTypes,
      DEFENSE_OPTIONS.map(({ value }) => value),
    ),
    roles: knownValues(
      record.roles,
      ROLE_OPTIONS.map(({ value }) => value),
    ),
    tacticRoles: knownValues(
      record.tacticRoles,
      TACTIC_ROLE_OPTIONS.map(({ value }) => value),
    ),
    positions: knownValues(
      record.positions,
      POSITION_OPTIONS.map(({ value }) => value),
    ),
    sort: STUDENTS_FILTER_SORTS.includes(record.sort as StudentsSort) ? (record.sort as StudentsSort) : DEFAULT_SORT,
  };
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const cookie of header.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator >= 0 && cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return null;
}

export function readStudentsFilterFromCookie(header: string | null): StudentsFilterState {
  const encoded = cookieValue(header, STUDENTS_FILTER_COOKIE_NAME);
  if (!encoded || encoded.length > MAX_COOKIE_SIZE) return createStudentsFilterState();
  try {
    return normalizeStudentsFilterState(JSON.parse(decodeURIComponent(encoded)));
  } catch {
    return createStudentsFilterState();
  }
}

function serializeStudentsFilter(state: StudentsFilterState): string | null {
  const { attackTypes, defenseTypes, roles, tacticRoles, positions, sort } = normalizeStudentsFilterState(state);
  const serialized = encodeURIComponent(
    JSON.stringify({ attackTypes, defenseTypes, roles, tacticRoles, positions, sort }),
  );
  return serialized.length <= MAX_COOKIE_SIZE ? serialized : null;
}

export function writeStudentsFilterCookie(state: StudentsFilterState): void {
  if (typeof document === "undefined") return;
  const serialized = serializeStudentsFilter(state);
  if (!serialized) return;
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${STUDENTS_FILTER_COOKIE_NAME}=${serialized}; Path=${STUDENTS_FILTER_COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    // The list stays usable when the browser blocks cookies.
  }
}

export function isSameStudentsFilterCookie(a: StudentsFilterState, b: StudentsFilterState): boolean {
  return serializeStudentsFilter(a) === serializeStudentsFilter(b);
}
