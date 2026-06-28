import { describe, expect, it } from "@jest/globals";
import type { StudentStateDraftCurrentValue, StudentStateDraftTargetValue } from "~/domain/student-state";
import {
  type StudentStateCurrentComparisonValue,
  type StudentStateTargetComparisonValue,
  isStudentStateCurrentChanged,
  isStudentStateTargetChanged,
  mergeStudentStateDraftValueForUpdate,
} from "~/domain/student-state";

const defaultOptions = { initialTier: 1, hasGear: true };

describe("student-state-diff", () => {
  it("treats imported minimum current fields as unchanged from existing null fields", () => {
    const existing = createExistingCurrent({ tier: 9 });
    const imported = createImportedCurrent({ tier: 9 });

    expect(isStudentStateCurrentChanged(imported, existing, defaultOptions)).toBe(false);
  });

  it("ignores imported null fields even when existing values are above minimum", () => {
    const existing = createExistingCurrent({ tier: 9, level: 90, skillEx: 5, equip1: 10 });
    const imported = createImportedCurrent({ tier: 9, level: null, skillEx: null, equip1: null });

    expect(isStudentStateCurrentChanged(imported, existing, defaultOptions)).toBe(false);
  });

  it("preserves ignored current fields when another field changes", () => {
    const existing = createExistingCurrent({ tier: 9, level: 90, skillEx: 5, equip1: 10 });
    const imported = createImportedCurrent({ tier: 9, level: null, skillEx: 4, equip1: 1 });

    expect(
      mergeStudentStateDraftValueForUpdate(
        { current: imported, target: null },
        { current: existing, target: createExistingTarget() },
        defaultOptions,
      ).current,
    ).toEqual(expect.objectContaining({ tier: 9, level: 90, skillEx: 4, equip1: 1 }));
  });

  it("detects a new recruited current state from an unrecruited existing state", () => {
    const existing = createExistingCurrent();
    const imported = createImportedCurrent({ tier: 9 });

    expect(isStudentStateCurrentChanged(imported, existing, defaultOptions)).toBe(true);
  });

  it("detects current changes in full applied fields", () => {
    const existing = createExistingCurrent({ tier: 9 });

    expect(isStudentStateCurrentChanged(createImportedCurrent({ tier: 9, level: 50 }), existing, defaultOptions)).toBe(
      true,
    );
    expect(isStudentStateCurrentChanged(createImportedCurrent({ tier: 9, bond: 20 }), existing, defaultOptions)).toBe(
      true,
    );
  });

  it("keeps the current unowned guard ahead of diff application", () => {
    const existing = createExistingCurrent({ tier: 9 });
    const imported = createImportedCurrent({ tier: 1 });

    expect(isMinimumVisibleCurrentDraftValue(imported, defaultOptions.initialTier)).toBe(true);
    expect(isCurrentUpdateTarget(imported, existing, defaultOptions)).toBe(false);
  });

  it("treats imported minimum target fields as unchanged from existing null fields", () => {
    const options = { initialTier: 3, hasGear: true };
    const existing = createExistingTarget();
    const imported = createImportedTarget({ targetTier: 3 });

    expect(isStudentStateTargetChanged(imported, existing, options)).toBe(false);
  });

  it("ignores imported null target fields even when existing values are above minimum", () => {
    const options = { initialTier: 3, hasGear: true };
    const existing = createExistingTarget({ targetTier: 5, targetLevel: 90, targetSkillEx: 5 });
    const imported = createImportedTarget({ targetTier: 5, targetLevel: null, targetSkillEx: null });

    expect(isStudentStateTargetChanged(imported, existing, options)).toBe(false);
  });

  it("detects target changes with target tier normalization", () => {
    const options = { initialTier: 3, hasGear: true };
    const existing = createExistingTarget();

    expect(isStudentStateTargetChanged(createImportedTarget({ targetTier: 4 }), existing, options)).toBe(true);
    expect(
      isStudentStateTargetChanged(createImportedTarget({ targetTier: 3, targetLevel: 80 }), existing, options),
    ).toBe(true);
  });

  it("ignores special gear fields when the student has no gear", () => {
    const options = { initialTier: 1, hasGear: false };

    expect(
      isStudentStateCurrentChanged(
        createImportedCurrent({ tier: 9, equipSpecial: 2 }),
        createExistingCurrent({ tier: 9 }),
        options,
      ),
    ).toBe(false);
    expect(
      isStudentStateTargetChanged(createImportedTarget({ targetEquipSpecial: 2 }), createExistingTarget(), options),
    ).toBe(false);
  });
});

