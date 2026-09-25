import {
  calculateStudentStats,
  getAbilityReleaseDisabledReason,
  resolveStudentCalculatorState,
  type StudentCalculatedStat,
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  type StudentCalculatorState,
  selectStudentSkills,
} from "~/domain/student-calculator";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import { StudentCatalogStat, StudentTerrainAdaptationRank } from "~/graphql/graphql";

export type StudentComparisonSide = "left" | "right";

export type StudentComparisonSettings = {
  level: StudentCalculatorState["level"];
  tier: StudentCalculatorState["tier"];
  bond: StudentCalculatorState["bond"];
  skillEx: StudentCalculatorState["skillEx"];
  skillNormal: StudentCalculatorState["skillNormal"];
  skillEnhanced: StudentCalculatorState["skillEnhanced"];
  skillSub: StudentCalculatorState["skillSub"];
  equip1: StudentCalculatorState["equip1"];
  equip2: StudentCalculatorState["equip2"];
  equip3: StudentCalculatorState["equip3"];
  equip1Level: StudentCalculatorState["equip1Level"];
  equip2Level: StudentCalculatorState["equip2Level"];
  equip3Level: StudentCalculatorState["equip3Level"];
  equipSpecial: StudentCalculatorState["equipSpecial"];
  weaponLevel: StudentCalculatorState["weaponLevel"];
  abilityHp: StudentCalculatorState["abilityHp"];
  abilityAtk: StudentCalculatorState["abilityAtk"];
  abilityHeal: StudentCalculatorState["abilityHeal"];
};

export type StudentComparisonSettingField = keyof StudentComparisonSettings;

export const STUDENT_COMPARISON_GROWTH_FIELDS = [
  "level",
  "tier",
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
  "weaponLevel",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
] as const satisfies readonly (keyof StudentCalculatorState)[];

export const STUDENT_COMPARISON_SETTING_FIELDS = STUDENT_COMPARISON_GROWTH_FIELDS;

export const DEFAULT_STUDENT_COMPARISON_SETTINGS: StudentComparisonSettings = {
  level: 90,
  tier: 7,
  bond: 100,
  skillEx: null,
  skillNormal: null,
  skillEnhanced: null,
  skillSub: null,
  equip1: null,
  equip2: null,
  equip3: null,
  equip1Level: null,
  equip2Level: null,
  equip3Level: null,
  equipSpecial: null,
  weaponLevel: 40,
  abilityHp: 25,
  abilityAtk: 25,
  abilityHeal: 25,
};

export function getStudentComparisonSettingsAfterTierChange(
  settings: StudentComparisonSettings,
  tier: number,
): StudentComparisonSettings {
  if (tier <= 5) {
    return { ...settings, tier, weaponLevel: 0, abilityHp: 0, abilityAtk: 0, abilityHeal: 0 };
  }
  const weaponLevelMax = getWeaponLevelMaxByTier(tier);
  const weaponLevel = settings.weaponLevel;
  return {
    ...settings,
    tier,
    weaponLevel: weaponLevel === null || weaponLevel <= 0 ? 1 : Math.min(weaponLevel, weaponLevelMax),
  };
}

const settingRanges: Record<(typeof STUDENT_COMPARISON_GROWTH_FIELDS)[number], { min: number; max: number }> = {
  level: { min: 1, max: 90 },
  tier: { min: 1, max: 9 },
  bond: { min: 1, max: 100 },
  skillEx: { min: 1, max: 5 },
  skillNormal: { min: 1, max: 10 },
  skillEnhanced: { min: 1, max: 10 },
  skillSub: { min: 1, max: 10 },
  equip1: { min: 1, max: 10 },
  equip2: { min: 1, max: 10 },
  equip3: { min: 1, max: 10 },
  equip1Level: { min: 1, max: 70 },
  equip2Level: { min: 1, max: 70 },
  equip3Level: { min: 1, max: 70 },
  equipSpecial: { min: 0, max: 2 },
  weaponLevel: { min: 0, max: 60 },
  abilityHp: { min: 0, max: 25 },
  abilityAtk: { min: 0, max: 25 },
  abilityHeal: { min: 0, max: 25 },
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
    title: "명중·치명",
    stats: [
      { stat: "ACCURACY_POINT" as StudentCatalogStat, label: "명중 수치" },
      { stat: "DODGE_POINT" as StudentCatalogStat, label: "회피 수치" },
      { stat: "CRITICAL_POINT" as StudentCatalogStat, label: "치명 수치" },
      { stat: StudentCatalogStat.CriticalChanceResistPoint, label: "치명 저항 수치" },
      { stat: StudentCatalogStat.CriticalDamageRate, label: "치명 대미지 강화" },
      { stat: StudentCatalogStat.CriticalDamageResistRate, label: "치명 대미지 저항" },
      { stat: "STABILITY_POINT" as StudentCatalogStat, label: "안정 수치" },
      { stat: StudentCatalogStat.StabilityRate, label: "안정성" },
    ],
  },
  {
    title: "방어·회복",
    stats: [
      { stat: StudentCatalogStat.DefensePenetration, label: "방어력 관통" },
      { stat: StudentCatalogStat.BlockRate, label: "블록률" },
      { stat: StudentCatalogStat.HealEffectivenessRate, label: "치유 효과" },
      { stat: StudentCatalogStat.DamageRatio, label: "피해 비율" },
      { stat: StudentCatalogStat.DamagedRatio, label: "피해 받는 비율" },
    ],
  },
  {
    title: "행동·코스트",
    stats: [
      { stat: StudentCatalogStat.Range, label: "일반 공격 사거리" },
      { stat: StudentCatalogStat.AmmoCount, label: "탄약 수" },
      { stat: StudentCatalogStat.AmmoCost, label: "탄약 소모" },
      { stat: StudentCatalogStat.RegenCost, label: "코스트 회복력" },
      { stat: StudentCatalogStat.MoveSpeed, label: "이동 속도" },
    ],
  },
] as const;

