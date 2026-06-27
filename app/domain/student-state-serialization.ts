import type { RecruitedStudent } from "~/models/recruited-student";
import type { RelationshipLevel } from "~/models/relationship-level";
import type { StudentGrowth } from "~/models/student-growth";

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

export type StudentStateImportCurrentState = {
  tier: number;
  weaponLevel: number | null;
  level: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  bond: number | null;
};

export type StudentStateImportTargetState = {
  targetBond: number | null;
  targetTier: number;
  targetWeaponLevel: number | null;
  targetLevel: number | null;
  targetAbilityHp: number | null;
  targetAbilityAtk: number | null;
  targetAbilityHeal: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
};

export type StudentStateImportEntry = {
  studentId: string;
  current: StudentStateImportCurrentState | null;
  target: StudentStateImportTargetState | null;
};

type StudentStateImportFormat = "schaledb" | "justin163";

type ParsedImportPayload = {
  format: StudentStateImportFormat;
  entries: StudentStateImportEntry[];
};

type UnknownRecord = Record<string, unknown>;

type CurrentCandidate = Omit<StudentStateImportCurrentState, "tier"> & {
  tier: number | null;
};

type TargetCandidate = Omit<StudentStateImportTargetState, "targetTier"> & {
  targetTier: number | null;
};

const userFacingParseError = "SchaleDB 또는 Justin163 학생 데이터 JSON을 인식하지 못했어요.";

export function parseStudentStateImport(input: string): ParsedImportPayload {
  const parsed = parseJsonInput(input);

  if (isJustin163Payload(parsed)) {
    return { format: "justin163", entries: parseJustin163Payload(parsed) };
  }

  if (isSchaleDbPayload(parsed)) {
    return { format: "schaledb", entries: parseSchaleDbPayload(parsed) };
  }

  throw new Error(userFacingParseError);
}

function parseJsonInput(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("가져올 데이터를 입력해주세요.");
  }

  const base64Decoded = tryDecodeBase64Json(trimmed);
  if (base64Decoded.ok) {
    return base64Decoded.value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(userFacingParseError);
  }
}

