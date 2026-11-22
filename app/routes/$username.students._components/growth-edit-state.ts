import {
  emptyStudentGrowthEditValues,
  STUDENT_GROWTH_EDIT_FIELDS,
  type StudentGrowthEditError,
  type StudentGrowthEditField,
  type StudentGrowthEditStudent,
  type StudentGrowthEditValues,
  type StudentGrowthEquipmentLimit,
  validateStudentGrowthEdit,
} from "~/domain/student-growth-edit";
import type { UserStudent } from "~/views/user-students.server";

// One recruited student in the growth table: the values loaded from the server and what the catalog allows.
export type GrowthRow = {
  uid: string;
  name: string;
  attackType: UserStudent["attackType"];
  tier: number;
  student: StudentGrowthEditStudent;
  // The unique weapon exists for the student (the weapon level and ability release can apply from ★6).
  weaponAvailable: boolean;
  loaded: StudentGrowthEditValues;
  // Equipment images by slot and the max Lv of the loaded tier, for the read-only table.
  equipment: NonNullable<UserStudent["growth"]>["equipment"];
};

export type GrowthDraft = Record<string, Partial<StudentGrowthEditValues>>;
// What another screen stored since the table loaded: the new baseline for the cells the user already looked at.
export type GrowthBaseline = Record<string, Partial<StudentGrowthEditValues>>;

export function toGrowthRow(student: UserStudent): GrowthRow | null {
  const { growth, tier } = student;
  if (!growth || tier === null) return null;
  const loaded = emptyStudentGrowthEditValues();
  loaded.tier = tier;
  loaded.bond = growth.bond;
  loaded.level = growth.level;
  loaded.weaponLevel = growth.weaponLevel;
  loaded.skillEx = growth.skillEx;
  loaded.skillNormal = growth.skillNormal;
  loaded.skillEnhanced = growth.skillEnhanced;
  loaded.skillSub = growth.skillSub;
  loaded.equip1 = growth.equipment[0].tier;
  loaded.equip2 = growth.equipment[1].tier;
  loaded.equip3 = growth.equipment[2].tier;
  loaded.equip1Level = growth.equipment[0].level;
  loaded.equip2Level = growth.equipment[1].level;
  loaded.equip3Level = growth.equipment[2].level;
  loaded.equipSpecial = growth.equipSpecial;
  loaded.abilityHp = growth.abilityHp;
  loaded.abilityAtk = growth.abilityAtk;
  loaded.abilityHeal = growth.abilityHeal;
  return {
    uid: student.uid,
    name: student.name,
    attackType: student.attackType,
    tier,
    student: {
      initialTier: student.initialTier,
      equipments: growth.equipment.flatMap((slot) => (slot.category === null ? [] : [slot.category])),
      gearAvailable: growth.equipSpecialAvailable,
    },
    weaponAvailable: growth.weaponAvailable,
    loaded,
    equipment: growth.equipment,
  };
}

export function getBaseline(row: GrowthRow, baseline: GrowthBaseline): StudentGrowthEditValues {
  return { ...row.loaded, ...baseline[row.uid] };
}

export function getEffectiveValues(
  row: GrowthRow,
  draft: GrowthDraft,
  baseline: GrowthBaseline,
): StudentGrowthEditValues {
  return { ...getBaseline(row, baseline), ...draft[row.uid] };
}

// Keeps only the cells that differ from the baseline, so typing a value back to the stored one is no change.
export function setDraftValue(
  draft: GrowthDraft,
  row: GrowthRow,
  baseline: GrowthBaseline,
  field: StudentGrowthEditField,
  value: number | null,
): GrowthDraft {
  const base = getBaseline(row, baseline)[field];
  const nextRow = { ...draft[row.uid] };
  if (value === base) delete nextRow[field];
  else nextRow[field] = value;
  const next = { ...draft };
  if (Object.keys(nextRow).length === 0) delete next[row.uid];
  else next[row.uid] = nextRow;
  return next;
}

export function countGrowthChanges(draft: GrowthDraft): { students: number; values: number } {
  let values = 0;
  for (const changes of Object.values(draft)) values += Object.keys(changes).length;
  return { students: Object.keys(draft).length, values };
}

export type GrowthRowErrors = Partial<Record<StudentGrowthEditField, StudentGrowthEditError>>;

// Validates the rows that have changes, so an untouched row never blocks a save.
export function validateGrowthDraft(
  rows: readonly GrowthRow[],
  draft: GrowthDraft,
  baseline: GrowthBaseline,
  equipmentLimits: readonly StudentGrowthEquipmentLimit[],
): Record<string, GrowthRowErrors> {
  const result: Record<string, GrowthRowErrors> = {};
  for (const row of rows) {
    if (!draft[row.uid]) continue;
    const errors = validateStudentGrowthEdit(getEffectiveValues(row, draft, baseline), row.student, equipmentLimits);
    if (errors.length === 0) continue;
    const byField: GrowthRowErrors = {};
    for (const error of errors) byField[error.field] ??= error;
    result[row.uid] = byField;
  }
  return result;
}

// What the batch save sends: the changed cells and the stored value each one was compared with.
export function buildGrowthSavePayload(draft: GrowthDraft, rows: readonly GrowthRow[], baseline: GrowthBaseline) {
  const rowByUid = new Map(rows.map((row) => [row.uid, row]));
  return Object.entries(draft).flatMap(([studentUid, changes]) => {
    const row = rowByUid.get(studentUid);
    if (!row) return [];
    const base = getBaseline(row, baseline);
    const expected: Partial<StudentGrowthEditValues> = {};
    for (const field of Object.keys(changes) as StudentGrowthEditField[]) expected[field] = base[field];
    return [{ studentUid, changes, expected }];
  });
}

export function isGrowthField(value: string): value is StudentGrowthEditField {
  return (STUDENT_GROWTH_EDIT_FIELDS as readonly string[]).includes(value);
}
