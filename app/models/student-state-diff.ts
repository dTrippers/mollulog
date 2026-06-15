import type {
  StudentStateDraftCurrentValue,
  StudentStateDraftTargetValue,
  StudentStateDraftValue,
} from "./student-state-draft-value";
import { studentStateComparisonFields } from "./student-state-fields";

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
  field.currentKey ? [{ key: field.currentKey, kind: field.kind, gearOnly: field.gearOnly }] : [],
);

const targetComparisonFields = studentStateComparisonFields.flatMap((field) =>
  field.targetKey ? [{ key: field.targetKey, kind: field.kind, gearOnly: field.gearOnly }] : [],
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
    level: getMergedCurrentFieldValue("level", imported, existing, options),
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
    targetBond: getMergedTargetFieldValue("targetBond", imported, existing, options),
    targetLevel: getMergedTargetFieldValue("targetLevel", imported, existing, options),
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

function getMinimumValue(field: { kind?: "tier" }, initialTier: number): number {
  return field.kind === "tier" ? initialTier : 1;
}

function effectiveValue(value: number | null | undefined, minimumValue: number): number {
  return value == null || value <= minimumValue ? minimumValue : value;
}
