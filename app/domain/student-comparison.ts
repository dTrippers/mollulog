import {
  calculateStudentStats,
  getEquipmentSlotUnlockLevel,
  type StudentCalculatedStat,
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  type StudentCalculatorState,
  selectStudentSkills,
} from "~/domain/student-calculator";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import type { StudentCatalogStat } from "~/graphql/graphql";

export type StudentComparisonSide = "left" | "right";

export type StudentComparisonSettings = {
  level: number;
  tier: number;
  bond: number;
  equipmentTier: number | null;
  includeSkillEffects: boolean;
};

export type StudentComparisonSettingField = keyof StudentComparisonSettings;

export const DEFAULT_STUDENT_COMPARISON_SETTINGS: StudentComparisonSettings = {
  level: 90,
  tier: 7,
  bond: 100,
  equipmentTier: null,
  includeSkillEffects: false,
};

export const STUDENT_COMPARISON_STATS = [
  {
    title: "주요 능력치",
    stats: [
      { stat: "MAX_HP" as StudentCatalogStat, label: "최대 체력" },
      { stat: "ATTACK_POWER" as StudentCatalogStat, label: "공격력" },
      { stat: "DEFENSE_POWER" as StudentCatalogStat, label: "방어력" },
      { stat: "HEAL_POWER" as StudentCatalogStat, label: "치유력" },
    ],
  },
  {
    title: "전투 보조 능력치",
    stats: [
      { stat: "ACCURACY_POINT" as StudentCatalogStat, label: "명중 수치" },
      { stat: "DODGE_POINT" as StudentCatalogStat, label: "회피 수치" },
      { stat: "CRITICAL_POINT" as StudentCatalogStat, label: "치명 수치" },
      { stat: "STABILITY_POINT" as StudentCatalogStat, label: "안정 수치" },
    ],
  },
] as const;

export type StudentComparisonStats = {
  left: number | undefined;
  right: number | undefined;
  largerSide: StudentComparisonSide | null;
  difference: number | null;
};

export type StudentComparisonEquipmentStatus = {
  slot: number;
  category: string | null;
  label: string;
  tier: number | null;
  status: "applied" | "locked" | "unsupported" | "missing";
  unlockLevel: number;
};

type StudentComparisonSettingsResult = {
  settings: StudentComparisonSettings | null;
  invalidFields: StudentComparisonSettingField[];
};

function settingKey(side: StudentComparisonSide, field: StudentComparisonSettingField): string {
  return `${side}.${field}`;
}

