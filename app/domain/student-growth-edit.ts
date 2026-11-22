import { ABILITY_RELEASE_MAX_LEVEL, EQUIPMENT_LEVEL_MAX_LEVEL, getWeaponLevelMaxByTier } from "./student-growth-state";

// Both the batch registration and the bulk growth save take at most this many students at once.
export const MAX_RECRUITED_STUDENT_BATCH_SIZE = 500;

// The current-state values the recruited students table edits in bulk. `bond` is stored apart from the others.
export const STUDENT_GROWTH_EDIT_FIELDS = [
  "tier",
  "level",
  "weaponLevel",
  "bond",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equip1Level",
  "equip2Level",
  "equip3Level",
  "equipSpecial",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
] as const;

export type StudentGrowthEditField = (typeof STUDENT_GROWTH_EDIT_FIELDS)[number];
export type StudentGrowthEditValues = Record<StudentGrowthEditField, number | null>;

export const STUDENT_GROWTH_EDIT_RANGES: Record<StudentGrowthEditField, { label: string; min: number; max: number }> = {
  tier: { label: "성급", min: 1, max: 9 },
  level: { label: "학생 Lv", min: 1, max: 90 },
  weaponLevel: { label: "고유무기 Lv", min: 0, max: 60 },
  bond: { label: "인연 랭크", min: 1, max: 100 },
  skillEx: { label: "EX 스킬", min: 1, max: 5 },
  skillNormal: { label: "기본 스킬", min: 1, max: 10 },
  skillEnhanced: { label: "강화 스킬", min: 1, max: 10 },
  skillSub: { label: "서브 스킬", min: 1, max: 10 },
  equip1: { label: "장비 1 티어", min: 1, max: 10 },
  equip2: { label: "장비 2 티어", min: 1, max: 10 },
  equip3: { label: "장비 3 티어", min: 1, max: 10 },
  equip1Level: { label: "장비 1 Lv", min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equip2Level: { label: "장비 2 Lv", min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equip3Level: { label: "장비 3 Lv", min: 1, max: EQUIPMENT_LEVEL_MAX_LEVEL },
  equipSpecial: { label: "애용품", min: 1, max: 2 },
  abilityHp: { label: "체력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  abilityAtk: { label: "공격력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  abilityHeal: { label: "치유력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
};

export const STUDENT_GROWTH_EQUIPMENT_SLOTS = [
  { index: 0, tierField: "equip1", levelField: "equip1Level" },
  { index: 1, tierField: "equip2", levelField: "equip2Level" },
  { index: 2, tierField: "equip3", levelField: "equip3Level" },
] as const satisfies readonly {
  index: number;
  tierField: StudentGrowthEditField;
  levelField: StudentGrowthEditField;
}[];

// What the student's catalog entry allows. The screen and the server read the same shape.
export type StudentGrowthEditStudent = {
  initialTier: number;
  // Equipment category per slot. A student with fewer than three slots has fewer entries.
  equipments: readonly string[];
  gearAvailable: boolean;
};

export type StudentGrowthEquipmentLimit = { category: string; tier: number; maxLevel: number };

export type StudentGrowthEditError = {
  field: StudentGrowthEditField;
  message: string;
  // The largest value the field accepts right now, when the cap depends on another value of the student.
  max?: number;
};

export function emptyStudentGrowthEditValues(): StudentGrowthEditValues {
  return Object.fromEntries(STUDENT_GROWTH_EDIT_FIELDS.map((field) => [field, null])) as StudentGrowthEditValues;
}

export function getEquipmentLevelMax(
  limits: readonly StudentGrowthEquipmentLimit[],
  category: string | null | undefined,
  tier: number | null,
): number | null {
  if (category == null) return null;
  const match = limits.find((limit) => limit.category === category && limit.tier === (tier ?? 1));
  return match?.maxLevel ?? null;
}

// A value that does not apply to the student is not editable: the weapon and ability release need ★6 or more,
// a slot needs the student to have that equipment, and the favorite item needs the student to have one.
export function isStudentGrowthFieldApplicable(
  field: StudentGrowthEditField,
  student: StudentGrowthEditStudent,
  tier: number | null,
): boolean {
  switch (field) {
    case "weaponLevel":
    case "abilityHp":
    case "abilityAtk":
    case "abilityHeal":
      return (tier ?? 0) > 5;
    case "equip1":
    case "equip1Level":
      return student.equipments[0] != null;
    case "equip2":
    case "equip2Level":
      return student.equipments[1] != null;
    case "equip3":
    case "equip3Level":
      return student.equipments[2] != null;
    case "equipSpecial":
      return student.gearAvailable;
    default:
      return true;
  }
}

// "은" or "는" for a label, by whether its last syllable ends in a final consonant. Latin endings such as "Lv" take "는".
function topicParticle(label: string): "은" | "는" {
  const code = label.charCodeAt(label.length - 1);
  const isSyllable = code >= 0xac00 && code <= 0xd7a3;
  return isSyllable && (code - 0xac00) % 28 !== 0 ? "은" : "는";
}

// Checks the values of one student. The same function runs on the screen while typing and on the server before a save,
// so the two cannot disagree. An empty value (null) is "not entered" and always passes.
export function validateStudentGrowthEdit(
  values: StudentGrowthEditValues,
  student: StudentGrowthEditStudent,
  equipmentLimits: readonly StudentGrowthEquipmentLimit[],
): StudentGrowthEditError[] {
  const errors: StudentGrowthEditError[] = [];
  for (const field of STUDENT_GROWTH_EDIT_FIELDS) {
    const value = values[field];
    if (value == null) continue;
    const range = STUDENT_GROWTH_EDIT_RANGES[field];
    if (!Number.isInteger(value)) {
      errors.push({ field, message: `${range.label}${topicParticle(range.label)} 정수로 입력해주세요.` });
      continue;
    }
    if (field === "tier") {
      if (value < student.initialTier || value > range.max) {
        errors.push({
          field,
          message: `성급은 ★${student.initialTier}부터 고유무기 ${range.max - 5}까지 선택해주세요.`,
        });
      }
      continue;
    }
    if (field === "weaponLevel") {
      const max = getWeaponLevelMaxByTier(values.tier);
      if (value < range.min || value > max) {
        errors.push({
          field,
          max,
          message:
            max === 0
              ? "고유무기 Lv는 고유무기를 장착한 뒤 입력할 수 있어요."
              : `고유무기 ${(values.tier ?? 0) - 5}단계에서는 고유무기 Lv를 ${max}까지 입력할 수 있어요.`,
        });
      }
      continue;
    }
    if (field === "abilityHp" || field === "abilityAtk" || field === "abilityHeal") {
      if (!isStudentGrowthFieldApplicable(field, student, values.tier)) {
        if (value > 0) errors.push({ field, max: 0, message: "능력 개방은 고유무기 장착 후 입력할 수 있어요." });
        continue;
      }
    } else if (!isStudentGrowthFieldApplicable(field, student, values.tier)) {
      errors.push({ field, message: `${range.label}${topicParticle(range.label)} 이 학생에게 입력할 수 없어요.` });
      continue;
    }
    const slot = STUDENT_GROWTH_EQUIPMENT_SLOTS.find((candidate) => candidate.levelField === field);
    if (slot) {
      const max = getEquipmentLevelMax(equipmentLimits, student.equipments[slot.index], values[slot.tierField]);
      if (max == null) {
        errors.push({ field, message: `장비 ${slot.index + 1} 정보를 확인하지 못했어요.` });
      } else if (value < range.min || value > max) {
        errors.push({
          field,
          max,
          message: `장비 ${slot.index + 1} Lv는 ${range.min}부터 ${max} 사이로 입력해주세요.`,
        });
      }
      continue;
    }
    if (value < range.min || value > range.max) {
      errors.push({
        field,
        max: range.max,
        message: `${range.label}${topicParticle(range.label)} ${range.min}~${range.max} 사이로 입력해주세요.`,
      });
    }
  }
  return errors;
}
