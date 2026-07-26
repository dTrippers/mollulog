import type {
  StudentCatalogStat,
  StudentCatalogStatGrowthType,
  StudentCatalogStatModifierKind,
  StudentDetailQuery,
  StudentSkillTypeEnum,
} from "~/graphql/graphql";
import { StudentSkillModifierActivation, StudentSkillModifierPersistence } from "~/graphql/graphql";

export type StudentCalculatorSource = Pick<
  NonNullable<StudentDetailQuery["student"]>,
  "uid" | "name" | "initialTier" | "attackType" | "equipments" | "catalog" | "skills" | "character" | "studentVariant"
>;
export type StudentCalculatorCatalog = NonNullable<StudentDetailQuery["studentCatalog"]>;

export type StudentCalculatorState = {
  level: number | null;
  tier: number | null;
  bond: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  weaponLevel: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
};

export type ResolvedStudentCalculatorState = {
  level: number;
  tier: number;
  bond: number;
  skillEx: number;
  skillNormal: number;
  skillEnhanced: number;
  skillSub: number;
  equip1: number;
  equip2: number;
  equip3: number;
  equipSpecial: number;
  weaponStar: number;
  weaponLevel: number;
  abilityHp: number;
  abilityAtk: number;
  abilityHeal: number;
};

export type StudentCalculatedStat = {
  stat: StudentCatalogStat;
  value: number;
};

export type RelatedStudentFavorState = {
  favorRewards: NonNullable<StudentCalculatorSource["catalog"]>["favorRewards"];
  bond: number | null;
};

export type StudentSkillDescriptionPart = {
  key: string;
  text: string;
  dynamic: boolean;
  emphasized: boolean;
};

export type SelectedStudentSkill = StudentCalculatorSource["skills"][number] & {
  slot: StudentSkillTypeEnum;
  position: number;
  selectedLevel: number;
};

type StatModifier = {
  stat: StudentCatalogStat;
  kind: StudentCatalogStatModifierKind;
  value: number;
};

export function roundAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function resolveStudentCalculatorState(
  student: Pick<StudentCalculatorSource, "initialTier">,
  state: StudentCalculatorState,
): ResolvedStudentCalculatorState {
  const tier = clampInteger(state.tier ?? student.initialTier, student.initialTier, 9);
  const weaponStar = Math.max(0, tier - 5);
  const weaponLevelMax = weaponStar === 0 ? 0 : 20 + weaponStar * 10;

  return {
    level: clampInteger(state.level ?? 1, 1, 90),
    tier,
    bond: clampInteger(state.bond ?? 1, 1, 100),
    skillEx: clampInteger(state.skillEx ?? 1, 1, 5),
    skillNormal: clampInteger(state.skillNormal ?? 1, 1, 10),
    skillEnhanced: clampInteger(state.skillEnhanced ?? 1, 1, 10),
    skillSub: clampInteger(state.skillSub ?? 1, 1, 10),
    equip1: clampInteger(state.equip1 ?? 1, 1, 10),
    equip2: clampInteger(state.equip2 ?? 1, 1, 10),
    equip3: clampInteger(state.equip3 ?? 1, 1, 10),
    equipSpecial: clampInteger(state.equipSpecial ?? 0, 0, 2),
    weaponStar,
    weaponLevel: weaponLevelMax === 0 ? 0 : clampInteger(state.weaponLevel ?? 1, 1, weaponLevelMax),
    abilityHp: clampInteger(state.abilityHp ?? 0, 0, 25),
    abilityAtk: clampInteger(state.abilityAtk ?? 0, 0, 25),
    abilityHeal: clampInteger(state.abilityHeal ?? 0, 0, 25),
  };
}

