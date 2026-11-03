import hangul from "hangul-js";
import { Attack, Defense } from "~/graphql/graphql";
import { formatInstant } from "~/lib/date-time";
import {
  attackTypeLocale,
  defenseTypeShortLocale,
  equipmentTypeLocale,
  equipmentTypeOrder,
  positionLocale,
  roleLocale,
  schoolShortLocale,
  tacticRoleLocale,
} from "~/locales/ko";
import type { Position, TacticRole } from "~/models/content.d";
import type { StudentDirectoryStudent } from "~/models/student-directory";
import type { Role } from "~/models/student";

export const STUDENT_DIRECTORY_SORTS = [
  "release",
  "name",
  "initialTier",
  "street",
  "outdoor",
  "indoor",
  "school",
  "club",
  "myTier",
  "myLevel",
  "myBond",
] as const;
export type StudentDirectorySort = (typeof STUDENT_DIRECTORY_SORTS)[number];
export type StudentDirectorySortDirection = "asc" | "desc";
export type StudentDirectoryGroupBy = "none" | "school" | "attackType" | "defenseType" | "role" | "position";
export type StudentDirectoryDisplayField =
  | "none"
  | "sortValue"
  | "school"
  | "attackType"
  | "defenseType"
  | "role"
  | "tacticRole"
  | "position"
  | "equipment1"
  | "equipment2"
  | "equipment3"
  | "initialTier"
  | "age"
  | "schoolYear"
  | "height"
  | "street"
  | "outdoor"
  | "indoor";

export const STUDENT_DIRECTORY_SCHOOLS = [
  "abydos",
  "gehenna",
  "millennium",
  "trinity",
  "hyakkiyako",
  "shanhaijing",
  "redwinter",
  "valkyrie",
  "srt",
  "arius",
  "highlander",
  "wildhunt",
  "odyssey",
  "schale",
  "others",
] as const;
export const STUDENT_DIRECTORY_SKILL_EFFECTS = [
  "debuff",
  "crowd_control",
  "heal",
  "shield",
  "cleanse",
  "knockback",
  "self_reposition",
  "summon",
  "obstacle",
] as const;
export const STUDENT_DIRECTORY_ACQUISITION_TYPES = ["regular", "limited", "festival", "event_reward", "archive"] as const;
export const STUDENT_DIRECTORY_WEAPON_TYPES = ["sg", "smg", "ar", "gl", "hg", "rl", "sr", "mg", "rg", "mt", "ft"] as const;
export const STUDENT_DIRECTORY_TERRAIN_RANKS = ["SS", "S", "A", "B", "C", "D"] as const;
export const STUDENT_DIRECTORY_INITIAL_TIERS = [1, 2, 3] as const;

export type StudentDirectoryFilterState = {
  attackTypes: Attack[];
  defenseTypes: Defense[];
  classes: Role[];
  roles: TacticRole[];
  recruitment: ("recruited" | "unrecruited")[];
  schools: string[];
  clubUids: string[];
  unaffiliatedClub: boolean;
  positions: Position[];
  terrain: {
    street: string[];
    outdoor: string[];
    indoor: string[];
  };
  weaponTypes: string[];
  cover: boolean[];
  skillEffects: string[];
  acquisitionTypes: string[];
  initialTiers: number[];
  equipmentSlots: [string[], string[], string[]];
  sort: StudentDirectorySort;
  direction: StudentDirectorySortDirection;
  displayBy: StudentDirectoryDisplayField;
  groupBy: StudentDirectoryGroupBy;
  search: string;
};

export type StudentDirectoryPersonalRecord = {
  status: "unknown" | "unrecruited" | "recruited";
  tier: number | null;
  level: number | null;
  bondLevel: number | null;
};
export type StudentDirectoryPersonalState =
  | { status: "signed-out" }
  | { status: "failed" }
  | { status: "loaded"; byPrimaryUid: Record<string, StudentDirectoryPersonalRecord> };

export const defaultStudentDirectoryFilterState: StudentDirectoryFilterState = {
  attackTypes: [],
  defenseTypes: [],
  classes: [],
  roles: [],
  recruitment: [],
  schools: [],
  clubUids: [],
  unaffiliatedClub: false,
  positions: [],
  terrain: { street: [], outdoor: [], indoor: [] },
  weaponTypes: [],
  cover: [],
  skillEffects: [],
  acquisitionTypes: [],
  initialTiers: [],
  equipmentSlots: [[], [], []],
  sort: "release",
  direction: "desc",
  displayBy: "none",
  groupBy: "none",
  search: "",
};

