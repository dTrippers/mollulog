import type { RecruitedStudent } from "./recruited-student";
import type { RelationshipLevel } from "./relationship-level";
import type { StudentGrowth } from "./student-growth";

export type StudentStateExportFormat = "schaledb" | "justin163";

export type StudentStateExportStudentCatalog = Record<string, { name?: string; order?: number }>;

export type StudentStateExportInput = {
  recruitedStudents: RecruitedStudent[];
  studentGrowths: StudentGrowth[];
  relationshipLevels: RelationshipLevel[];
  studentCatalog: StudentStateExportStudentCatalog;
};

type StudentStateExportEntry = {
  studentUid: string;
  recruitedStudent?: RecruitedStudent;
  studentGrowth?: StudentGrowth;
  relationshipLevel?: RelationshipLevel;
};

type SplitTier = {
  star: number;
  uniqueWeapon: number;
};

const justin163Wrapper = {
  exportVersion: 2,
  language: "Kr",
  level_cap: 90,
  server: "Global",
  site_version: "1.4.21",
} as const;

export function serializeStudentStateExport(input: StudentStateExportInput, format: StudentStateExportFormat): string {
  if (format === "schaledb") {
    return serializeSchaleDbExport(input);
  }

  return serializeJustin163Export(input);
}

export function serializeSchaleDbExport(input: StudentStateExportInput): string {
  const relationshipLevelsByStudentUid = createMap(input.relationshipLevels, (relationship) => relationship.studentId);
  const payload = Object.fromEntries(
    getSortedEntries(input)
      .filter((entry) => entry.recruitedStudent)
      .map((entry) => {
        const recruitedStudent = entry.recruitedStudent as RecruitedStudent;
        const relationshipLevel = relationshipLevelsByStudentUid[entry.studentUid];
        const { star, uniqueWeapon } = splitTier(recruitedStudent.tier);

        return [
          entry.studentUid,
          {
            s: defaultNumber(star, 1),
            ws: defaultNumber(uniqueWeapon, 0),
            l: defaultNumber(recruitedStudent.level, 1),
            wl: defaultNumber(recruitedStudent.weaponLevel, 0),
            s1: defaultNumber(recruitedStudent.skillEx, 1),
            s2: defaultNumber(recruitedStudent.skillNormal, 1),
            s3: defaultNumber(recruitedStudent.skillEnhanced, 1),
            s4: defaultNumber(recruitedStudent.skillSub, 1),
            e1: defaultNumber(recruitedStudent.equip1, 1),
            e2: defaultNumber(recruitedStudent.equip2, 1),
            e3: defaultNumber(recruitedStudent.equip3, 1),
            e4: defaultNumber(recruitedStudent.equipSpecial, 0),
            pm: defaultNumber(recruitedStudent.abilityHp, 0),
            pa: defaultNumber(recruitedStudent.abilityAtk, 0),
            ph: defaultNumber(recruitedStudent.abilityHeal, 0),
            b: defaultNumber(relationshipLevel?.currentLevel, 1),
          },
        ];
      }),
  );

  return encodeBase64Utf8(JSON.stringify(payload));
}

export function serializeJustin163Export(input: StudentStateExportInput): string {
  const payload = {
    exportVersion: justin163Wrapper.exportVersion,
    characters: getSortedEntries(input).map((entry) => toJustin163Character(input, entry)),
    language: justin163Wrapper.language,
    level_cap: justin163Wrapper.level_cap,
    server: justin163Wrapper.server,
    site_version: justin163Wrapper.site_version,
  };

  return JSON.stringify(payload, null, 2);
}

function getSortedEntries(input: StudentStateExportInput): StudentStateExportEntry[] {
  const recruitedStudentsByUid = createMap(input.recruitedStudents, (student) => student.studentUid);
  const studentGrowthsByUid = createMap(input.studentGrowths, (growth) => growth.studentUid);
  const relationshipLevelsByStudentUid = createMap(input.relationshipLevels, (relationship) => relationship.studentId);
  const studentUids = [
    ...new Set([
      ...input.recruitedStudents.map((student) => student.studentUid),
      ...input.studentGrowths.map((growth) => growth.studentUid),
      ...input.relationshipLevels.map((relationship) => relationship.studentId),
    ]),
  ];

  return studentUids
    .map((studentUid) => ({
      studentUid,
      recruitedStudent: recruitedStudentsByUid[studentUid],
      studentGrowth: studentGrowthsByUid[studentUid],
      relationshipLevel: relationshipLevelsByStudentUid[studentUid],
    }))
    .sort((left, right) => compareStudentOrder(input.studentCatalog, left.studentUid, right.studentUid));
}

