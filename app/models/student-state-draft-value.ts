export type StudentStateDraftCurrentValue = {
  level: number | null;
  tier: number;
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

export type StudentStateDraftTargetValue = {
  targetLevel: number | null;
  targetTier: number;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
};

export type StudentStateDraftValue = {
  current: StudentStateDraftCurrentValue | null;
  target: StudentStateDraftTargetValue | null;
};

type UnknownRecord = Record<string, unknown>;

export function parseStudentStateDraftValue(entry: {
  value: number;
  valueJson: string | null;
}): StudentStateDraftValue {
  if (!entry.valueJson) {
    throw new Error("학생 상태 변경안 데이터를 찾을 수 없어요");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.valueJson);
  } catch {
    throw new Error("학생 상태 변경안 데이터를 읽을 수 없어요");
  }

  if (!isRecord(parsed)) {
    throw new Error("학생 상태 변경안 데이터 형식이 올바르지 않아요");
  }

  const current = normalizeCurrentValue(parsed.current);
  const target = normalizeTargetValue(parsed.target);
  if (current === null && target === null) {
    throw new Error("학생 상태 변경안에는 현재 상태 또는 육성 목표가 필요해요");
  }

  const expectedValue = current?.tier ?? target?.targetTier ?? 1;
  if (expectedValue !== entry.value) {
    throw new Error("학생 상태 변경안의 등급 정보가 일치하지 않아요");
  }

  return { current, target };
}

function normalizeCurrentValue(value: unknown): StudentStateDraftCurrentValue | null {
  if (value == null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("학생 현재 상태 데이터 형식이 올바르지 않아요");
  }

  const state: StudentStateDraftCurrentValue = {
    level: normalizeOptionalStudentStateValue(value.level, "레벨"),
    tier: normalizeStudentTierValue(value.tier, "학생 등급"),
    weaponLevel: normalizeOptionalStudentStateValue(value.weaponLevel, "고유무기 레벨"),
    skillEx: normalizeOptionalStudentStateValue(value.skillEx, "EX 스킬"),
    skillNormal: normalizeOptionalStudentStateValue(value.skillNormal, "기본 스킬"),
    skillEnhanced: normalizeOptionalStudentStateValue(value.skillEnhanced, "강화 스킬"),
    skillSub: normalizeOptionalStudentStateValue(value.skillSub, "서브 스킬"),
    equip1: normalizeOptionalStudentStateValue(value.equip1, "장비 1"),
    equip2: normalizeOptionalStudentStateValue(value.equip2, "장비 2"),
    equip3: normalizeOptionalStudentStateValue(value.equip3, "장비 3"),
    equipSpecial: normalizeOptionalStudentStateValue(value.equipSpecial, "애용품"),
    abilityHp: normalizeOptionalStudentStateValue(value.abilityHp, "능력 해방 HP"),
    abilityAtk: normalizeOptionalStudentStateValue(value.abilityAtk, "능력 해방 공격력"),
    abilityHeal: normalizeOptionalStudentStateValue(value.abilityHeal, "능력 해방 치유력"),
    bond: normalizeOptionalStudentStateValue(value.bond, "인연 랭크"),
  };

  validateCurrentValue(state);
  return state;
}

function normalizeTargetValue(value: unknown): StudentStateDraftTargetValue | null {
  if (value == null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("학생 육성 목표 데이터 형식이 올바르지 않아요");
  }

  const state: StudentStateDraftTargetValue = {
    targetLevel: normalizeOptionalStudentStateValue(value.targetLevel, "목표 레벨"),
    targetTier: normalizeStudentTierValue(value.targetTier, "목표 등급"),
    targetSkillEx: normalizeOptionalStudentStateValue(value.targetSkillEx, "목표 EX 스킬"),
    targetSkillNormal: normalizeOptionalStudentStateValue(value.targetSkillNormal, "목표 기본 스킬"),
    targetSkillEnhanced: normalizeOptionalStudentStateValue(value.targetSkillEnhanced, "목표 강화 스킬"),
    targetSkillSub: normalizeOptionalStudentStateValue(value.targetSkillSub, "목표 서브 스킬"),
    targetEquip1: normalizeOptionalStudentStateValue(value.targetEquip1, "목표 장비 1"),
    targetEquip2: normalizeOptionalStudentStateValue(value.targetEquip2, "목표 장비 2"),
    targetEquip3: normalizeOptionalStudentStateValue(value.targetEquip3, "목표 장비 3"),
    targetEquipSpecial: normalizeOptionalStudentStateValue(value.targetEquipSpecial, "목표 애용품"),
  };

  validateTargetValue(state);
  return state;
}