export const studentDirectoryDisplayOptions: { value: StudentDirectoryDisplayField; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "sortValue", label: "정렬 값" },
  { value: "school", label: "학교" },
  { value: "attackType", label: "공격 타입" },
  { value: "defenseType", label: "방어 타입" },
  { value: "role", label: "클래스" },
  { value: "tacticRole", label: "역할" },
  { value: "position", label: "포지션" },
  { value: "equipment1", label: "장비 1" },
  { value: "equipment2", label: "장비 2" },
  { value: "equipment3", label: "장비 3" },
  { value: "initialTier", label: "초기 성급" },
  { value: "age", label: "나이" },
  { value: "schoolYear", label: "학년" },
  { value: "height", label: "키" },
  { value: "street", label: "시가지 적성" },
  { value: "outdoor", label: "야외 적성" },
  { value: "indoor", label: "실내 적성" },
];
export const STUDENT_DIRECTORY_DISPLAY_OPTIONS = studentDirectoryDisplayOptions.map(({ value }) => value);
export const studentDirectoryGroupOptions: { value: StudentDirectoryGroupBy; label: string }[] = [
  { value: "none", label: "그룹 없음" },
  { value: "school", label: "학교" },
  { value: "attackType", label: "공격 타입" },
  { value: "defenseType", label: "방어 타입" },
  { value: "role", label: "클래스" },
  { value: "position", label: "포지션" },
];
export const STUDENT_DIRECTORY_GROUP_OPTIONS = studentDirectoryGroupOptions.map(({ value }) => value);

export const STUDENT_DIRECTORY_ATTACK_TYPES = [Attack.Explosive, Attack.Piercing, Attack.Mystic, Attack.Sonic, Attack.Chemical] as const;
export const STUDENT_DIRECTORY_DEFENSE_TYPES = [Defense.Light, Defense.Heavy, Defense.Special, Defense.Elastic, Defense.Composite] as const;
export const STUDENT_DIRECTORY_CLASSES: Role[] = ["striker", "special"];
export const STUDENT_DIRECTORY_ROLES: TacticRole[] = ["attacker", "tank", "healer", "support", "tactical_support"];
export const STUDENT_DIRECTORY_POSITIONS: Position[] = ["front", "middle", "back"];
const allAttackTypes = [...STUDENT_DIRECTORY_ATTACK_TYPES, Attack.Normal];
const allDefenseTypes = [...STUDENT_DIRECTORY_DEFENSE_TYPES, Defense.Normal];
const skillEffectLabels: Record<(typeof STUDENT_DIRECTORY_SKILL_EFFECTS)[number], string> = {
  debuff: "디버프",
  crowd_control: "군중 제어",
  heal: "회복",
  shield: "보호막",
  cleanse: "정화",
  knockback: "넉백",
  self_reposition: "위치 이동",
  summon: "소환",
  obstacle: "장애물",
};
const acquisitionLabels: Record<(typeof STUDENT_DIRECTORY_ACQUISITION_TYPES)[number], string> = {
  regular: "통상",
  limited: "한정",
  festival: "페스",
  event_reward: "배포",
  archive: "아카이브",
};
const weaponLabels: Record<(typeof STUDENT_DIRECTORY_WEAPON_TYPES)[number], string> = {
  sg: "SG",
  smg: "SMG",
  ar: "AR",
  gl: "GL",
  hg: "HG",
  rl: "RL",
  sr: "SR",
  mg: "MG",
  rg: "RG",
  mt: "MT",
  ft: "FT",
};
const schoolOrder = new Map(STUDENT_DIRECTORY_SCHOOLS.map((school, index) => [school, index]));
const attackOrder = new Map(allAttackTypes.map((value, index) => [value, index]));
const defenseOrder = new Map(allDefenseTypes.map((value, index) => [value, index]));
const roleOrder = new Map(STUDENT_DIRECTORY_CLASSES.map((value, index) => [value, index]));
const positionOrder = new Map(STUDENT_DIRECTORY_POSITIONS.map((value, index) => [value, index]));
const rankOrder = new Map(STUDENT_DIRECTORY_TERRAIN_RANKS.map((value, index) => [value, STUDENT_DIRECTORY_TERRAIN_RANKS.length - index]));