function toJustin163Character(input: StudentStateExportInput, entry: StudentStateExportEntry) {
  const current = toJustin163Current(entry.recruitedStudent, entry.relationshipLevel);
  // Justin163's renderer assumes every character has a target block and reads
  // `target.book_*` unconditionally (it crashes on a missing target), so we always
  // emit one. When the student has no growth or bond goal the target mirrors current.
  const target = toJustin163Target(entry.studentGrowth, entry.relationshipLevel, current);

  return {
    id: entry.studentUid,
    name: input.studentCatalog[entry.studentUid]?.name ?? "",
    current,
    target,
    enabled: true,
  };
}

function toJustin163Current(recruitedStudent: RecruitedStudent | undefined, relationshipLevel: RelationshipLevel | undefined) {
  const { star, uniqueWeapon } = splitTier(recruitedStudent?.tier ?? 1);

  return {
    level: toExportString(recruitedStudent?.level, 1),
    ue_level: toExportString(recruitedStudent?.weaponLevel, 0),
    bond: toExportString(relationshipLevel?.currentLevel, 1),
    ex: toExportString(recruitedStudent?.skillEx, 1),
    basic: toExportString(recruitedStudent?.skillNormal, 1),
    passive: toExportString(recruitedStudent?.skillEnhanced, 1),
    sub: toExportString(recruitedStudent?.skillSub, 1),
    gear1: toExportString(recruitedStudent?.equip1, 1),
    gear2: toExportString(recruitedStudent?.equip2, 1),
    gear3: toExportString(recruitedStudent?.equip3, 1),
    bond_gear: toExportString(recruitedStudent?.equipSpecial, 0),
    book_hp: toExportString(recruitedStudent?.abilityHp, 0),
    book_atk: toExportString(recruitedStudent?.abilityAtk, 0),
    book_heal: toExportString(recruitedStudent?.abilityHeal, 0),
    star,
    ue: uniqueWeapon,
  };
}

function toJustin163Target(
  studentGrowth: StudentGrowth | undefined,
  relationshipLevel: RelationshipLevel | undefined,
  current: ReturnType<typeof toJustin163Current>,
) {
  const targetTier = studentGrowth?.targetTier ?? current.star + current.ue;
  const { star, uniqueWeapon } = splitTier(targetTier);

  return {
    level: toExportString(studentGrowth?.targetLevel, Number(current.level)),
    ue_level: toExportString(studentGrowth?.targetWeaponLevel, Number(current.ue_level)),
    bond: toExportString(relationshipLevel?.targetLevel, Number(current.bond)),
    ex: toExportString(studentGrowth?.targetSkillEx, Number(current.ex)),
    basic: toExportString(studentGrowth?.targetSkillNormal, Number(current.basic)),
    passive: toExportString(studentGrowth?.targetSkillEnhanced, Number(current.passive)),
    sub: toExportString(studentGrowth?.targetSkillSub, Number(current.sub)),
    gear1: toExportString(studentGrowth?.targetEquip1, Number(current.gear1)),
    gear2: toExportString(studentGrowth?.targetEquip2, Number(current.gear2)),
    gear3: toExportString(studentGrowth?.targetEquip3, Number(current.gear3)),
    bond_gear: toExportString(studentGrowth?.targetEquipSpecial, Number(current.bond_gear)),
    book_hp: toExportString(studentGrowth?.targetAbilityHp, Number(current.book_hp)),
    book_atk: toExportString(studentGrowth?.targetAbilityAtk, Number(current.book_atk)),
    book_heal: toExportString(studentGrowth?.targetAbilityHeal, Number(current.book_heal)),
    star,
    ue: uniqueWeapon,
  };
}

function splitTier(tier: number): SplitTier {
  return {
    star: Math.min(tier, 5),
    uniqueWeapon: Math.max(0, tier - 5),
  };
}

function defaultNumber(value: number | null | undefined, defaultValue: number): number {
  return value ?? defaultValue;
}

function toExportString(value: number | null | undefined, defaultValue: number): string {
  return String(defaultNumber(value, defaultValue));
}

function createMap<T>(items: T[], getKey: (item: T) => string): Record<string, T> {
  return Object.fromEntries(items.map((item) => [getKey(item), item]));
}

function compareStudentOrder(studentCatalog: StudentStateExportStudentCatalog, leftUid: string, rightUid: string): number {
  const leftOrder = studentCatalog[leftUid]?.order;
  const rightOrder = studentCatalog[rightUid]?.order;

  if (leftOrder != null && rightOrder != null) {
    return leftOrder - rightOrder;
  }
  if (leftOrder != null) {
    return -1;
  }
  if (rightOrder != null) {
    return 1;
  }

  return 0;
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }

  return Buffer.from(binary, "binary").toString("base64");
}
