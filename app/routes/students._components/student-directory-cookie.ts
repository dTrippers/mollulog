import {
  STUDENT_DIRECTORY_ACQUISITION_TYPES,
  STUDENT_DIRECTORY_ATTACK_TYPES,
  STUDENT_DIRECTORY_CLASSES,
  STUDENT_DIRECTORY_DEFENSE_TYPES,
  STUDENT_DIRECTORY_DISPLAY_OPTIONS,
  STUDENT_DIRECTORY_GROUP_OPTIONS,
  STUDENT_DIRECTORY_INITIAL_TIERS,
  STUDENT_DIRECTORY_POSITIONS,
  STUDENT_DIRECTORY_ROLES,
  STUDENT_DIRECTORY_SKILL_EFFECTS,
  STUDENT_DIRECTORY_SORTS,
  STUDENT_DIRECTORY_TERRAIN_RANKS,
  defaultStudentDirectoryFilterState,
  getStudentDirectoryFilterOptions,
  type StudentDirectoryFilterState,
} from "~/domain/student-directory";
import type { StudentDirectoryStudent } from "~/models/student-directory";

export const MAX_STUDENT_DIRECTORY_COOKIE_SIZE = 2048;
export const STUDENT_DIRECTORY_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filterValues<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const allowSet = new Set<string>(allowed);
  return [...new Set(value.filter((item): item is T => typeof item === "string" && allowSet.has(item)))];
}

function filterNumbers(value: unknown, allowed: readonly number[]): number[] {
  if (!Array.isArray(value)) return [];
  const allowSet = new Set(allowed);
  return [...new Set(value.filter((item): item is number => typeof item === "number" && allowSet.has(item)))];
}

function filterBooleans(value: unknown): boolean[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is boolean => typeof item === "boolean"))];
}

function isLegacyStudentDirectoryFilterState(value: Record<string, unknown>): boolean {
  if (Object.hasOwn(value, "classes")) return false;
  if (Object.hasOwn(value, "tacticRoles")) return true;
  return (
    value.sort === "recent" ||
    value.sort === "old" ||
    value.sort === "tier" ||
    (Array.isArray(value.roles) && value.roles.some((role) => role === "striker" || role === "special"))
  );
}

function migrateLegacyStudentDirectoryFilterState(value: Record<string, unknown>): Record<string, unknown> {
  if (!isLegacyStudentDirectoryFilterState(value)) return value;

  const sort =
    value.sort === "old"
      ? { sort: "release", direction: "asc" }
      : value.sort === "name"
        ? { sort: "name", direction: "asc" }
        : value.sort === "tier"
          ? { sort: "initialTier", direction: "desc" }
          : { sort: "release", direction: "desc" };

  return {
    ...value,
    classes: value.roles,
    roles: value.tacticRoles,
    ...sort,
  };
}