export function getStudentDirectoryFilterOptions(students: StudentDirectoryStudent[]) {
  const schoolValues = new Set(students.map(({ school }) => school).filter(isKnownSchool));
  const schools = STUDENT_DIRECTORY_SCHOOLS.filter((school) => schoolValues.has(school)).map((value) => ({
    value,
    label: schoolShortLocale[value],
  }));
  const knownSchools = new Set(schools.map(({ value }) => value));
  const clubs = new Map<string, { school: string; uid: string; name: string }>();
  for (const student of students) {
    if (student.club?.uid && student.club.name && isKnownSchool(student.school) && knownSchools.has(student.school)) {
      clubs.set(student.club.uid, { school: student.school, uid: student.club.uid, name: student.club.name });
    }
  }
  const clubGroups = [...clubs.values()]
    .sort((a, b) => schoolIndex(a.school) - schoolIndex(b.school) || a.name.localeCompare(b.name, "ko"))
    .reduce<{ school: string; label: string; clubs: { uid: string; label: string }[] }[]>((groups, club) => {
      const previous = groups.at(-1);
      if (previous?.school === club.school) {
        previous.clubs.push({ uid: club.uid, label: club.name });
      } else {
        groups.push({ school: club.school, label: schoolShortLocale[club.school], clubs: [{ uid: club.uid, label: club.name }] });
      }
      return groups;
    }, []);
  const weaponValues = new Set(students.map(({ weaponType }) => weaponType).filter(isKnownWeaponType));
  const equipmentSlots = [0, 1, 2].map((slot) => {
    const values = new Set(students.map(({ equipments }) => equipments[slot]).filter((value) => Boolean(equipmentTypeLocale[value])));
    return equipmentTypeOrder
      .filter((value) => values.has(value))
      .map((value) => ({ value, label: equipmentTypeLocale[value] }));
  }) as [{ value: string; label: string }[], { value: string; label: string }[], { value: string; label: string }[]];
  return {
    schools,
    clubGroups,
    clubUids: [...clubs.keys()],
    weaponTypes: STUDENT_DIRECTORY_WEAPON_TYPES.filter((value) => weaponValues.has(value)).map((value) => ({
      value,
      label: weaponLabels[value],
    })),
    equipmentSlots,
  };
}

export function getStudentDirectoryVisibleState(
  state: StudentDirectoryFilterState,
  personalStatus: StudentDirectoryPersonalState["status"],
): StudentDirectoryFilterState {
  if (personalStatus === "loaded") return state;
  const hasPersonalSort = state.sort.startsWith("my");
  return {
    ...state,
    recruitment: [],
    sort: hasPersonalSort ? "release" : state.sort,
    direction: hasPersonalSort ? "desc" : state.direction,
  };
}

export function clearStudentDirectoryFilters(state: StudentDirectoryFilterState): StudentDirectoryFilterState {
  return {
    ...defaultStudentDirectoryFilterState,
    sort: state.sort,
    direction: state.direction,
    displayBy: state.displayBy,
    groupBy: state.groupBy,
  };
}

export function hasStudentDirectoryFilters(state: StudentDirectoryFilterState): boolean {
  return Boolean(
    state.search ||
      state.attackTypes.length ||
      state.defenseTypes.length ||
      state.classes.length ||
      state.roles.length ||
      state.recruitment.length ||
      state.schools.length ||
      state.clubUids.length ||
      state.unaffiliatedClub ||
      state.positions.length ||
      Object.values(state.terrain).some((ranks) => ranks.length) ||
      state.weaponTypes.length ||
      state.cover.length ||
      state.skillEffects.length ||
      state.acquisitionTypes.length ||
      state.initialTiers.length ||
      state.equipmentSlots.some((slot) => slot.length),
  );
}

export function countStudentDirectoryFilterGroup(
  group: keyof Pick<
    StudentDirectoryFilterState,
    "schools" | "clubUids" | "positions" | "weaponTypes" | "cover" | "skillEffects" | "acquisitionTypes" | "initialTiers"
  > | "terrain" | "equipmentSlots",
  state: StudentDirectoryFilterState,
): number {
  if (group === "clubUids") return state.clubUids.length + Number(state.unaffiliatedClub);
  if (group === "terrain") return Object.values(state.terrain).reduce((sum, ranks) => sum + ranks.length, 0);
  if (group === "equipmentSlots") return state.equipmentSlots.reduce((sum, slot) => sum + slot.length, 0);
  return state[group].length;
}