export const STUDENT_COMPARISON_TERRAINS = [
  { key: "street", label: "시가지", stat: StudentCatalogStat.StreetBattleAdaptation },
  { key: "outdoor", label: "야외", stat: StudentCatalogStat.OutdoorBattleAdaptation },
  { key: "indoor", label: "실내", stat: StudentCatalogStat.IndoorBattleAdaptation },
] as const;

export type StudentComparisonTerrain = {
  key: (typeof STUDENT_COMPARISON_TERRAINS)[number]["key"];
  label: string;
  rank: StudentTerrainAdaptationRank | null;
};

export type StudentComparisonStats = {
  left: number | undefined;
  right: number | undefined;
  largerSide: StudentComparisonSide | null;
  difference: number | null;
};

const TERRAIN_RANKS: readonly StudentTerrainAdaptationRank[] = [
  StudentTerrainAdaptationRank.D,
  StudentTerrainAdaptationRank.C,
  StudentTerrainAdaptationRank.B,
  StudentTerrainAdaptationRank.A,
  StudentTerrainAdaptationRank.S,
  StudentTerrainAdaptationRank.Ss,
];

export function getStudentComparisonTerrainAdaptations(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  settings: StudentComparisonSettings,
): StudentComparisonTerrain[] {
  const base = student.catalog?.terrainAdaptations;
  if (!base) {
    return STUDENT_COMPARISON_TERRAINS.map(({ key, label }) => ({ key, label, rank: null }));
  }
  const state = resolveStudentCalculatorState(student, settings as StudentCalculatorState, catalog);
  const activeModifiers =
    state.weaponStar > 0 && state.weaponLevel > 0
      ? (student.catalog?.weapon.stages ?? [])
          .filter((stage) => stage.unlocked && stage.stage <= state.weaponStar)
          .flatMap((stage) => stage.modifiers)
      : [];

  return STUDENT_COMPARISON_TERRAINS.map(({ key, label, stat }) => {
    const baseRank = base[key];
    const rankIndex = TERRAIN_RANKS.indexOf(baseRank);
    if (rankIndex < 0) return { key, label, rank: null };
    const rankIncrease = activeModifiers
      .filter((modifier) => modifier.stat === stat)
      .reduce((sum, modifier) => sum + modifier.value, 0);
    const clampedIndex = Math.max(0, Math.min(TERRAIN_RANKS.length - 1, rankIndex + rankIncrease));
    return { key, label, rank: TERRAIN_RANKS[clampedIndex] ?? null };
  });
}

type StudentComparisonSettingsResult = {
  settings: StudentComparisonSettings | null;
  invalidFields: StudentComparisonSettingField[];
};

function settingKey(side: StudentComparisonSide, field: StudentComparisonSettingField): string {
  return `${side}.${field}`;
}