function tryDecodeBase64Json(input: string): { ok: true; value: unknown } | { ok: false } {
  if (!/^[A-Za-z0-9+/=\s_-]+$/.test(input)) {
    return { ok: false };
  }

  try {
    const normalized = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

function isJustin163Payload(value: unknown): value is { characters: unknown[] } {
  return isRecord(value) && Array.isArray(value.characters);
}

function isSchaleDbPayload(value: unknown): value is UnknownRecord {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(
    ([studentId, student]) => isNumericId(studentId) && isRecord(student) && ("s" in student || "l" in student),
  );
}

function parseJustin163Payload(payload: { characters: unknown[] }): StudentStateImportEntry[] {
  const entries = payload.characters.flatMap((character) => {
    if (!isRecord(character) || !isNumericId(character.id) || !isRecord(character.current)) {
      throw new Error(userFacingParseError);
    }

    const current = normalizeCurrentCandidate({
      star: character.current.star,
      uniqueWeapon: character.current.ue,
      weaponLevel: character.current.ue_level,
      level: character.current.level,
      abilityHp: character.current.book_hp,
      abilityAtk: character.current.book_atk,
      abilityHeal: character.current.book_heal,
      skillEx: character.current.ex,
      skillNormal: character.current.basic,
      skillEnhanced: character.current.passive,
      skillSub: character.current.sub,
      equip1: character.current.gear1,
      equip2: character.current.gear2,
      equip3: character.current.gear3,
      equipSpecial: character.current.bond_gear,
      bond: character.current.bond,
    });
    const target = isRecord(character.target)
      ? normalizeTargetCandidate({
          star: character.target.star,
          uniqueWeapon: character.target.ue,
          weaponLevel: character.target.ue_level,
          level: character.target.level,
          abilityHp: character.target.book_hp,
          abilityAtk: character.target.book_atk,
          abilityHeal: character.target.book_heal,
          skillEx: character.target.ex,
          skillNormal: character.target.basic,
          skillEnhanced: character.target.passive,
          skillSub: character.target.sub,
          equip1: character.target.gear1,
          equip2: character.target.gear2,
          equip3: character.target.gear3,
          equipSpecial: character.target.bond_gear,
          bond: character.target.bond,
        })
      : null;
    // Justin163 requires every character to carry a target block, so the export
    // emits a target that mirrors the current state when there is no growth goal.
    // Treat such a target as "no goal" to keep the round-trip symmetric.
    const growthTarget = current !== null && target !== null && isTargetEqualToCurrent(current, target) ? null : target;

    return toEntry(String(character.id), current, growthTarget);
  });

  return assertNonEmptyEntries(entries);
}

function parseSchaleDbPayload(payload: UnknownRecord): StudentStateImportEntry[] {
  const entries = Object.entries(payload).flatMap(([studentId, student]) => {
    if (!isNumericId(studentId) || !isRecord(student)) {
      return [];
    }

    const current = normalizeCurrentCandidate({
      star: student.s,
      uniqueWeapon: student.ws,
      weaponLevel: student.wl,
      level: student.l,
      abilityHp: student.pm,
      abilityAtk: student.pa,
      abilityHeal: student.ph,
      skillEx: student.s1,
      skillNormal: student.s2,
      skillEnhanced: student.s3,
      skillSub: student.s4,
      equip1: student.e1,
      equip2: student.e2,
      equip3: student.e3,
      equipSpecial: student.e4,
      bond: student.b,
    });

    return toEntry(studentId, current, null);
  });

  return assertNonEmptyEntries(entries);
}

function normalizeCurrentCandidate(input: {
  star: unknown;
  uniqueWeapon: unknown;
  weaponLevel: unknown;
  level: unknown;
  abilityHp: unknown;
  abilityAtk: unknown;
  abilityHeal: unknown;
  skillEx: unknown;
  skillNormal: unknown;
  skillEnhanced: unknown;
  skillSub: unknown;
  equip1: unknown;
  equip2: unknown;
  equip3: unknown;
  equipSpecial: unknown;
  bond: unknown;
}): StudentStateImportCurrentState | null {
  const candidate: CurrentCandidate = {
    tier: composeTier(input.star, input.uniqueWeapon),
    weaponLevel: optionalZeroBasedInteger(input.weaponLevel),
    level: optionalInteger(input.level),
    abilityHp: optionalZeroBasedInteger(input.abilityHp),
    abilityAtk: optionalZeroBasedInteger(input.abilityAtk),
    abilityHeal: optionalZeroBasedInteger(input.abilityHeal),
    skillEx: optionalInteger(input.skillEx),
    skillNormal: optionalInteger(input.skillNormal),
    skillEnhanced: optionalInteger(input.skillEnhanced),
    skillSub: optionalInteger(input.skillSub),
    equip1: optionalInteger(input.equip1),
    equip2: optionalInteger(input.equip2),
    equip3: optionalInteger(input.equip3),
    equipSpecial: optionalInteger(input.equipSpecial),
    bond: optionalInteger(input.bond),
  };

  if (isBaseCurrentCandidate(candidate)) {
    return null;
  }
  if (candidate.tier == null || candidate.tier < 1 || candidate.tier > 9) {
    throw new Error("학생 등급은 1부터 9까지의 값만 가져올 수 있어요.");
  }

  return { ...candidate, tier: candidate.tier };
}

function normalizeTargetCandidate(input: {
  star: unknown;
  uniqueWeapon: unknown;
  weaponLevel: unknown;
  level: unknown;
  abilityHp: unknown;
  abilityAtk: unknown;
  abilityHeal: unknown;
  skillEx: unknown;
  skillNormal: unknown;
  skillEnhanced: unknown;
  skillSub: unknown;
  equip1: unknown;
  equip2: unknown;
  equip3: unknown;
  equipSpecial: unknown;
  bond: unknown;
}): StudentStateImportTargetState | null {
  const candidate: TargetCandidate = {
    targetBond: optionalInteger(input.bond),
    targetTier: composeTier(input.star, input.uniqueWeapon),
    targetWeaponLevel: optionalZeroBasedInteger(input.weaponLevel),
    targetLevel: optionalInteger(input.level),
    targetAbilityHp: optionalZeroBasedInteger(input.abilityHp),
    targetAbilityAtk: optionalZeroBasedInteger(input.abilityAtk),
    targetAbilityHeal: optionalZeroBasedInteger(input.abilityHeal),
    targetSkillEx: optionalInteger(input.skillEx),
    targetSkillNormal: optionalInteger(input.skillNormal),
    targetSkillEnhanced: optionalInteger(input.skillEnhanced),
    targetSkillSub: optionalInteger(input.skillSub),
    targetEquip1: optionalInteger(input.equip1),
    targetEquip2: optionalInteger(input.equip2),
    targetEquip3: optionalInteger(input.equip3),
    targetEquipSpecial: optionalInteger(input.equipSpecial),
  };

  if (isBaseTargetCandidate(candidate)) {
    return null;
  }
  if (candidate.targetTier == null || candidate.targetTier < 1 || candidate.targetTier > 9) {
    throw new Error("학생 등급은 1부터 9까지의 값만 가져올 수 있어요.");
  }

  return { ...candidate, targetTier: candidate.targetTier };
}

function composeTier(star: unknown, uniqueWeapon: unknown): number | null {
  const normalizedStar = optionalInteger(star);
  const normalizedUniqueWeapon = optionalInteger(uniqueWeapon) ?? 0;
  if (normalizedStar == null && normalizedUniqueWeapon === 0) {
    return null;
  }

  return (normalizedStar ?? 0) + normalizedUniqueWeapon;
}

function toEntry(
  studentId: string,
  current: StudentStateImportCurrentState | null,
  target: StudentStateImportTargetState | null,
): StudentStateImportEntry[] {
  if (current === null && target === null) {
    return [];
  }

  return [{ studentId, current, target }];
}

function isBaseCurrentCandidate(candidate: CurrentCandidate): boolean {
  return (
    isBaseProgressionValue(candidate.tier) &&
    isBaseZeroBasedProgressionValue(candidate.weaponLevel) &&
    isBaseProgressionValue(candidate.level) &&
    isBaseZeroBasedProgressionValue(candidate.abilityHp) &&
    isBaseZeroBasedProgressionValue(candidate.abilityAtk) &&
    isBaseZeroBasedProgressionValue(candidate.abilityHeal) &&
    isBaseProgressionValue(candidate.skillEx) &&
    isBaseProgressionValue(candidate.skillNormal) &&
    isBaseProgressionValue(candidate.skillEnhanced) &&
    isBaseProgressionValue(candidate.skillSub) &&
    isBaseProgressionValue(candidate.equip1) &&
    isBaseProgressionValue(candidate.equip2) &&
    isBaseProgressionValue(candidate.equip3) &&
    candidate.equipSpecial == null &&
    isBaseProgressionValue(candidate.bond)
  );
}

function isBaseTargetCandidate(candidate: TargetCandidate): boolean {
  return (
    isBaseProgressionValue(candidate.targetBond) &&
    isBaseProgressionValue(candidate.targetTier) &&
    isBaseZeroBasedProgressionValue(candidate.targetWeaponLevel) &&
    isBaseProgressionValue(candidate.targetLevel) &&
    isBaseZeroBasedProgressionValue(candidate.targetAbilityHp) &&
    isBaseZeroBasedProgressionValue(candidate.targetAbilityAtk) &&
    isBaseZeroBasedProgressionValue(candidate.targetAbilityHeal) &&
    isBaseProgressionValue(candidate.targetSkillEx) &&
    isBaseProgressionValue(candidate.targetSkillNormal) &&
    isBaseProgressionValue(candidate.targetSkillEnhanced) &&
    isBaseProgressionValue(candidate.targetSkillSub) &&
    isBaseProgressionValue(candidate.targetEquip1) &&
    isBaseProgressionValue(candidate.targetEquip2) &&
    isBaseProgressionValue(candidate.targetEquip3) &&
    candidate.targetEquipSpecial == null
  );
}

function isTargetEqualToCurrent(
  current: StudentStateImportCurrentState,
  target: StudentStateImportTargetState,
): boolean {
  return (
    target.targetBond === current.bond &&
    target.targetTier === current.tier &&
    target.targetWeaponLevel === current.weaponLevel &&
    target.targetLevel === current.level &&
    target.targetAbilityHp === current.abilityHp &&
    target.targetAbilityAtk === current.abilityAtk &&
    target.targetAbilityHeal === current.abilityHeal &&
    target.targetSkillEx === current.skillEx &&
    target.targetSkillNormal === current.skillNormal &&
    target.targetSkillEnhanced === current.skillEnhanced &&
    target.targetSkillSub === current.skillSub &&
    target.targetEquip1 === current.equip1 &&
    target.targetEquip2 === current.equip2 &&
    target.targetEquip3 === current.equip3 &&
    target.targetEquipSpecial === current.equipSpecial
  );
}

function isBaseProgressionValue(value: number | null): boolean {
  return value == null || value <= 1;
}

function isBaseZeroBasedProgressionValue(value: number | null): boolean {
  return value == null || value <= 0;
}

function assertNonEmptyEntries(entries: StudentStateImportEntry[]): StudentStateImportEntry[] {
  if (entries.length === 0) {
    throw new Error("가져올 학생 데이터가 없어요.");
  }

  const seenStudentIds = new Set<string>();
  for (const entry of entries) {
    if (seenStudentIds.has(entry.studentId)) {
      throw new Error(`중복된 학생 데이터가 있어요. (${entry.studentId})`);
    }
    seenStudentIds.add(entry.studentId);
  }

  return entries;
}

function optionalInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const normalized = requiredInteger(value, "숫자 형식이 아닌 값이 있어요.");
  return normalized === 0 ? null : normalized;
}

function optionalZeroBasedInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  return requiredInteger(value, "숫자 형식이 아닌 값이 있어요.");
}

function requiredInteger(value: unknown, errorMessage: string): number {
  const numberValue = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof numberValue !== "number" || !Number.isInteger(numberValue)) {
    throw new Error(errorMessage);
  }

  return numberValue;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumericId(value: unknown): boolean {
  return typeof value === "string" && /^\d+$/.test(value);
}