export function filterAndSortStudentDirectory(
  students: StudentDirectoryStudent[],
  state: StudentDirectoryFilterState,
  personal: StudentDirectoryPersonalState,
): StudentDirectoryStudent[] {
  const normalizedSearch = state.search.trim();
  const filtered = students.filter((student) => {
    if (state.attackTypes.length && !state.attackTypes.includes(student.attackType)) return false;
    if (state.defenseTypes.length && !state.defenseTypes.includes(student.defenseType)) return false;
    if (state.classes.length && !state.classes.includes(student.role)) return false;
    if (state.roles.length && !state.roles.includes(student.tacticRole)) return false;
    if (state.schools.length && (!isKnownSchool(student.school) || !state.schools.includes(student.school))) return false;
    if (state.positions.length && !state.positions.includes(student.position)) return false;
    if (state.clubUids.length || state.unaffiliatedClub) {
      const club = student.club;
      const hasKnownClub = Boolean(club?.uid && club.name);
      if (!(hasKnownClub && state.clubUids.includes(club?.uid ?? "")) && !(club === null && state.unaffiliatedClub)) {
        return false;
      }
    }
    if (state.terrain.street.length && !state.terrain.street.includes(student.catalog?.terrainAdaptations.street ?? "")) return false;
    if (state.terrain.outdoor.length && !state.terrain.outdoor.includes(student.catalog?.terrainAdaptations.outdoor ?? "")) return false;
    if (state.terrain.indoor.length && !state.terrain.indoor.includes(student.catalog?.terrainAdaptations.indoor ?? "")) return false;
    if (state.weaponTypes.length && !state.weaponTypes.includes(student.weaponType ?? "")) return false;
    if (state.cover.length && (student.canUseCover === null || !state.cover.includes(student.canUseCover))) return false;
    if (
      state.skillEffects.length &&
      !(student.skillEffectTags ?? []).some((effect) => state.skillEffects.includes(effect))
    ) {
      return false;
    }
    if (state.acquisitionTypes.length && !state.acquisitionTypes.includes(student.acquisitionType ?? "")) return false;
    if (state.initialTiers.length && !state.initialTiers.includes(student.initialTier)) return false;
    if (state.equipmentSlots.some((slot, index) => slot.length && !slot.includes(student.equipments[index] ?? ""))) return false;
    if (state.recruitment.length) {
      if (personal.status !== "loaded") return false;
      const status = getStudentPersonalRecord(student, personal).status;
      const key = status === "recruited" ? "recruited" : status === "unrecruited" ? "unrecruited" : null;
      if (!key || !state.recruitment.includes(key)) return false;
    }
    if (
      normalizedSearch &&
      ![student.name, student.familyName ?? "", ...student.altNames].some((name) => hangul.search(name, normalizedSearch) >= 0)
    ) {
      return false;
    }
    return true;
  });
  return filtered.sort((a, b) => compareStudentDirectoryStudents(a, b, state.sort, state.direction, personal));
}

export function getStudentPersonalRecord(
  student: StudentDirectoryStudent,
  personal: StudentDirectoryPersonalState,
): StudentDirectoryPersonalRecord {
  const primaryUid = student.studentVariant?.primaryStudent.uid;
  if (personal.status !== "loaded" || !primaryUid) {
    return { status: "unknown", tier: null, level: null, bondLevel: null };
  }
  return personal.byPrimaryUid[primaryUid] ?? { status: "unrecruited", tier: null, level: null, bondLevel: null };
}

export function compareStudentDirectoryStudents(
  a: StudentDirectoryStudent,
  b: StudentDirectoryStudent,
  sort: StudentDirectorySort,
  direction: StudentDirectorySortDirection,
  personal: StudentDirectoryPersonalState,
): number {
  const primary = comparePrimarySortValues(a, b, sort, direction, personal);
  if (primary !== 0) return primary;
  return b.order - a.order || a.name.localeCompare(b.name, "ko") || a.uid.localeCompare(b.uid);
}