export function calculateStudentStats(
  student: StudentCalculatorSource,
  catalog: StudentCalculatorCatalog,
  input: StudentCalculatorState,
  relatedFavorStates: readonly RelatedStudentFavorState[] = [],
): StudentCalculatedStat[] {
  if (!student.catalog) return [];

  const state = resolveStudentCalculatorState(student, input);
  const stats = new Map<StudentCatalogStat, number>();
  const coefficientRates = new Map<StudentCatalogStat, number>();
  const growthType = student.catalog.statProfile.growthType;

  for (const levelStat of student.catalog.statProfile.levelStats) {
    stats.set(
      levelStat.stat,
      interpolateLevelStat(levelStat.level1, levelStat.level100, growthType, state.level, catalog),
    );
  }
  for (const fixedStat of student.catalog.statProfile.fixedStats) {
    stats.set(fixedStat.stat, fixedStat.value);
  }

  const potentialLevels = new Map<StudentCatalogStat, number>([
    ["MAX_HP" as StudentCatalogStat, state.abilityHp],
    ["ATTACK_POWER" as StudentCatalogStat, state.abilityAtk],
    ["HEAL_POWER" as StudentCatalogStat, state.abilityHeal],
  ]);
  for (const [stat, currentValue] of stats) {
    const starRate = student.catalog.starBonuses
      .filter((bonus) => bonus.star <= Math.min(state.tier, 5))
      .flatMap((bonus) => bonus.modifiers)
      .filter((modifier) => modifier.stat === stat)
      .reduce((sum, modifier) => sum + modifier.value, 0);
    const selectedPotentialLevel = potentialLevels.get(stat) ?? 0;
    const potential = student.catalog.potentialBonuses.find((bonus) => bonus.stat === stat);
    const potentialRate = potential?.levels.find((level) => level.level === selectedPotentialLevel)?.rate ?? 0;
    if (starRate !== 0 || potentialRate !== 0) {
      stats.set(stat, currentValue + Math.ceil((currentValue * (starRate + potentialRate)) / 10_000));
    }
  }

  const equipmentTiers = [state.equip1, state.equip2, state.equip3];
  student.equipments.forEach((category, index) => {
    const selectedTier = equipmentTiers[index];
    const equipment = catalog.equipment.find(
      (candidate) => candidate.category === category && candidate.tier === selectedTier,
    );
    if (!equipment) return;
    applyModifiers(
      stats,
      coefficientRates,
      equipment.modifiers.map((modifier) => ({
        stat: modifier.stat,
        kind: modifier.kind,
        value: modifier.levelMax,
      })),
    );
  });

  if (student.catalog.gear && state.equipSpecial > 0) {
    const selectedGearTier = student.catalog.gear.tiers.find((tier) => tier.tier === state.equipSpecial);
    if (selectedGearTier) {
      applyModifiers(
        stats,
        coefficientRates,
        selectedGearTier.modifiers.map((modifier) => ({
          stat: modifier.stat,
          kind: modifier.kind,
          value: modifier.levelMax,
        })),
      );
    }
  }

  applyModifiers(
    stats,
    coefficientRates,
    student.catalog.favorRewards.filter((reward) => reward.level <= state.bond).flatMap((reward) => reward.modifiers),
  );
  for (const relatedFavor of relatedFavorStates) {
    const bond = clampInteger(relatedFavor.bond ?? 1, 1, 100);
    applyModifiers(
      stats,
      coefficientRates,
      relatedFavor.favorRewards.filter((reward) => reward.level <= bond).flatMap((reward) => reward.modifiers),
    );
  }

  if (state.weaponStar > 0 && state.weaponLevel > 0) {
    for (const levelStat of student.catalog.weapon.levelStats) {
      const value = interpolateLevelStat(
        levelStat.level1,
        levelStat.level100,
        student.catalog.weapon.growthType,
        state.weaponLevel,
        catalog,
      );
      stats.set(levelStat.stat, (stats.get(levelStat.stat) ?? 0) + value);
    }
    applyModifiers(
      stats,
      coefficientRates,
      student.catalog.weapon.stages
        .filter((stage) => stage.unlocked && stage.stage <= state.weaponStar)
        .flatMap((stage) => stage.modifiers),
    );
  }

  const permanentSkillModifiers = selectStudentSkills(student, input).flatMap((skill) =>
    (skill.levels.find((level) => level.level === skill.selectedLevel)?.statModifiers ?? [])
      .filter(
        (modifier) =>
          modifier.activation === StudentSkillModifierActivation.Unconditional &&
          modifier.persistence === StudentSkillModifierPersistence.Permanent,
      )
      .map((modifier) => ({ stat: modifier.stat, kind: modifier.kind, value: modifier.value })),
  );
  applyModifiers(stats, coefficientRates, permanentSkillModifiers);
  applyCoefficientModifiers(stats, coefficientRates);

  return [...stats.entries()].map(([stat, value]) => ({ stat, value: Math.round(value) }));
}

