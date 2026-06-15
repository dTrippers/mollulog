import { ABILITY_RELEASE_MAX_LEVEL, WEAPON_LEVEL_MAX_LEVEL } from "./student-growth-state";

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