function comparePrimarySortValues(
  a: StudentDirectoryStudent,
  b: StudentDirectoryStudent,
  sort: StudentDirectorySort,
  direction: StudentDirectorySortDirection,
  personal: StudentDirectoryPersonalState,
): number {
  const sign = direction === "desc" ? -1 : 1;
  if (sort === "myTier" || sort === "myLevel" || sort === "myBond") {
    const left = getStudentPersonalRecord(a, personal);
    const right = getStudentPersonalRecord(b, personal);
    const leftGroup = personalSortGroup(left, sort);
    const rightGroup = personalSortGroup(right, sort);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    if (leftGroup !== 0) return 0;
    const leftValue = personalSortValue(left, sort) ?? 0;
    const rightValue = personalSortValue(right, sort) ?? 0;
    return sign * (leftValue - rightValue);
  }

  const left = publicSortValue(a, sort);
  const right = publicSortValue(b, sort);
  if (left === null || right === null) {
    return left === null ? (right === null ? 0 : 1) : -1;
  }
  if (typeof left === "number" && typeof right === "number") return sign * (left - right);
  return sign * String(left).localeCompare(String(right), "ko");
}

function personalSortGroup(record: StudentDirectoryPersonalRecord, sort: "myTier" | "myLevel" | "myBond"): number {
  if (record.status === "unknown") return 3;
  if (record.status === "unrecruited") return 2;
  return personalSortValue(record, sort) === null ? 1 : 0;
}

function personalSortValue(record: StudentDirectoryPersonalRecord, sort: "myTier" | "myLevel" | "myBond"): number | null {
  if (sort === "myTier") return record.tier;
  if (sort === "myLevel") return record.level;
  return record.bondLevel;
}

function publicSortValue(student: StudentDirectoryStudent, sort: Exclude<StudentDirectorySort, "myTier" | "myLevel" | "myBond">): number | string | null {
  // 최신순 and 과거순 follow `order`, not `releaseAt`.
  if (sort === "release") return student.order;
  if (sort === "name") return student.name.trim() || null;
  if (sort === "initialTier") return student.initialTier > 0 ? student.initialTier : null;
  if (sort === "street" || sort === "outdoor" || sort === "indoor") {
    const rank = student.catalog?.terrainAdaptations[sort];
    if (rank === undefined) return null;
    return rankOrder.get(rank) ?? null;
  }
  if (sort === "school") return isKnownSchool(student.school) ? schoolShortLocale[student.school] : null;
  if (student.club === null) return "없음";
  return student.club.uid && student.club.name ? student.club.name : null;
}

function dateTime(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function groupStudentDirectoryStudents(
  students: StudentDirectoryStudent[],
  groupBy: StudentDirectoryGroupBy,
): { key: string; label: string | null; students: StudentDirectoryStudent[] }[] {
  if (groupBy === "none") return students.length ? [{ key: "all", label: null, students }] : [];
  const groups = new Map<string, StudentDirectoryStudent[]>();
  for (const student of students) {
    const value = groupValue(student, groupBy);
    const key = value ?? "__unknown__";
    groups.set(key, [...(groups.get(key) ?? []), student]);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, label: key === "__unknown__" ? "알 수 없음" : groupLabel(key, groupBy), students: items }))
    .sort((a, b) => compareGroupKeys(a.key, b.key, groupBy));
}

function groupValue(student: StudentDirectoryStudent, groupBy: Exclude<StudentDirectoryGroupBy, "none">): string | null {
  if (groupBy === "school") return isKnownSchool(student.school) ? student.school : null;
  if (groupBy === "attackType") return attackTypeLocale[student.attackType] ? student.attackType : null;
  if (groupBy === "defenseType") return defenseTypeShortLocale[student.defenseType] ? student.defenseType : null;
  if (groupBy === "role") return roleLocale[student.role] ? student.role : null;
  return positionLocale[student.position] ? student.position : null;
}

function groupLabel(key: string, groupBy: Exclude<StudentDirectoryGroupBy, "none">): string {
  if (groupBy === "school") return schoolShortLocale[key] ?? "알 수 없음";
  if (groupBy === "attackType") return attackTypeLocale[key as Attack] ?? "알 수 없음";
  if (groupBy === "defenseType") return defenseTypeShortLocale[key as Defense] ?? "알 수 없음";
  if (groupBy === "role") return roleLocale[key as Role] ?? "알 수 없음";
  return positionLocale[key as Position] ?? "알 수 없음";
}