function isCurrentUpdateTarget(
  imported: StudentStateDraftCurrentValue | null,
  existing: StudentStateCurrentComparisonValue,
  options: { initialTier: number; hasGear: boolean },
): boolean {
  return (
    imported != null &&
    !isMinimumVisibleCurrentDraftValue(imported, options.initialTier) &&
    isStudentStateCurrentChanged(imported, existing, options)
  );
}

function isMinimumVisibleCurrentDraftValue(value: StudentStateDraftCurrentValue, initialTier: number): boolean {
  return (
    value.tier <= initialTier &&
    minimumCurrentFields.every((field) => {
      const currentValue = value[field];
      return currentValue == null || currentValue <= 1;
    })
  );
}

const minimumCurrentFields = [
  "bond",
  "level",
  "weaponLevel",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equipSpecial",
] as const satisfies readonly (keyof StudentStateDraftCurrentValue)[];

function createExistingCurrent(
  overrides: Partial<StudentStateCurrentComparisonValue> = {},
): StudentStateCurrentComparisonValue {
  return {
    level: null,
    tier: null,
    weaponLevel: null,
    skillEx: null,
    skillNormal: null,
    skillEnhanced: null,
    skillSub: null,
    equip1: null,
    equip2: null,
    equip3: null,
    equipSpecial: null,
    abilityHp: null,
    abilityAtk: null,
    abilityHeal: null,
    bond: null,
    ...overrides,
  };
}

function createImportedCurrent(overrides: Partial<StudentStateDraftCurrentValue> = {}): StudentStateDraftCurrentValue {
  return {
    level: 1,
    tier: 1,
    weaponLevel: null,
    skillEx: 1,
    skillNormal: 1,
    skillEnhanced: 1,
    skillSub: 1,
    equip1: 1,
    equip2: 1,
    equip3: 1,
    equipSpecial: null,
    abilityHp: null,
    abilityAtk: null,
    abilityHeal: null,
    bond: 1,
    ...overrides,
  };
}

function createExistingTarget(
  overrides: Partial<StudentStateTargetComparisonValue> = {},
): StudentStateTargetComparisonValue {
  return {
    targetBond: null,
    targetLevel: null,
    targetTier: null,
    targetWeaponLevel: null,
    targetSkillEx: null,
    targetSkillNormal: null,
    targetSkillEnhanced: null,
    targetSkillSub: null,
    targetEquip1: null,
    targetEquip2: null,
    targetEquip3: null,
    targetEquipSpecial: null,
    targetAbilityHp: null,
    targetAbilityAtk: null,
    targetAbilityHeal: null,
    ...overrides,
  };
}

function createImportedTarget(overrides: Partial<StudentStateDraftTargetValue> = {}): StudentStateDraftTargetValue {
  return {
    targetBond: 1,
    targetLevel: 1,
    targetTier: 1,
    targetWeaponLevel: null,
    targetSkillEx: 1,
    targetSkillNormal: 1,
    targetSkillEnhanced: 1,
    targetSkillSub: 1,
    targetEquip1: 1,
    targetEquip2: 1,
    targetEquip3: 1,
    targetEquipSpecial: null,
    targetAbilityHp: null,
    targetAbilityAtk: null,
    targetAbilityHeal: null,
    ...overrides,
  };
}
