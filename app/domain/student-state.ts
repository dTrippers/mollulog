import {
  ABILITY_RELEASE_MAX_LEVEL,
  WEAPON_LEVEL_MAX_LEVEL,
  assertAbilityReleaseAvailable,
  assertWeaponLevelRange,
} from "~/domain/student-growth-state";

export type StudentStateFieldDefinition<Key extends string = string> = {
  key: Key;
  label: string;
  min: number;
  max?: number;
  kind?: "tier";
  gearOnly?: boolean;
  equipmentIndex?: number;
  dataCellClassName?: string;
  targetCellClassName?: string;
  headerClassName?: string;
};

export type StudentStateCurrentFieldKey =
  | "tier"
  | "bond"
  | "weaponLevel"
  | "level"
  | "abilityHp"
  | "abilityAtk"
  | "abilityHeal"
  | "skillEx"
  | "skillNormal"
  | "skillEnhanced"
  | "skillSub"
  | "equip1"
  | "equip2"
  | "equip3"
  | "equipSpecial";

export type StudentStateTargetFieldKey =
  | "targetTier"
  | "targetBond"
  | "targetWeaponLevel"
  | "targetLevel"
  | "targetAbilityHp"
  | "targetAbilityAtk"
  | "targetAbilityHeal"
  | "targetSkillEx"
  | "targetSkillNormal"
  | "targetSkillEnhanced"
  | "targetSkillSub"
  | "targetEquip1"
  | "targetEquip2"
  | "targetEquip3"
  | "targetEquipSpecial";