export function selectStudentSkills(
  student: StudentCalculatorSource,
  input: StudentCalculatorState,
  formIndex = 0,
): SelectedStudentSkill[] {
  if (!student.catalog) return [];
  const state = resolveStudentCalculatorState(student, input);
  const candidates = student.catalog.skillConfigurations.filter(
    (configuration) =>
      configuration.formIndex === formIndex &&
      configuration.minimumWeaponStar <= state.weaponStar &&
      configuration.minimumGearTier <= state.equipSpecial,
  );
  const maximal = candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          other.minimumWeaponStar >= candidate.minimumWeaponStar &&
          other.minimumGearTier >= candidate.minimumGearTier &&
          (other.minimumWeaponStar > candidate.minimumWeaponStar || other.minimumGearTier > candidate.minimumGearTier),
      ),
  );
  if (maximal.length !== 1) return [];

  const levelBySlot: Record<StudentSkillTypeEnum, number> = {
    ex: state.skillEx,
    public: state.skillNormal,
    passive: state.skillEnhanced,
    extra_passive: state.skillSub,
  };
  const skillByUid = new Map(student.skills.map((skill) => [skill.uid, skill]));
  return maximal[0].slots.flatMap((slot) =>
    slot.skills.flatMap((reference) => {
      const skill = reference.skillUid ? skillByUid.get(reference.skillUid) : undefined;
      if (!skill) return [];
      return [{ ...skill, slot: slot.slot, position: reference.position, selectedLevel: levelBySlot[slot.slot] }];
    }),
  );
}

export function renderStudentSkillDescription(
  skill: Pick<SelectedStudentSkill, "description" | "selectedLevel">,
): string | null {
  return (
    renderStudentSkillDescriptionParts(skill)
      ?.map((part) => part.text)
      .join("") ?? null
  );
}

export function renderStudentSkillDescriptionParts(
  skill: Pick<SelectedStudentSkill, "description" | "selectedLevel">,
): StudentSkillDescriptionPart[] | null {
  if (!skill.description) return null;
  const values = new Map(
    skill.description.parameters.map((parameter) => [
      parameter.id,
      {
        text: parameter.values.find((value) => value.level === skill.selectedLevel)?.text ?? "",
        emphasized: parameter.emphasized,
      },
    ]),
  );
  const parts: StudentSkillDescriptionPart[] = [];
  const pattern = /\{\{(\d+)\}\}/g;
  let cursor = 0;
  for (const match of skill.description.template.matchAll(pattern)) {
    const matchIndex = match.index ?? cursor;
    if (matchIndex > cursor) {
      parts.push({
        key: `text-${cursor}`,
        text: skill.description.template.slice(cursor, matchIndex),
        dynamic: false,
        emphasized: false,
      });
    }
    const value = values.get(Number(match[1]));
    if (value) parts.push({ key: `value-${matchIndex}`, ...value, dynamic: true });
    cursor = matchIndex + match[0].length;
  }
  if (cursor < skill.description.template.length) {
    parts.push({
      key: `text-${cursor}`,
      text: skill.description.template.slice(cursor),
      dynamic: false,
      emphasized: false,
    });
  }
  return parts;
}

function interpolateLevelStat(
  level1: number,
  level100: number,
  growthType: StudentCatalogStatGrowthType,
  level: number,
  catalog: StudentCalculatorCatalog,
): number {
  if (level <= 1) return level1;
  const interpolation = catalog.statLevelInterpolations.find((row) => row.level === level);
  const ratio = interpolation?.ratios.find((candidate) => candidate.growthType === growthType)?.value;
  if (ratio == null) return level1;
  return level1 + roundAwayFromZero(((level100 - level1) * ratio) / 10_000);
}

function applyModifiers(
  stats: Map<StudentCatalogStat, number>,
  coefficientRates: Map<StudentCatalogStat, number>,
  modifiers: readonly StatModifier[],
) {
  for (const modifier of modifiers) {
    const current = stats.get(modifier.stat) ?? 0;
    if (modifier.kind === "BASE") {
      stats.set(modifier.stat, current + modifier.value);
    } else if (modifier.kind === "COEFFICIENT") {
      coefficientRates.set(modifier.stat, (coefficientRates.get(modifier.stat) ?? 0) + modifier.value);
    }
  }
}

function applyCoefficientModifiers(
  stats: Map<StudentCatalogStat, number>,
  coefficientRates: ReadonlyMap<StudentCatalogStat, number>,
) {
  for (const [stat, rate] of coefficientRates) {
    const current = stats.get(stat) ?? 0;
    stats.set(stat, current + Math.ceil((current * rate) / 10_000));
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