function parseIntegerSetting(
  params: URLSearchParams,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): number | null {
  if (!params.has(key)) return defaultValue;
  const raw = params.get(key);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

export function parseStudentComparisonSettings(
  params: URLSearchParams,
  side: StudentComparisonSide,
): StudentComparisonSettingsResult {
  const fields: StudentComparisonSettingField[] = [];
  const level = parseIntegerSetting(params, settingKey(side, "level"), 90, 1, 90);
  const tier = parseIntegerSetting(params, settingKey(side, "tier"), 7, 1, 9);
  const bond = parseIntegerSetting(params, settingKey(side, "bond"), 100, 1, 100);

  if (level === null) fields.push("level");
  if (tier === null) fields.push("tier");
  if (bond === null) fields.push("bond");

  let equipmentTier: number | null = null;
  const equipmentTierKey = settingKey(side, "equipmentTier");
  if (params.has(equipmentTierKey)) {
    const raw = params.get(equipmentTierKey);
    if (raw !== "max") {
      const parsed = raw === null || !/^\d+$/.test(raw) ? null : Number(raw);
      if (parsed === null || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10) {
        fields.push("equipmentTier");
      } else {
        equipmentTier = parsed;
      }
    }
  }

  let includeSkillEffects = false;
  const skillEffectsKey = settingKey(side, "includeSkillEffects");
  if (params.has(skillEffectsKey)) {
    const raw = params.get(skillEffectsKey);
    if (raw === "true") includeSkillEffects = true;
    else if (raw !== "false") fields.push("includeSkillEffects");
  }

  if (fields.length > 0 || level === null || tier === null || bond === null) {
    return { settings: null, invalidFields: fields };
  }

  return {
    settings: { level, tier, bond, equipmentTier, includeSkillEffects },
    invalidFields: [],
  };
}

export function getStudentComparisonSettingsErrors(
  student: Pick<StudentCalculatorSource, "initialTier">,
  settings: StudentComparisonSettings,
): string[] {
  const errors: string[] = [];
  if (settings.tier < student.initialTier) errors.push("신비 해방 단계가 학생의 초기 성급보다 낮아요.");
  return errors;
}

export function getStudentComparisonEquipmentMaxTier(
  student: Pick<StudentCalculatorSource, "equipments">,
  catalog: StudentCalculatorCatalog,
): number {
  const tiers = student.equipments.flatMap((category) =>
    catalog.equipment.filter((equipment) => equipment.category === category).map((equipment) => equipment.tier),
  );
  return Math.max(1, ...tiers);
}

export function getStudentComparisonEquipmentStatus(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  settings: StudentComparisonSettings,
  labels: Readonly<Record<string, string>>,
): StudentComparisonEquipmentStatus[] {
  return [0, 1, 2].map((index) => {
    const category = student.equipments[index] ?? null;
    const unlockLevel = getEquipmentSlotUnlockLevel(index);
    const label = category ? (labels[category] ?? "장비") : "장비";
    const tiers = category
      ? catalog.equipment.filter((equipment) => equipment.category === category).map((equipment) => equipment.tier)
      : [];
    const tier = category
      ? settings.equipmentTier === null
        ? Math.max(0, ...tiers) || null
        : settings.equipmentTier
      : null;

    if (category === null || tiers.length === 0) {
      return { slot: index + 1, category, label, tier, status: "missing", unlockLevel };
    }
    if (settings.level < unlockLevel) {
      return { slot: index + 1, category, label, tier, status: "locked", unlockLevel };
    }
    if (
      tier === null ||
      !catalog.equipment.some((equipment) => equipment.category === category && equipment.tier === tier)
    ) {
      return { slot: index + 1, category, label, tier, status: "unsupported", unlockLevel };
    }
    return { slot: index + 1, category, label, tier, status: "applied", unlockLevel };
  });
}

export function buildStudentComparisonCalculatorState(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  settings: StudentComparisonSettings,
): StudentCalculatorState {
  const equipmentTierForSlot = (index: number): number | null => {
    const category = student.equipments[index];
    if (!category) return null;
    if (settings.equipmentTier !== null) return settings.equipmentTier;
    const tiers = catalog.equipment
      .filter((equipment) => equipment.category === category)
      .map((equipment) => equipment.tier);
    return Math.max(0, ...tiers) || null;
  };

  const maxGearTier = student.catalog?.gear ? Math.max(0, ...student.catalog.gear.tiers.map((tier) => tier.tier)) : 0;
  const initialState: StudentCalculatorState = {
    level: settings.level,
    tier: settings.tier,
    bond: settings.bond,
    skillEx: 1,
    skillNormal: 1,
    skillEnhanced: 1,
    skillSub: 1,
    equip1: equipmentTierForSlot(0),
    equip2: equipmentTierForSlot(1),
    equip3: equipmentTierForSlot(2),
    equip1Level: null,
    equip2Level: null,
    equip3Level: null,
    equipSpecial: maxGearTier,
    weaponLevel: getWeaponLevelMaxByTier(settings.tier),
    abilityHp: 25,
    abilityAtk: 25,
    abilityHeal: 25,
  };

  const maxSkillLevelBySlot = new Map<string, number>();
  for (const skill of selectStudentSkills(student, initialState)) {
    maxSkillLevelBySlot.set(skill.slot, Math.max(skill.maxLevel, maxSkillLevelBySlot.get(skill.slot) ?? 1));
  }

  return {
    ...initialState,
    skillEx: maxSkillLevelBySlot.get("ex") ?? 1,
    skillNormal: maxSkillLevelBySlot.get("public") ?? 1,
    skillEnhanced: maxSkillLevelBySlot.get("passive") ?? 1,
    skillSub: maxSkillLevelBySlot.get("extra_passive") ?? 1,
    weaponLevel: getWeaponLevelMaxByTier(settings.tier),
    abilityHp: settings.level >= 90 && settings.tier > 5 ? 25 : 0,
    abilityAtk: settings.level >= 90 && settings.tier > 5 ? 25 : 0,
    abilityHeal: settings.level >= 90 && settings.tier > 5 ? 25 : 0,
  };
}

export function calculateStudentComparisonStats(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  settings: StudentComparisonSettings,
): StudentCalculatedStat[] {
  const state = buildStudentComparisonCalculatorState(student, catalog, settings);
  return calculateStudentStats(student, catalog, state, [], settings.includeSkillEffects);
}

export function compareStudentStats(left: number | undefined, right: number | undefined): StudentComparisonStats {
  if (left === undefined || right === undefined || left === right) {
    return { left, right, largerSide: null, difference: null };
  }
  return left > right
    ? { left, right, largerSide: "left", difference: left - right }
    : { left, right, largerSide: "right", difference: right - left };
}