function normalizeOptionalStudentStateValue(value: unknown, label: string): number | null {
  if (value == null) {
    return null;
  }

  const normalizedValue = normalizeIntegerValue(value, `${label}은(는) 정수만 입력할 수 있어요`);
  return normalizedValue === 0 ? null : normalizedValue;
}

function validateCurrentValue(state: StudentStateDraftCurrentValue) {
  assertOptionalRange(state.level, 1, 90, "레벨");
  assertOptionalRange(state.weaponLevel, 1, undefined, "고유무기 레벨");
  assertOptionalRange(state.skillEx, 1, 5, "EX 스킬");
  assertOptionalRange(state.skillNormal, 1, 10, "기본 스킬");
  assertOptionalRange(state.skillEnhanced, 1, 10, "강화 스킬");
  assertOptionalRange(state.skillSub, 1, 10, "서브 스킬");
  assertOptionalRange(state.equip1, 1, 10, "장비 1");
  assertOptionalRange(state.equip2, 1, 10, "장비 2");
  assertOptionalRange(state.equip3, 1, 10, "장비 3");
  assertOptionalRange(state.equipSpecial, 1, 2, "애용품");
  assertOptionalRange(state.abilityHp, 1, undefined, "능력 해방 HP");
  assertOptionalRange(state.abilityAtk, 1, undefined, "능력 해방 공격력");
  assertOptionalRange(state.abilityHeal, 1, undefined, "능력 해방 치유력");
  assertOptionalRange(state.bond, 1, 100, "인연 랭크");
}

function validateTargetValue(state: StudentStateDraftTargetValue) {
  assertOptionalRange(state.targetLevel, 1, 90, "목표 레벨");
  assertOptionalRange(state.targetSkillEx, 1, 5, "목표 EX 스킬");
  assertOptionalRange(state.targetSkillNormal, 1, 10, "목표 기본 스킬");
  assertOptionalRange(state.targetSkillEnhanced, 1, 10, "목표 강화 스킬");
  assertOptionalRange(state.targetSkillSub, 1, 10, "목표 서브 스킬");
  assertOptionalRange(state.targetEquip1, 1, 10, "목표 장비 1");
  assertOptionalRange(state.targetEquip2, 1, 10, "목표 장비 2");
  assertOptionalRange(state.targetEquip3, 1, 10, "목표 장비 3");
  assertOptionalRange(state.targetEquipSpecial, 1, 2, "목표 애용품");
}

function assertOptionalRange(value: number | null, min: number, max: number | undefined, label: string) {
  if (value == null) {
    return;
  }

  if (value < min || (max != null && value > max)) {
    if (max == null) {
      throw new Error(`${label}은(는) ${min} 이상만 입력할 수 있어요`);
    }
    throw new Error(`${label}은(는) ${min}부터 ${max} 사이만 입력할 수 있어요`);
  }
}

function normalizeStudentTierValue(value: unknown, label: string): number {
  const normalizedValue = normalizeIntegerValue(value, `${label}은(는) 1부터 9까지의 정수만 입력해주세요`);
  if (normalizedValue < 1 || normalizedValue > 9) {
    throw new Error(`${label}은(는) 1부터 9까지의 정수만 입력해주세요`);
  }

  return normalizedValue;
}

function normalizeIntegerValue(value: unknown, errorMessage: string): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(errorMessage);
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(errorMessage);
    }
    return Number(trimmed);
  }

  throw new Error(errorMessage);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
