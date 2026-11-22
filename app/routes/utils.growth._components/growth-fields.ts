import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  getWeaponLevelMaxByTier,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";
import type { GrowthStudent } from "./types";

// One numeric value of a student's growth, with its current and target keys. The label is the column name in the table;
// `name` is the full name for screen readers and validation messages.
export const fieldDefinitions = [
  { key: "level", targetKey: "targetLevel", label: "Lv", name: "학생 레벨", min: 1, max: 90 },
  {
    key: "weaponLevel",
    targetKey: "targetWeaponLevel",
    label: "고유무기",
    name: "고유무기 레벨",
    min: 0,
    max: WEAPON_LEVEL_MAX_LEVEL,
  },
  { key: "skillEx", targetKey: "targetSkillEx", label: "EX", name: "EX 스킬", min: 1, max: 5 },
  { key: "skillNormal", targetKey: "targetSkillNormal", label: "기본", name: "기본 스킬", min: 1, max: 10 },
  { key: "skillEnhanced", targetKey: "targetSkillEnhanced", label: "강화", name: "강화 스킬", min: 1, max: 10 },
  { key: "skillSub", targetKey: "targetSkillSub", label: "서브", name: "서브 스킬", min: 1, max: 10 },
  { key: "equip1", targetKey: "targetEquip1", label: "1", name: "장비 1 티어", min: 1, max: 10 },
  { key: "equip2", targetKey: "targetEquip2", label: "2", name: "장비 2 티어", min: 1, max: 10 },
  { key: "equip3", targetKey: "targetEquip3", label: "3", name: "장비 3 티어", min: 1, max: 10 },
  { key: "equipSpecial", targetKey: "targetEquipSpecial", label: "애용품", name: "애용품", min: 1, max: 2 },
  {
    key: "abilityHp",
    targetKey: "targetAbilityHp",
    label: "체력",
    name: "능력 개방 체력",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
  },
  {
    key: "abilityAtk",
    targetKey: "targetAbilityAtk",
    label: "공격력",
    name: "능력 개방 공격력",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
  },
  {
    key: "abilityHeal",
    targetKey: "targetAbilityHeal",
    label: "치유력",
    name: "능력 개방 치유력",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
  },
] as const;

export type FieldDefinition = (typeof fieldDefinitions)[number];
export type CurrentFieldKey = FieldDefinition["key"];
export type TargetFieldKey = FieldDefinition["targetKey"];
export type GrowthValues = Record<CurrentFieldKey | TargetFieldKey, number | null>;
export type RelationshipValues = {
  relationshipCurrentLevel: number | null;
  relationshipTargetLevel: number | null;
};

const field = (key: CurrentFieldKey): FieldDefinition => {
  const definition = fieldDefinitions.find((candidate) => candidate.key === key);
  if (!definition) throw new Error(`Unknown growth field: ${key}`);
  return definition;
};

// A cell of a group. Tier and relationship rank are separate inputs, not growth values.
export type GrowthCell = { kind: "tier" } | { kind: "relationship" } | { kind: "field"; field: FieldDefinition };

export type GrowthGroupKey = "basic" | "skill" | "equipment" | "gear" | "ability";

// One field box of the table: the values of one domain side by side, as in the profile edit table.
export type GrowthGroup = {
  key: GrowthGroupKey;
  label: string;
  // The group has no visible heading but still needs a name for screen readers.
  labelHidden?: boolean;
  cells: GrowthCell[];
};

export const GROWTH_GROUPS: GrowthGroup[] = [
  {
    key: "basic",
    label: "기본 정보",
    cells: [
      { kind: "tier" },
      { kind: "field", field: field("level") },
      { kind: "field", field: field("weaponLevel") },
      { kind: "relationship" },
    ],
  },
  {
    key: "skill",
    label: "스킬",
    cells: (["skillEx", "skillNormal", "skillEnhanced", "skillSub"] as const).map((key) => ({
      kind: "field" as const,
      field: field(key),
    })),
  },
  {
    key: "equipment",
    label: "장비 티어",
    cells: (["equip1", "equip2", "equip3"] as const).map((key) => ({ kind: "field" as const, field: field(key) })),
  },
  { key: "gear", label: "애용품", labelHidden: true, cells: [{ kind: "field", field: field("equipSpecial") }] },
  {
    key: "ability",
    label: "능력 개방",
    cells: (["abilityHp", "abilityAtk", "abilityHeal"] as const).map((key) => ({
      kind: "field" as const,
      field: field(key),
    })),
  },
];

export function getGrowthGroup(key: GrowthGroupKey): GrowthGroup {
  const group = GROWTH_GROUPS.find((candidate) => candidate.key === key);
  if (!group) throw new Error(`Unknown growth group: ${key}`);
  return group;
}