export function getDefaultStudentComparisonSettings(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
): StudentComparisonSettings {
  const equipmentForSlot = (index: number) => {
    const category = student.equipments[index];
    const equipment = category
      ? catalog.equipment
          .filter((candidate) => candidate.category === category)
          .sort((left, right) => right.tier - left.tier)[0]
      : undefined;
    return equipment ?? null;
  };
  const firstEquipment = equipmentForSlot(0);
  const secondEquipment = equipmentForSlot(1);
  const thirdEquipment = equipmentForSlot(2);
  const availableGearTiers = student.catalog?.gear?.tiers.filter((tier) => tier.openFavorLevel <= 100) ?? [];
  const maxGearTier = availableGearTiers.length > 0 ? Math.max(...availableGearTiers.map((tier) => tier.tier)) : null;
  const initialState: StudentCalculatorState = {
    ...DEFAULT_STUDENT_COMPARISON_SETTINGS,
    skillEx: 1,
    skillNormal: 1,
    skillEnhanced: 1,
    skillSub: 1,
    equip1: firstEquipment?.tier ?? null,
    equip2: secondEquipment?.tier ?? null,
    equip3: thirdEquipment?.tier ?? null,
    equip1Level: firstEquipment?.maxLevel ?? null,
    equip2Level: secondEquipment?.maxLevel ?? null,
    equip3Level: thirdEquipment?.maxLevel ?? null,
    equipSpecial: maxGearTier,
    weaponLevel: getWeaponLevelMaxByTier(7),
    abilityHp: 25,
    abilityAtk: 25,
    abilityHeal: 25,
  };
  const maxSkillLevelBySlot = new Map<string, number>();
  for (const skill of selectStudentSkills(student, initialState)) {
    maxSkillLevelBySlot.set(skill.slot, Math.max(skill.maxLevel, maxSkillLevelBySlot.get(skill.slot) ?? 1));
  }
  const abilityReleaseAvailable = getAbilityReleaseDisabledReason(7, 90) === null;

  return {
    ...initialState,
    skillEx: maxSkillLevelBySlot.get("ex") ?? null,
    skillNormal: maxSkillLevelBySlot.get("public") ?? null,
    skillEnhanced: maxSkillLevelBySlot.get("passive") ?? null,
    skillSub: maxSkillLevelBySlot.get("extra_passive") ?? null,
    weaponLevel: student.catalog?.weapon ? getWeaponLevelMaxByTier(7) : null,
    abilityHp: abilityReleaseAvailable ? 25 : 0,
    abilityAtk: abilityReleaseAvailable ? 25 : 0,
    abilityHeal: abilityReleaseAvailable ? 25 : 0,
  };
}

export function parseStudentComparisonSettings(
  params: URLSearchParams,
  side: StudentComparisonSide,
  defaults: StudentComparisonSettings = DEFAULT_STUDENT_COMPARISON_SETTINGS,
): StudentComparisonSettingsResult {
  const fields: StudentComparisonSettingField[] = [];
  const settings = { ...defaults };
  for (const field of STUDENT_COMPARISON_GROWTH_FIELDS) {
    const key = settingKey(side, field);
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (raw === "none") {
      settings[field] = null;
      continue;
    }
    const range = settingRanges[field];
    if (raw === null || !/^\d+$/.test(raw)) {
      fields.push(field);
      continue;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < range.min || value > range.max) {
      fields.push(field);
      continue;
    }
    settings[field] = value;
  }

  if (fields.length > 0) {
    return { settings: null, invalidFields: fields };
  }

  return { settings, invalidFields: [] };
}

export function stripLegacyStudentComparisonSkillEffectParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("left.includeSkillEffects");
  next.delete("right.includeSkillEffects");
  return next;
}