export function normalizeStudentDirectoryFilterState(
  value: unknown,
  students: StudentDirectoryStudent[],
): StudentDirectoryFilterState {
  if (!isRecord(value)) return { ...defaultStudentDirectoryFilterState };
  const migratedValue = migrateLegacyStudentDirectoryFilterState(value);
  const options = getStudentDirectoryFilterOptions(students);
  const terrain = isRecord(migratedValue.terrain) ? migratedValue.terrain : {};
  const equipmentSlots = Array.isArray(migratedValue.equipmentSlots) ? migratedValue.equipmentSlots : [];
  return {
    ...defaultStudentDirectoryFilterState,
    attackTypes: filterValues(migratedValue.attackTypes, STUDENT_DIRECTORY_ATTACK_TYPES),
    defenseTypes: filterValues(migratedValue.defenseTypes, STUDENT_DIRECTORY_DEFENSE_TYPES),
    classes: filterValues(migratedValue.classes, STUDENT_DIRECTORY_CLASSES),
    roles: filterValues(migratedValue.roles, STUDENT_DIRECTORY_ROLES),
    recruitment: filterValues(migratedValue.recruitment, ["recruited", "unrecruited"] as const),
    schools: filterValues(migratedValue.schools, options.schools.map(({ value: school }) => school)),
    clubUids: filterValues(migratedValue.clubUids, options.clubUids),
    unaffiliatedClub: migratedValue.unaffiliatedClub === true,
    positions: filterValues(migratedValue.positions, STUDENT_DIRECTORY_POSITIONS),
    terrain: {
      street: filterValues(terrain.street, STUDENT_DIRECTORY_TERRAIN_RANKS),
      outdoor: filterValues(terrain.outdoor, STUDENT_DIRECTORY_TERRAIN_RANKS),
      indoor: filterValues(terrain.indoor, STUDENT_DIRECTORY_TERRAIN_RANKS),
    },
    weaponTypes: filterValues(migratedValue.weaponTypes, options.weaponTypes.map(({ value: weaponType }) => weaponType)),
    cover: filterBooleans(migratedValue.cover),
    skillEffects: filterValues(migratedValue.skillEffects, STUDENT_DIRECTORY_SKILL_EFFECTS),
    acquisitionTypes: filterValues(migratedValue.acquisitionTypes, STUDENT_DIRECTORY_ACQUISITION_TYPES),
    initialTiers: filterNumbers(migratedValue.initialTiers, STUDENT_DIRECTORY_INITIAL_TIERS),
    equipmentSlots: [0, 1, 2].map((slot) =>
      filterValues(equipmentSlots[slot], options.equipmentSlots[slot].map(({ value: equipment }) => equipment)),
    ) as StudentDirectoryFilterState["equipmentSlots"],
    sort: STUDENT_DIRECTORY_SORTS.includes(migratedValue.sort as (typeof STUDENT_DIRECTORY_SORTS)[number])
      ? (migratedValue.sort as StudentDirectoryFilterState["sort"])
      : defaultStudentDirectoryFilterState.sort,
    direction: migratedValue.direction === "asc" || migratedValue.direction === "desc" ? migratedValue.direction : "desc",
    displayBy: STUDENT_DIRECTORY_DISPLAY_OPTIONS.includes(migratedValue.displayBy as (typeof STUDENT_DIRECTORY_DISPLAY_OPTIONS)[number])
      ? (migratedValue.displayBy as StudentDirectoryFilterState["displayBy"])
      : "none",
    groupBy: STUDENT_DIRECTORY_GROUP_OPTIONS.includes(migratedValue.groupBy as (typeof STUDENT_DIRECTORY_GROUP_OPTIONS)[number])
      ? (migratedValue.groupBy as StudentDirectoryFilterState["groupBy"])
      : "none",
    search: "",
  };
}

export function readStudentDirectoryFilterStateFromCookie(
  cookieHeader: string | null,
  cookieName: string,
  students: StudentDirectoryStudent[],
): StudentDirectoryFilterState {
  const encoded = cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!encoded || encoded.length > MAX_STUDENT_DIRECTORY_COOKIE_SIZE) return { ...defaultStudentDirectoryFilterState };
  try {
    return normalizeStudentDirectoryFilterState(JSON.parse(decodeURIComponent(encoded)), students);
  } catch {
    return { ...defaultStudentDirectoryFilterState };
  }
}

export function serializeStudentDirectoryFilterStateCookie(
  state: StudentDirectoryFilterState,
  students: StudentDirectoryStudent[],
): string | null {
  try {
    const { search: _search, ...persisted } = normalizeStudentDirectoryFilterState(state, students);
    const serialized = encodeURIComponent(JSON.stringify(persisted));
    return serialized.length <= MAX_STUDENT_DIRECTORY_COOKIE_SIZE ? serialized : null;
  } catch {
    return null;
  }
}

export function writeStudentDirectoryFilterStateCookie(
  cookieName: string,
  state: StudentDirectoryFilterState,
  students: StudentDirectoryStudent[],
): void {
  if (typeof document === "undefined") return;
  const serialized = serializeStudentDirectoryFilterStateCookie(state, students);
  if (!serialized) return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  try {
    document.cookie = `${cookieName}=${serialized}; Path=/; Max-Age=${STUDENT_DIRECTORY_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    // Keep the directory usable when browser cookies are unavailable.
  }
}