function compareGroupKeys(a: string, b: string, groupBy: Exclude<StudentDirectoryGroupBy, "none">): number {
  if (a === "__unknown__") return b === "__unknown__" ? 0 : 1;
  if (b === "__unknown__") return -1;
  const order = groupBy === "school" ? schoolOrder : groupBy === "attackType" ? attackOrder : groupBy === "defenseType" ? defenseOrder : groupBy === "role" ? roleOrder : positionOrder;
  return (order.get(a as never) ?? Number.MAX_SAFE_INTEGER) - (order.get(b as never) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b);
}

export type StudentDirectoryLabel = {
  kind: "text" | "initialTier" | "personalTier" | "terrain" | "attackType" | "defenseType" | "class";
  value: string;
  narrowValue?: string;
  ariaLabel: string;
};

export function getStudentDirectoryLabel(
  student: StudentDirectoryStudent,
  displayBy: StudentDirectoryDisplayField,
  sort: StudentDirectorySort,
  personal: StudentDirectoryPersonalState,
  timeZone?: string | null,
): StudentDirectoryLabel | null {
  if (displayBy === "none") return null;
  if (displayBy === "sortValue") {
    if (sort === "name") return null;
    if (sort === "release") {
      const date = formatStudentReleaseDate(student.releaseAt, timeZone);
      if (!date) return { kind: "text", value: "알 수 없음", ariaLabel: "알 수 없음" };
      if (!student.released) {
        return { kind: "text", value: "예정", narrowValue: "예정", ariaLabel: `${date} 출시 예정` };
      }
      return {
        kind: "text",
        value: date,
        narrowValue: formatStudentReleaseDate(student.releaseAt, timeZone, "YY/MM/DD") ?? date,
        ariaLabel: date,
      };
    }
    if (sort === "myTier" || sort === "myLevel" || sort === "myBond") {
      return getPersonalLabel(student, sort, personal);
    }
    if (sort === "initialTier") return initialTierLabel(student.initialTier);
    if (sort === "street" || sort === "outdoor" || sort === "indoor") return terrainLabel(student, sort);
    if (sort === "school") return textLabel(isKnownSchool(student.school) ? schoolShortLocale[student.school] : null);
    return textLabel(student.club === null ? "없음" : student.club?.name ?? null);
  }

  if (displayBy === "school") return textLabel(isKnownSchool(student.school) ? schoolShortLocale[student.school] : null);
  if (displayBy === "attackType") return attributeLabel(student.attackType, "attackType");
  if (displayBy === "defenseType") return attributeLabel(student.defenseType, "defenseType");
  if (displayBy === "role") return attributeLabel(student.role, "class");
  if (displayBy === "tacticRole") return textLabel(tacticRoleLocale[student.tacticRole] ?? null);
  if (displayBy === "position") return textLabel(positionLocale[student.position] ?? null);
  if (displayBy === "equipment1" || displayBy === "equipment2" || displayBy === "equipment3") {
    const index = Number(displayBy.slice(-1)) - 1;
    return textLabel(equipmentTypeLocale[student.equipments[index] ?? ""] ?? null);
  }
  if (displayBy === "initialTier") return initialTierLabel(student.initialTier);
  if (displayBy === "age" || displayBy === "schoolYear" || displayBy === "height") {
    return textLabel(student.catalog?.profile[displayBy] || null);
  }
  return terrainLabel(student, displayBy);
}

function getPersonalLabel(
  student: StudentDirectoryStudent,
  sort: "myTier" | "myLevel" | "myBond",
  personal: StudentDirectoryPersonalState,
): StudentDirectoryLabel {
  const record = getStudentPersonalRecord(student, personal);
  if (record.status === "unknown") return textLabel("알 수 없음");
  if (record.status === "unrecruited") return textLabel("미모집");
  if (sort === "myTier") {
    if (record.tier === null) return textLabel("미입력");
    const stage = record.tier - 5;
    return record.tier > 5
      ? { kind: "personalTier", value: String(stage), ariaLabel: `고유무기 ${stage}성` }
      : { kind: "personalTier", value: String(record.tier), ariaLabel: `내 등급 ${record.tier}성` };
  }
  if (sort === "myLevel") return record.level === null ? textLabel("미입력") : textLabel(`Lv.${record.level}`);
  return record.bondLevel === null ? textLabel("미입력") : textLabel(String(record.bondLevel));
}