export const studentStateCurrentFields: readonly StudentStateFieldDefinition<StudentStateCurrentFieldKey>[] = [
  { key: "tier", label: "성급", min: 1, max: 9, kind: "tier" },
  { key: "bond", label: "인연 랭크", min: 1, max: 100 },
  { key: "level", label: "학생 Lv", min: 1, max: 90 },
  { key: "weaponLevel", label: "고유무기 Lv", min: 0, max: WEAPON_LEVEL_MAX_LEVEL },
  { key: "skillEx", label: "EX 스킬", min: 1, max: 5 },
  { key: "skillNormal", label: "기본 스킬", min: 1, max: 10 },
  { key: "skillEnhanced", label: "강화 스킬", min: 1, max: 10 },
  { key: "skillSub", label: "서브 스킬", min: 1, max: 10 },
  { key: "equip1", label: "장비1", min: 1, max: 10, equipmentIndex: 0 },
  { key: "equip2", label: "장비2", min: 1, max: 10, equipmentIndex: 1 },
  { key: "equip3", label: "장비3", min: 1, max: 10, equipmentIndex: 2 },
  { key: "equipSpecial", label: "애용품", min: 1, max: 2, gearOnly: true },
  { key: "abilityHp", label: "HP 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { key: "abilityAtk", label: "공격력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { key: "abilityHeal", label: "치유력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
] as const;

export const studentStateTargetFields: readonly StudentStateFieldDefinition<StudentStateTargetFieldKey>[] = [
  { key: "targetTier", label: "성급", min: 1, max: 9, kind: "tier" },
  { key: "targetBond", label: "인연 랭크", min: 1, max: 100 },
  { key: "targetLevel", label: "학생 Lv", min: 1, max: 90 },
  { key: "targetWeaponLevel", label: "고유무기 Lv", min: 0, max: WEAPON_LEVEL_MAX_LEVEL },
  { key: "targetSkillEx", label: "EX 스킬", min: 1, max: 5 },
  { key: "targetSkillNormal", label: "기본 스킬", min: 1, max: 10 },
  { key: "targetSkillEnhanced", label: "강화 스킬", min: 1, max: 10 },
  { key: "targetSkillSub", label: "서브 스킬", min: 1, max: 10 },
  { key: "targetEquip1", label: "장비1", min: 1, max: 10, equipmentIndex: 0 },
  { key: "targetEquip2", label: "장비2", min: 1, max: 10, equipmentIndex: 1 },
  { key: "targetEquip3", label: "장비3", min: 1, max: 10, equipmentIndex: 2 },
  { key: "targetEquipSpecial", label: "애용품", min: 1, max: 2, gearOnly: true },
  { key: "targetAbilityHp", label: "HP 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { key: "targetAbilityAtk", label: "공격력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { key: "targetAbilityHeal", label: "치유력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
] as const;

export type StudentStateComparisonField = Omit<StudentStateFieldDefinition, "key"> & {
  currentKey?: StudentStateCurrentFieldKey;
  targetKey?: StudentStateTargetFieldKey;
};

export const studentStateComparisonFields: readonly StudentStateComparisonField[] = [
  {
    label: "성급",
    currentKey: "tier",
    targetKey: "targetTier",
    min: 1,
    max: 9,
    kind: "tier",
    dataCellClassName: "min-w-28 px-2 py-2",
    targetCellClassName: "min-w-28 px-2 py-1.5",
    headerClassName: "min-w-28 px-2 py-1.5",
  },
  {
    label: "인연 랭크",
    currentKey: "bond",
    targetKey: "targetBond",
    min: 1,
    max: 100,
    dataCellClassName: "w-16 px-0.5 py-1.5",
    targetCellClassName: "w-16 px-0.5 py-1.5",
    headerClassName: "w-16 px-0.5 py-1.5",
  },
  { label: "학생 Lv", currentKey: "level", targetKey: "targetLevel", min: 1, max: 90 },
  { label: "고유무기 Lv", currentKey: "weaponLevel", targetKey: "targetWeaponLevel", min: 0, max: WEAPON_LEVEL_MAX_LEVEL },
  { label: "EX 스킬", currentKey: "skillEx", targetKey: "targetSkillEx", min: 1, max: 5 },
  { label: "기본 스킬", currentKey: "skillNormal", targetKey: "targetSkillNormal", min: 1, max: 10 },
  { label: "강화 스킬", currentKey: "skillEnhanced", targetKey: "targetSkillEnhanced", min: 1, max: 10 },
  { label: "서브 스킬", currentKey: "skillSub", targetKey: "targetSkillSub", min: 1, max: 10 },
  { label: "장비1", currentKey: "equip1", targetKey: "targetEquip1", min: 1, max: 10, equipmentIndex: 0 },
  { label: "장비2", currentKey: "equip2", targetKey: "targetEquip2", min: 1, max: 10, equipmentIndex: 1 },
  { label: "장비3", currentKey: "equip3", targetKey: "targetEquip3", min: 1, max: 10, equipmentIndex: 2 },
  { label: "애용품", currentKey: "equipSpecial", targetKey: "targetEquipSpecial", min: 1, max: 2, gearOnly: true },
  { label: "HP 해방", currentKey: "abilityHp", targetKey: "targetAbilityHp", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { label: "공격력 해방", currentKey: "abilityAtk", targetKey: "targetAbilityAtk", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { label: "치유력 해방", currentKey: "abilityHeal", targetKey: "targetAbilityHeal", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
] as const;
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
  targetBond: number | null;
  targetLevel: number | null;
  targetTier: number;
  targetWeaponLevel: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
  targetAbilityHp: number | null;
  targetAbilityAtk: number | null;
  targetAbilityHeal: number | null;
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
    weaponLevel: normalizeOptionalZeroBasedStudentStateValue(value.weaponLevel, "고유무기 레벨"),
    skillEx: normalizeOptionalStudentStateValue(value.skillEx, "EX 스킬"),
    skillNormal: normalizeOptionalStudentStateValue(value.skillNormal, "기본 스킬"),
    skillEnhanced: normalizeOptionalStudentStateValue(value.skillEnhanced, "강화 스킬"),
    skillSub: normalizeOptionalStudentStateValue(value.skillSub, "서브 스킬"),
    equip1: normalizeOptionalStudentStateValue(value.equip1, "장비 1"),
    equip2: normalizeOptionalStudentStateValue(value.equip2, "장비 2"),
    equip3: normalizeOptionalStudentStateValue(value.equip3, "장비 3"),
    equipSpecial: normalizeOptionalStudentStateValue(value.equipSpecial, "애용품"),
    abilityHp: normalizeOptionalZeroBasedStudentStateValue(value.abilityHp, "능력 개방 체력"),
    abilityAtk: normalizeOptionalZeroBasedStudentStateValue(value.abilityAtk, "능력 개방 공격력"),
    abilityHeal: normalizeOptionalZeroBasedStudentStateValue(value.abilityHeal, "능력 개방 치유력"),
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
    targetBond: normalizeOptionalStudentStateValue(
      value.targetBond ?? value.bond ?? value.relationshipTargetLevel,
      "목표 인연 랭크",
    ),
    targetLevel: normalizeOptionalStudentStateValue(value.targetLevel, "목표 레벨"),
    targetTier: normalizeStudentTierValue(value.targetTier, "목표 등급"),
    targetWeaponLevel: normalizeOptionalZeroBasedStudentStateValue(value.targetWeaponLevel, "목표 고유무기 레벨"),
    targetSkillEx: normalizeOptionalStudentStateValue(value.targetSkillEx, "목표 EX 스킬"),
    targetSkillNormal: normalizeOptionalStudentStateValue(value.targetSkillNormal, "목표 기본 스킬"),
    targetSkillEnhanced: normalizeOptionalStudentStateValue(value.targetSkillEnhanced, "목표 강화 스킬"),
    targetSkillSub: normalizeOptionalStudentStateValue(value.targetSkillSub, "목표 서브 스킬"),
    targetEquip1: normalizeOptionalStudentStateValue(value.targetEquip1, "목표 장비 1"),
    targetEquip2: normalizeOptionalStudentStateValue(value.targetEquip2, "목표 장비 2"),
    targetEquip3: normalizeOptionalStudentStateValue(value.targetEquip3, "목표 장비 3"),
    targetEquipSpecial: normalizeOptionalStudentStateValue(value.targetEquipSpecial, "목표 애용품"),
    targetAbilityHp: normalizeOptionalZeroBasedStudentStateValue(value.targetAbilityHp, "목표 능력 개방 체력"),
    targetAbilityAtk: normalizeOptionalZeroBasedStudentStateValue(value.targetAbilityAtk, "목표 능력 개방 공격력"),
    targetAbilityHeal: normalizeOptionalZeroBasedStudentStateValue(value.targetAbilityHeal, "목표 능력 개방 치유력"),
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

function normalizeOptionalZeroBasedStudentStateValue(value: unknown, label: string): number | null {
  if (value == null || value === "") {
    return null;
  }

  return normalizeIntegerValue(value, `${label}은(는) 정수만 입력할 수 있어요`);
}

function validateCurrentValue(state: StudentStateDraftCurrentValue) {
  assertOptionalRange(state.level, 1, 90, "레벨");
  assertOptionalRange(state.weaponLevel, 0, WEAPON_LEVEL_MAX_LEVEL, "고유무기 레벨");
  assertWeaponLevelRange(state.weaponLevel, state.tier, "고유무기 레벨");
  assertOptionalRange(state.skillEx, 1, 5, "EX 스킬");
  assertOptionalRange(state.skillNormal, 1, 10, "기본 스킬");
  assertOptionalRange(state.skillEnhanced, 1, 10, "강화 스킬");
  assertOptionalRange(state.skillSub, 1, 10, "서브 스킬");
  assertOptionalRange(state.equip1, 1, 10, "장비 1");
  assertOptionalRange(state.equip2, 1, 10, "장비 2");
  assertOptionalRange(state.equip3, 1, 10, "장비 3");
  assertOptionalRange(state.equipSpecial, 1, 2, "애용품");
  assertOptionalRange(state.abilityHp, 0, ABILITY_RELEASE_MAX_LEVEL, "능력 개방 체력");
  assertOptionalRange(state.abilityAtk, 0, ABILITY_RELEASE_MAX_LEVEL, "능력 개방 공격력");
  assertOptionalRange(state.abilityHeal, 0, ABILITY_RELEASE_MAX_LEVEL, "능력 개방 치유력");
  assertAbilityReleaseAvailable([state.abilityHp, state.abilityAtk, state.abilityHeal], state.tier, "능력 해방");
  assertOptionalRange(state.bond, 1, 100, "인연 랭크");
}

function validateTargetValue(state: StudentStateDraftTargetValue) {
  assertOptionalRange(state.targetBond, 1, 100, "목표 인연 랭크");
  assertOptionalRange(state.targetLevel, 1, 90, "목표 레벨");
  assertOptionalRange(state.targetWeaponLevel, 0, WEAPON_LEVEL_MAX_LEVEL, "목표 고유무기 레벨");
  assertWeaponLevelRange(state.targetWeaponLevel, state.targetTier, "목표 고유무기 레벨");
  assertOptionalRange(state.targetSkillEx, 1, 5, "목표 EX 스킬");
  assertOptionalRange(state.targetSkillNormal, 1, 10, "목표 기본 스킬");
  assertOptionalRange(state.targetSkillEnhanced, 1, 10, "목표 강화 스킬");
  assertOptionalRange(state.targetSkillSub, 1, 10, "목표 서브 스킬");
  assertOptionalRange(state.targetEquip1, 1, 10, "목표 장비 1");
  assertOptionalRange(state.targetEquip2, 1, 10, "목표 장비 2");
  assertOptionalRange(state.targetEquip3, 1, 10, "목표 장비 3");
  assertOptionalRange(state.targetEquipSpecial, 1, 2, "목표 애용품");
  assertOptionalRange(state.targetAbilityHp, 0, ABILITY_RELEASE_MAX_LEVEL, "목표 능력 개방 체력");
  assertOptionalRange(state.targetAbilityAtk, 0, ABILITY_RELEASE_MAX_LEVEL, "목표 능력 개방 공격력");
  assertOptionalRange(state.targetAbilityHeal, 0, ABILITY_RELEASE_MAX_LEVEL, "목표 능력 개방 치유력");
  assertAbilityReleaseAvailable(
    [state.targetAbilityHp, state.targetAbilityAtk, state.targetAbilityHeal],
    state.targetTier,
    "목표 능력 해방",
  );
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
export type StudentStateCurrentComparisonValue = Omit<StudentStateDraftCurrentValue, "tier"> & {
  tier: number | null;
};

export type StudentStateTargetComparisonValue = Omit<StudentStateDraftTargetValue, "targetTier"> & {
  targetTier: number | null;
};

type StudentStateDiffOptions = {
  initialTier: number;
  hasGear: boolean;
};

const currentComparisonFields = studentStateComparisonFields.flatMap((field) =>
  field.currentKey ? [{ key: field.currentKey, kind: field.kind, gearOnly: field.gearOnly, min: field.min }] : [],
);

const targetComparisonFields = studentStateComparisonFields.flatMap((field) =>
  field.targetKey ? [{ key: field.targetKey, kind: field.kind, gearOnly: field.gearOnly, min: field.min }] : [],
);

export function isStudentStateCurrentChanged(
  imported: StudentStateDraftCurrentValue | null,
  existing: StudentStateCurrentComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): boolean {
  if (imported == null) {
    return false;
  }

  return currentComparisonFields.some((field) => isStudentStateCurrentFieldChanged(field, imported, existing, options));
}

export function isStudentStateTargetChanged(
  imported: StudentStateDraftTargetValue | null,
  existing: StudentStateTargetComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): boolean {
  if (imported == null) {
    return false;
  }

  return targetComparisonFields.some((field) => isStudentStateTargetFieldChanged(field, imported, existing, options));
}

export function isStudentStateCurrentFieldUpdateTarget(
  key: keyof StudentStateCurrentComparisonValue,
  imported: StudentStateDraftCurrentValue,
  existing: StudentStateCurrentComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): boolean {
  const field = currentComparisonFields.find((field) => field.key === key);
  return field ? isStudentStateCurrentFieldChanged(field, imported, existing, options) : false;
}

export function isStudentStateTargetFieldUpdateTarget(
  key: keyof StudentStateTargetComparisonValue,
  imported: StudentStateDraftTargetValue,
  existing: StudentStateTargetComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): boolean {
  const field = targetComparisonFields.find((field) => field.key === key);
  return field ? isStudentStateTargetFieldChanged(field, imported, existing, options) : false;
}

export function mergeStudentStateDraftValueForUpdate(
  imported: StudentStateDraftValue,
  existing: {
    current: StudentStateCurrentComparisonValue | null | undefined;
    target: StudentStateTargetComparisonValue | null | undefined;
  },
  options: StudentStateDiffOptions,
): StudentStateDraftValue {
  return {
    current: mergeStudentStateCurrentValueForUpdate(imported.current, existing.current, options),
    target: mergeStudentStateTargetValueForUpdate(imported.target, existing.target, options),
  };
}

export function mergeStudentStateCurrentValueForUpdate(
  imported: StudentStateDraftCurrentValue | null,
  existing: StudentStateCurrentComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): StudentStateDraftCurrentValue | null {
  if (!isStudentStateCurrentChanged(imported, existing, options) || imported == null) {
    return null;
  }

  return {
    tier: isStudentStateCurrentFieldUpdateTarget("tier", imported, existing, options)
      ? imported.tier
      : (existing?.tier ?? options.initialTier),
    weaponLevel: getMergedCurrentFieldValue("weaponLevel", imported, existing, options),
    level: getMergedCurrentFieldValue("level", imported, existing, options),
    abilityHp: getMergedCurrentFieldValue("abilityHp", imported, existing, options),
    abilityAtk: getMergedCurrentFieldValue("abilityAtk", imported, existing, options),
    abilityHeal: getMergedCurrentFieldValue("abilityHeal", imported, existing, options),
    skillEx: getMergedCurrentFieldValue("skillEx", imported, existing, options),
    skillNormal: getMergedCurrentFieldValue("skillNormal", imported, existing, options),
    skillEnhanced: getMergedCurrentFieldValue("skillEnhanced", imported, existing, options),
    skillSub: getMergedCurrentFieldValue("skillSub", imported, existing, options),
    equip1: getMergedCurrentFieldValue("equip1", imported, existing, options),
    equip2: getMergedCurrentFieldValue("equip2", imported, existing, options),
    equip3: getMergedCurrentFieldValue("equip3", imported, existing, options),
    equipSpecial: getMergedCurrentFieldValue("equipSpecial", imported, existing, options),
    bond: getMergedCurrentFieldValue("bond", imported, existing, options),
  };
}

export function mergeStudentStateTargetValueForUpdate(
  imported: StudentStateDraftTargetValue | null,
  existing: StudentStateTargetComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): StudentStateDraftTargetValue | null {
  if (!isStudentStateTargetChanged(imported, existing, options) || imported == null) {
    return null;
  }

  return {
    targetTier: isStudentStateTargetFieldUpdateTarget("targetTier", imported, existing, options)
      ? imported.targetTier
      : (existing?.targetTier ?? options.initialTier),
    targetWeaponLevel: getMergedTargetFieldValue("targetWeaponLevel", imported, existing, options),
    targetBond: getMergedTargetFieldValue("targetBond", imported, existing, options),
    targetLevel: getMergedTargetFieldValue("targetLevel", imported, existing, options),
    targetAbilityHp: getMergedTargetFieldValue("targetAbilityHp", imported, existing, options),
    targetAbilityAtk: getMergedTargetFieldValue("targetAbilityAtk", imported, existing, options),
    targetAbilityHeal: getMergedTargetFieldValue("targetAbilityHeal", imported, existing, options),
    targetSkillEx: getMergedTargetFieldValue("targetSkillEx", imported, existing, options),
    targetSkillNormal: getMergedTargetFieldValue("targetSkillNormal", imported, existing, options),
    targetSkillEnhanced: getMergedTargetFieldValue("targetSkillEnhanced", imported, existing, options),
    targetSkillSub: getMergedTargetFieldValue("targetSkillSub", imported, existing, options),
    targetEquip1: getMergedTargetFieldValue("targetEquip1", imported, existing, options),
    targetEquip2: getMergedTargetFieldValue("targetEquip2", imported, existing, options),
    targetEquip3: getMergedTargetFieldValue("targetEquip3", imported, existing, options),
    targetEquipSpecial: getMergedTargetFieldValue("targetEquipSpecial", imported, existing, options),
  };
}

function isStudentStateCurrentFieldChanged(
  field: (typeof currentComparisonFields)[number],
  imported: StudentStateDraftCurrentValue,
  existing: StudentStateCurrentComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): boolean {
  if (field.gearOnly && !options.hasGear) {
    return false;
  }

  const importedValue = imported[field.key];
  if (importedValue == null) {
    return false;
  }

  const minimumValue = getMinimumValue(field, options.initialTier);
  return effectiveValue(importedValue, minimumValue) !== effectiveValue(existing?.[field.key], minimumValue);
}

function isStudentStateTargetFieldChanged(
  field: (typeof targetComparisonFields)[number],
  imported: StudentStateDraftTargetValue,
  existing: StudentStateTargetComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): boolean {
  if (field.gearOnly && !options.hasGear) {
    return false;
  }

  const importedValue = imported[field.key];
  if (importedValue == null) {
    return false;
  }

  const minimumValue = getMinimumValue(field, options.initialTier);
  return effectiveValue(importedValue, minimumValue) !== effectiveValue(existing?.[field.key], minimumValue);
}

function getMergedCurrentFieldValue(
  key: Exclude<keyof StudentStateCurrentComparisonValue, "tier">,
  imported: StudentStateDraftCurrentValue,
  existing: StudentStateCurrentComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): number | null {
  return isStudentStateCurrentFieldUpdateTarget(key, imported, existing, options) ? imported[key] : (existing?.[key] ?? null);
}

function getMergedTargetFieldValue(
  key: Exclude<keyof StudentStateTargetComparisonValue, "targetTier">,
  imported: StudentStateDraftTargetValue,
  existing: StudentStateTargetComparisonValue | null | undefined,
  options: StudentStateDiffOptions,
): number | null {
  return isStudentStateTargetFieldUpdateTarget(key, imported, existing, options) ? imported[key] : (existing?.[key] ?? null);
}

function getMinimumValue(field: { kind?: "tier"; min: number }, initialTier: number): number {
  return field.kind === "tier" ? initialTier : field.min;
}

function effectiveValue(value: number | null | undefined, minimumValue: number): number {
  return value == null || value <= minimumValue ? minimumValue : value;
}