export function getStudentComparisonSettingsErrors(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  settings: StudentComparisonSettings,
): string[] {
  const errors: string[] = [];
  if (settings.level === null) errors.push("레벨 설정을 확인해 주세요.");
  if (settings.tier === null) errors.push("신비 해방 설정을 확인해 주세요.");
  if (settings.bond === null) errors.push("인연 랭크 설정을 확인해 주세요.");
  if (settings.tier !== null && settings.tier < student.initialTier)
    errors.push("신비 해방 단계가 학생의 초기 성급보다 낮아요.");

  const selectedSkills = selectStudentSkills(student, settings);
  const skillFields = [
    ["skillEx", "ex"],
    ["skillNormal", "public"],
    ["skillEnhanced", "passive"],
    ["skillSub", "extra_passive"],
  ] as const;
  const missingConfiguredSkillFields = skillFields.filter(
    ([field, slot]) => settings[field] !== null && !selectedSkills.some((skill) => skill.slot === slot),
  );
  if (selectedSkills.length === 0 && missingConfiguredSkillFields.length === 0) {
    errors.push("스킬 자료가 없어 스킬 효과를 계산할 수 없어요.");
  }
  for (const [field, slot] of skillFields) {
    const level = settings[field];
    if (level === null) continue;
    const skillsForSlot = selectedSkills.filter((skill) => skill.slot === slot);
    if (skillsForSlot.length === 0) {
      errors.push(`${getSkillLevelLabel(slot)} 자료가 없어 설정을 적용할 수 없어요.`);
      continue;
    }
    const max = Math.max(...skillsForSlot.map((skill) => skill.maxLevel));
    if (max <= 0) {
      errors.push(`${getSkillLevelLabel(slot)} 최대 레벨 자료가 없어요.`);
      continue;
    }
    if (level > max) errors.push(`${getSkillLevelLabel(slot)} 최대 레벨은 ${max}이에요.`);
  }

  const gearFields = ["equip1", "equip2", "equip3"] as const;
  const gearLevelFields = ["equip1Level", "equip2Level", "equip3Level"] as const;
  for (const [index, field] of gearFields.entries()) {
    const category = student.equipments[index] ?? null;
    const tier = settings[field];
    const level = settings[gearLevelFields[index]];
    if (tier === null) continue;
    if (!category) {
      errors.push(`${EQUIPMENT_LABELS[index]} 자료가 없어 선택한 티어를 적용할 수 없어요.`);
      continue;
    }
    const equipment = catalog.equipment.find((candidate) => candidate.category === category && candidate.tier === tier);
    if (!equipment) {
      errors.push(`${EQUIPMENT_LABELS[index]} T${tier} 자료를 찾을 수 없어요.`);
      continue;
    }
    if (level !== null && equipment && level > equipment.maxLevel) {
      errors.push(`${EQUIPMENT_LABELS[index]} 레벨은 선택한 장비의 최대 레벨 ${equipment.maxLevel}을 넘을 수 없어요.`);
    }
  }

  if (
    settings.equipSpecial !== null &&
    settings.equipSpecial > 0 &&
    !student.catalog?.gear?.tiers.some((tier) => tier.tier === settings.equipSpecial)
  ) {
    errors.push("애용품 단계 자료를 찾을 수 없어요.");
  }
  if (settings.tier !== null && settings.tier > 5 && (settings.weaponLevel === null || settings.weaponLevel === 0)) {
    errors.push("고유무기 레벨을 1 이상 설정해 주세요.");
  }
  if (settings.tier !== null && settings.tier > 5 && settings.level !== null && settings.level >= 90) {
    const abilityReleaseFields = [
      ["abilityHp", "체력"],
      ["abilityAtk", "공격력"],
      ["abilityHeal", "치유력"],
    ] as const;
    for (const [field, label] of abilityReleaseFields) {
      if (settings[field] === null) errors.push(`능력 개방 ${label} 설정을 확인해 주세요.`);
    }
  }
  const weaponMax = getWeaponLevelMaxByTier(settings.tier);
  if (settings.weaponLevel !== null && settings.weaponLevel > weaponMax) {
    errors.push(`고유무기 레벨은 현재 성급에서 ${weaponMax}까지 설정할 수 있어요.`);
  }
  return errors;
}

const EQUIPMENT_LABELS = ["첫 번째 장비", "두 번째 장비", "세 번째 장비"] as const;

function getSkillLevelLabel(slot: "ex" | "public" | "passive" | "extra_passive"): string {
  return { ex: "EX 스킬", public: "기본 스킬", passive: "강화 스킬", extra_passive: "서브 스킬" }[slot];
}

export function getStudentComparisonEquipmentMaxTier(
  student: Pick<StudentCalculatorSource, "equipments">,
  catalog: StudentCalculatorCatalog,
  slotIndex?: number,
): number {
  const categories = slotIndex === undefined ? student.equipments : [student.equipments[slotIndex]];
  const tiers = categories.flatMap((category) =>
    catalog.equipment.filter((equipment) => equipment.category === category).map((equipment) => equipment.tier),
  );
  return Math.max(1, ...tiers);
}

export function resolveImportedStudentComparisonSettings(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  savedState: StudentCalculatorState,
): StudentComparisonSettings {
  const state = resolveStudentCalculatorState(student, savedState, catalog);
  return {
    level: state.level,
    tier: state.tier,
    bond: state.bond,
    skillEx: state.skillEx,
    skillNormal: state.skillNormal,
    skillEnhanced: state.skillEnhanced,
    skillSub: state.skillSub,
    equip1: state.equip1,
    equip2: state.equip2,
    equip3: state.equip3,
    equip1Level: state.equip1Level,
    equip2Level: state.equip2Level,
    equip3Level: state.equip3Level,
    equipSpecial: state.equipSpecial,
    weaponLevel: state.weaponLevel,
    abilityHp: state.abilityHp,
    abilityAtk: state.abilityAtk,
    abilityHeal: state.abilityHeal,
  };
}

export function calculateStudentComparisonStats(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  settings: StudentComparisonSettings,
): StudentCalculatedStat[] {
  const errors = getStudentComparisonSettingsErrors(student, catalog, settings);
  if (errors.length > 0) throw new Error(errors.join(" "));
  return calculateStudentStats(student, catalog, settings, [], true);
}

export function compareStudentStats(left: number | undefined, right: number | undefined): StudentComparisonStats {
  if (left === undefined || right === undefined || left === right) {
    return { left, right, largerSide: null, difference: null };
  }
  return left > right
    ? { left, right, largerSide: "left", difference: left - right }
    : { left, right, largerSide: "right", difference: right - left };
}