function initialTierLabel(tier: number): StudentDirectoryLabel {
  if (tier <= 0) return textLabel("알 수 없음");
  return { kind: "initialTier", value: String(tier), ariaLabel: `초기 성급 ${tier}성` };
}

function terrainLabel(student: StudentDirectoryStudent, field: "street" | "outdoor" | "indoor"): StudentDirectoryLabel {
  const area = field === "street" ? "시가지" : field === "outdoor" ? "야외" : "실내";
  const rank = student.catalog?.terrainAdaptations[field];
  if (rank === undefined) return { kind: "text", value: "알 수 없음", ariaLabel: `${area} 적성 알 수 없음` };
  return { kind: "terrain", value: rank, ariaLabel: `${area} 적성 ${rank}` };
}

function attributeLabel(value: string, kind: "attackType" | "defenseType" | "class"): StudentDirectoryLabel {
  const label = kind === "attackType" ? attackTypeLocale[value as Attack] : kind === "defenseType" ? defenseTypeShortLocale[value as Defense] : roleLocale[value as Role];
  return label ? { kind, value: label, ariaLabel: label } : textLabel("알 수 없음");
}

function textLabel(value: string | null): StudentDirectoryLabel {
  const label = value || "알 수 없음";
  return { kind: "text", value: label, ariaLabel: label };
}

export function formatStudentReleaseDate(
  releaseAt: string | null,
  timeZone?: string | null,
  format: "YYYY/MM/DD" | "YY/MM/DD" = "YYYY/MM/DD",
): string | null {
  if (dateTime(releaseAt) === null || releaseAt === null) return null;
  return formatInstant(releaseAt, { timeZone, format });
}

export function getStudentDirectorySortLabel(sort: StudentDirectorySort, direction: StudentDirectorySortDirection): string {
  if (sort === "release") return direction === "desc" ? "최신순" : "과거순";
  if (sort === "name" || sort === "school" || sort === "club") return direction === "desc" ? "역순" : "가나다순";
  return direction === "desc" ? "높은 순" : "낮은 순";
}

export function getStudentDirectorySortTitle(sort: StudentDirectorySort): string {
  const labels: Record<StudentDirectorySort, string> = {
    release: "출시",
    name: "이름",
    initialTier: "초기 성급",
    street: "시가지 적성",
    outdoor: "야외 적성",
    indoor: "실내 적성",
    school: "학교",
    club: "동아리",
    myTier: "내 등급",
    myLevel: "내 레벨",
    myBond: "내 인연 랭크",
  };
  return labels[sort];
}

export function defaultStudentDirectorySortDirection(sort: StudentDirectorySort): StudentDirectorySortDirection {
  return sort === "name" || sort === "school" || sort === "club" ? "asc" : "desc";
}

type StudentDirectoryAppliedFilter = {
  key: string;
  label: string;
  ariaLabel?: string;
  terrainRank?: (typeof STUDENT_DIRECTORY_TERRAIN_RANKS)[number];
  // A star tier chip, shown as a star icon and the number.
  tier?: number;
  remove: (state: StudentDirectoryFilterState) => StudentDirectoryFilterState;
};

