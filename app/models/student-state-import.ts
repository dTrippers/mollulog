export type StudentStateImportCurrentState = {
  tier: number;
  level: number | null;
  weaponLevel: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  bond: number | null;
};

export type StudentStateImportTargetState = {
  targetBond: number | null;
  targetTier: number;
  targetLevel: number | null;
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
      level: character.current.level,
      weaponLevel: character.current.ue_level,
      skillEx: character.current.ex,
      skillNormal: character.current.basic,
      skillEnhanced: character.current.passive,
      skillSub: character.current.sub,
      equip1: character.current.gear1,
      equip2: character.current.gear2,
      equip3: character.current.gear3,
      equipSpecial: character.current.bond_gear,
      abilityHp: character.current.book_hp,
      abilityAtk: character.current.book_atk,
      abilityHeal: character.current.book_heal,
      bond: character.current.bond,
    });
    const target = isRecord(character.target)
      ? normalizeTargetCandidate({
          star: character.target.star,
          uniqueWeapon: character.target.ue,
          level: character.target.level,
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
      level: student.l,
      weaponLevel: student.wl,
      skillEx: student.s1,
      skillNormal: student.s2,
      skillEnhanced: student.s3,
      skillSub: student.s4,
      equip1: student.e1,
      equip2: student.e2,
      equip3: student.e3,
      equipSpecial: student.e4,
      abilityHp: student.pm,
      abilityAtk: student.pa,
      abilityHeal: student.ph,
      bond: student.b,
    });

    return toEntry(studentId, current, null);
  });

  return assertNonEmptyEntries(entries);
}

function normalizeCurrentCandidate(input: {
  star: unknown;
  uniqueWeapon: unknown;
  level: unknown;
  weaponLevel: unknown;
  skillEx: unknown;
  skillNormal: unknown;
  skillEnhanced: unknown;
  skillSub: unknown;
  equip1: unknown;
  equip2: unknown;
  equip3: unknown;
  equipSpecial: unknown;
  abilityHp: unknown;
  abilityAtk: unknown;
  abilityHeal: unknown;
  bond: unknown;
}): StudentStateImportCurrentState | null {
  const candidate: CurrentCandidate = {
    tier: composeTier(input.star, input.uniqueWeapon),
    level: optionalInteger(input.level),
    weaponLevel: optionalInteger(input.weaponLevel),
    skillEx: optionalInteger(input.skillEx),
    skillNormal: optionalInteger(input.skillNormal),
    skillEnhanced: optionalInteger(input.skillEnhanced),
    skillSub: optionalInteger(input.skillSub),
    equip1: optionalInteger(input.equip1),
    equip2: optionalInteger(input.equip2),
    equip3: optionalInteger(input.equip3),
    equipSpecial: optionalInteger(input.equipSpecial),
    abilityHp: optionalInteger(input.abilityHp),
    abilityAtk: optionalInteger(input.abilityAtk),
    abilityHeal: optionalInteger(input.abilityHeal),
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
  level: unknown;
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
    targetLevel: optionalInteger(input.level),
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
    isBaseProgressionValue(candidate.level) &&
    isBaseProgressionValue(candidate.skillEx) &&
    isBaseProgressionValue(candidate.skillNormal) &&
    isBaseProgressionValue(candidate.skillEnhanced) &&
    isBaseProgressionValue(candidate.skillSub) &&
    isBaseProgressionValue(candidate.equip1) &&
    isBaseProgressionValue(candidate.equip2) &&
    isBaseProgressionValue(candidate.equip3) &&
    candidate.equipSpecial == null &&
    candidate.weaponLevel == null &&
    candidate.abilityHp == null &&
    candidate.abilityAtk == null &&
    candidate.abilityHeal == null &&
    isBaseProgressionValue(candidate.bond)
  );
}

function isBaseTargetCandidate(candidate: TargetCandidate): boolean {
  return (
    isBaseProgressionValue(candidate.targetBond) &&
    isBaseProgressionValue(candidate.targetTier) &&
    isBaseProgressionValue(candidate.targetLevel) &&
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
    target.targetLevel === current.level &&
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