// The stacked layout shows one tab at a time, as the profile edit table does. Equipment and the favorite item share one.
export type GrowthTab = { key: "basic" | "skill" | "equipment" | "ability"; label: string; groups: GrowthGroupKey[] };

export const GROWTH_TABS: GrowthTab[] = [
  { key: "basic", label: "기본 정보", groups: ["basic"] },
  { key: "skill", label: "스킬", groups: ["skill"] },
  { key: "equipment", label: "장비", groups: ["equipment", "gear"] },
  { key: "ability", label: "능력 개방", groups: ["ability"] },
];

export function cellLabel(cell: GrowthCell): string {
  if (cell.kind === "tier") return "성급";
  if (cell.kind === "relationship") return "인연";
  return cell.field.label;
}

export function cellName(cell: GrowthCell): string {
  if (cell.kind === "tier") return "성급";
  if (cell.kind === "relationship") return "인연 랭크";
  return cell.field.name;
}

export function cellKey(cell: GrowthCell): string {
  return cell.kind === "field" ? cell.field.key : cell.kind;
}

export const RELATIONSHIP_MIN = 1;
export const RELATIONSHIP_MAX = 100;

export function pickGrowthValues(student: GrowthStudent): GrowthValues {
  return Object.fromEntries(
    fieldDefinitions.flatMap(({ key, targetKey }) => [
      [key, student[key]],
      [targetKey, student[targetKey]],
    ]),
  ) as GrowthValues;
}

export function pickRelationshipValues(student: GrowthStudent): RelationshipValues {
  return {
    relationshipCurrentLevel: student.relationshipCurrentLevel,
    relationshipTargetLevel: student.relationshipTargetLevel,
  };
}

export function isGearField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return key === "equipSpecial" || key === "targetEquipSpecial";
}

function isWeaponLevelField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return key === "weaponLevel" || key === "targetWeaponLevel";
}

function isAbilityReleaseField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return (
    key === "abilityHp" ||
    key === "abilityAtk" ||
    key === "abilityHeal" ||
    key === "targetAbilityHp" ||
    key === "targetAbilityAtk" ||
    key === "targetAbilityHeal"
  );
}

// A tier without the exclusive weapon (★5 or lower) has no weapon level and no ability release.
export function isFieldDisabledByTier(key: CurrentFieldKey | TargetFieldKey, tier: number): boolean {
  return (isAbilityReleaseField(key) || isWeaponLevelField(key)) && tier <= 5;
}

export function getFieldMax(key: CurrentFieldKey | TargetFieldKey, fallbackMax: number, tier: number): number {
  return isWeaponLevelField(key) ? getWeaponLevelMaxByTier(tier) : fallbackMax;
}

export function getClientValidationError(
  values: GrowthValues,
  currentTier: number,
  targetTier: number | null,
): string | null {
  for (const { key, targetKey, name, min, max } of fieldDefinitions) {
    const current = values[key];
    const target = values[targetKey];
    const currentMax = getFieldMax(key, max, currentTier);
    const effectiveTargetTier = targetTier ?? currentTier;
    const targetMax = getFieldMax(targetKey, max, effectiveTargetTier);
    if (isAbilityReleaseField(key) && isFieldDisabledByTier(key, currentTier) && (current ?? 0) > 0) {
      return "능력 개방은 고유무기 장착 후 입력할 수 있어요";
    }
    if (
      isAbilityReleaseField(targetKey) &&
      isFieldDisabledByTier(targetKey, effectiveTargetTier) &&
      (target ?? 0) > 0
    ) {
      return "능력 개방 목표값은 고유무기 장착 후 입력할 수 있어요";
    }
    if (current != null && (current < min || current > currentMax)) {
      return `${name}은(는) ${min}부터 ${currentMax} 사이만 입력할 수 있어요`;
    }
    if (target != null && (target < min || target > targetMax)) {
      return `${name} 목표값은 ${min}부터 ${targetMax} 사이만 입력할 수 있어요`;
    }
  }
  return null;
}

export function normalizeTargetValuesForTier(values: GrowthValues, tier: number): GrowthValues {
  const nextValues = { ...values };
  const weaponLevelMax = getWeaponLevelMaxByTier(tier);
  if (nextValues.targetWeaponLevel != null && nextValues.targetWeaponLevel > weaponLevelMax) {
    nextValues.targetWeaponLevel = weaponLevelMax;
  }
  if (tier <= 5) {
    nextValues.targetAbilityHp = null;
    nextValues.targetAbilityAtk = null;
    nextValues.targetAbilityHeal = null;
  }
  return nextValues;
}

// The equipment part names, such as 신발 · 헤어핀 · 시계, for the equipment tier columns.
export function getEquipmentLabels(student: Pick<GrowthStudent, "equipments">): [string, string, string] {
  return [0, 1, 2].map((index) => EQUIPMENT_TYPE_LABELS[student.equipments[index]] ?? "") as [string, string, string];
}