export function getStudentDirectoryAppliedFilters(
  students: StudentDirectoryStudent[],
  state: StudentDirectoryFilterState,
): StudentDirectoryAppliedFilter[] {
  const options = getStudentDirectoryFilterOptions(students);
  const chips: StudentDirectoryAppliedFilter[] = [];
  const addValues = <T extends string>(key: string, selected: T[], labels: object, field: keyof StudentDirectoryFilterState) => {
    for (const value of selected) {
      const label = (labels as Record<string, string>)[value];
      if (!label) continue;
      chips.push({
        key: `${key}:${value}`,
        label,
        remove: (current) => ({ ...current, [field]: (current[field] as T[]).filter((item) => item !== value) }),
      });
    }
  };
  addValues("attack", state.attackTypes, attackTypeLocale, "attackTypes");
  addValues("defense", state.defenseTypes, defenseTypeShortLocale, "defenseTypes");
  addValues("class", state.classes, roleLocale, "classes");
  addValues("role", state.roles, tacticRoleLocale, "roles");
  addValues("position", state.positions, positionLocale, "positions");
  addValues("school", state.schools, Object.fromEntries(options.schools.map(({ value, label }) => [value, label])), "schools");
  addValues("weapon", state.weaponTypes, weaponLabels, "weaponTypes");
  addValues("skill", state.skillEffects, skillEffectLabels, "skillEffects");
  addValues("acquisition", state.acquisitionTypes, acquisitionLabels, "acquisitionTypes");
  for (const value of state.initialTiers) {
    chips.push({ key: `tier:${value}`, label: `${value}성`, ariaLabel: `초기 성급 ${value}성`, tier: value, remove: (current) => ({ ...current, initialTiers: current.initialTiers.filter((tier) => tier !== value) }) });
  }
  for (const value of state.recruitment) {
    chips.push({ key: `recruitment:${value}`, label: value === "recruited" ? "모집함" : "미모집", remove: (current) => ({ ...current, recruitment: current.recruitment.filter((item) => item !== value) }) });
  }
  for (const value of state.clubUids) {
    const club = options.clubGroups.flatMap(({ school, clubs }) => clubs.map((item) => ({ ...item, school }))).find((item) => item.uid === value);
    if (!club) continue;
    const sameNameAcrossSchools = options.clubGroups.some(({ school, clubs }) => school !== club.school && clubs.some((item) => item.label === club.label));
    chips.push({
      key: `club:${value}`,
      label: `${sameNameAcrossSchools ? `${schoolShortLocale[club.school]} ` : ""}${club.label}`,
      remove: (current) => ({ ...current, clubUids: current.clubUids.filter((uid) => uid !== value) }),
    });
  }
  if (state.unaffiliatedClub) chips.push({ key: "club:none", label: "없음", remove: (current) => ({ ...current, unaffiliatedClub: false }) });
  for (const field of ["street", "outdoor", "indoor"] as const) {
    const title = field === "street" ? "시가지" : field === "outdoor" ? "야외" : "실내";
    for (const rank of state.terrain[field]) {
      if (!isStudentDirectoryTerrainRank(rank)) continue;
      chips.push({
        key: `terrain:${field}:${rank}`,
        label: title,
        ariaLabel: `${title} 적성 ${rank}`,
        terrainRank: rank,
        remove: (current) => ({ ...current, terrain: { ...current.terrain, [field]: current.terrain[field].filter((value) => value !== rank) } }),
      });
    }
  }
  for (const cover of state.cover) {
    chips.push({ key: `cover:${cover}`, label: cover ? "엄폐 가능" : "엄폐 불가", remove: (current) => ({ ...current, cover: current.cover.filter((value) => value !== cover) }) });
  }
  for (const [slotIndex, selected] of state.equipmentSlots.entries()) {
    for (const value of selected) {
      const label = equipmentTypeLocale[value] ?? "알 수 없음";
      chips.push({ key: `equipment:${slotIndex}:${value}`, label: `장비${slotIndex + 1} ${label}`, remove: (current) => ({ ...current, equipmentSlots: current.equipmentSlots.map((slot, index) => index === slotIndex ? slot.filter((item) => item !== value) : slot) as StudentDirectoryFilterState["equipmentSlots"] }) });
    }
  }
  return chips;
}

function isKnownSchool(value: string): value is (typeof STUDENT_DIRECTORY_SCHOOLS)[number] {
  return schoolOrder.has(value as (typeof STUDENT_DIRECTORY_SCHOOLS)[number]) && Boolean(schoolShortLocale[value]);
}

function isStudentDirectoryTerrainRank(value: string): value is (typeof STUDENT_DIRECTORY_TERRAIN_RANKS)[number] {
  return STUDENT_DIRECTORY_TERRAIN_RANKS.some((rank) => rank === value);
}

function isKnownWeaponType(value: string | null): value is (typeof STUDENT_DIRECTORY_WEAPON_TYPES)[number] {
  return value !== null && (STUDENT_DIRECTORY_WEAPON_TYPES as readonly string[]).includes(value);
}

function schoolIndex(value: string): number {
  return schoolOrder.get(value as (typeof STUDENT_DIRECTORY_SCHOOLS)[number]) ?? Number.MAX_SAFE_INTEGER;
}
