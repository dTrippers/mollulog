import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgRecruitedStudentsTable, pgRelationshipLevelsTable, pgStudentStatesTable } from "~/db/postgres/schema";
import {
  patchCanonicalRelationship,
  patchCanonicalStudentState,
  type StudentStateRequestMode,
  type StudentStateTransaction,
  type StudentStateWriteContext,
  withStudentStateProjection,
} from "~/db/postgres/student-state-projection";
import { getRelationshipLevelValidationError } from "~/domain/relationship-level";
import { type StudentCalculatorSource, validateStudentEquipmentLevels } from "~/domain/student-calculator";
import {
  emptyStudentGrowthEditValues,
  STUDENT_GROWTH_EDIT_FIELDS,
  type StudentGrowthEditField,
  type StudentGrowthEditStudent,
  type StudentGrowthEditValues,
  type StudentGrowthEquipmentLimit,
  validateStudentGrowthEdit,
} from "~/domain/student-growth-edit";
import { assertAbilityReleaseAvailable, assertWeaponLevelRange } from "~/domain/student-growth-state";
import { ActionValidationError } from "~/lib/action-errors";
import { type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import {
  MAX_RECRUITED_STUDENT_BATCH_SIZE,
  type RecruitedStudentCurrentStateInput,
  validateRecruitedStudentCurrentStateInput,
} from "~/models/recruited-student";
import { normalizeRelationshipItems } from "~/models/relationship-level";

type StudentBasicInfoDatabase = NodePgDatabase;

export type StudentBasicInfoSaveOptions = {
  createClient?: PostgresClientFactory;
  requestMode?: StudentStateRequestMode;
  equipmentValidation?: {
    student: Pick<StudentCalculatorSource, "equipments">;
    catalog: Parameters<typeof validateStudentEquipmentLevels>[1];
  };
};

export type StudentBasicInfoSaveInput = {
  tier?: number;
  currentState: Partial<RecruitedStudentCurrentStateInput>;
  relationshipBonds: Record<string, number | null>;
};

type EquipmentValidationState = Pick<
  RecruitedStudentCurrentStateInput,
  "equip1" | "equip2" | "equip3" | "equip1Level" | "equip2Level" | "equip3Level"
>;

export function mergeStudentBasicInfoEquipmentState(
  existing: Partial<EquipmentValidationState> | null | undefined,
  patch: Partial<EquipmentValidationState>,
): EquipmentValidationState {
  const value = (field: keyof EquipmentValidationState) =>
    Object.hasOwn(patch, field) ? (patch[field] ?? null) : (existing?.[field] ?? null);
  return {
    equip1: value("equip1"),
    equip2: value("equip2"),
    equip3: value("equip3"),
    equip1Level: value("equip1Level"),
    equip2Level: value("equip2Level"),
    equip3Level: value("equip3Level"),
  };
}

function validateSaveInput(input: StudentBasicInfoSaveInput): void {
  if (input.tier != null && (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > 9)) {
    throw new ActionValidationError("성급 범위가 올바르지 않아요");
  }
  try {
    validateRecruitedStudentCurrentStateInput(input.currentState);
    if (input.tier != null) {
      assertWeaponLevelRange(input.currentState.weaponLevel, input.tier, "고유무기 레벨");
      assertAbilityReleaseAvailable(
        [input.currentState.abilityHp, input.currentState.abilityAtk, input.currentState.abilityHeal],
        input.tier,
        "능력 해방",
      );
    }
  } catch (error) {
    throw new ActionValidationError(error instanceof Error ? error.message : "육성 상태를 확인해주세요");
  }

  for (const bond of Object.values(input.relationshipBonds)) {
    if (bond == null) continue;
    const validationError = getRelationshipLevelValidationError({ currentLevel: bond, targetLevel: bond });
    if (validationError) throw new ActionValidationError(validationError);
  }
}

function withStudentBasicInfoDatabase<T>(
  env: Env,
  operation: (db: StudentBasicInfoDatabase) => Promise<T>,
  options: StudentBasicInfoSaveOptions,
): Promise<T> {
  return withPostgresClient(env, (client) => operation(drizzle(client)), options.createClient);
}

// Writes one student's tier, current state and relationship rank inside an already locked transaction.
async function applyStudentBasicInfo(
  lockedTx: StudentStateTransaction,
  context: StudentStateWriteContext,
  senseiId: number,
  studentUid: string,
  input: StudentBasicInfoSaveInput,
  options: StudentBasicInfoSaveOptions,
): Promise<void> {
  if (context.mode === "nullable") {
    const [existing] = await lockedTx
      .select()
      .from(pgStudentStatesTable)
      .where(and(eq(pgStudentStatesTable.userId, senseiId), eq(pgStudentStatesTable.studentUid, studentUid)))
      .limit(1);
    const tier = input.tier ?? existing?.tier ?? null;
    if (tier == null) throw new ActionValidationError("학생 성급을 확인해주세요");
    const equipmentFields = ["equip1", "equip2", "equip3", "equip1Level", "equip2Level", "equip3Level"] as const;
    const hasEquipmentChanges = equipmentFields.some((field) => Object.hasOwn(input.currentState, field));
    try {
      validateRecruitedStudentCurrentStateInput(input.currentState);
      if (hasEquipmentChanges) {
        if (!options.equipmentValidation) {
          throw new ActionValidationError("장비 정보를 확인하지 못했어요");
        }
        validateStudentEquipmentLevels(
          options.equipmentValidation.student,
          options.equipmentValidation.catalog,
          mergeStudentBasicInfoEquipmentState(existing, input.currentState),
        );
      }
      const nextWeaponLevel = Object.hasOwn(input.currentState, "weaponLevel")
        ? (input.currentState.weaponLevel ?? null)
        : (existing?.weaponLevel ?? null);
      const ability = [
        Object.hasOwn(input.currentState, "abilityHp")
          ? (input.currentState.abilityHp ?? null)
          : (existing?.abilityHp ?? null),
        Object.hasOwn(input.currentState, "abilityAtk")
          ? (input.currentState.abilityAtk ?? null)
          : (existing?.abilityAtk ?? null),
        Object.hasOwn(input.currentState, "abilityHeal")
          ? (input.currentState.abilityHeal ?? null)
          : (existing?.abilityHeal ?? null),
      ];
      assertWeaponLevelRange(nextWeaponLevel, tier, "고유무기 레벨");
      assertAbilityReleaseAvailable(ability, tier, "능력 해방");
    } catch (error) {
      throw new ActionValidationError(error instanceof Error ? error.message : "육성 상태를 확인해주세요");
    }
    await patchCanonicalStudentState(lockedTx, senseiId, studentUid, {
      ...(existing?.recruitedStudentUid == null
        ? { recruitedStudentUid: nanoid(8), recruitedAt: new Date().toISOString() }
        : {}),
      ...(input.tier != null ? { tier: input.tier } : {}),
      ...input.currentState,
    });
    for (const [relationshipStudentUid, relationshipBond] of Object.entries(input.relationshipBonds)) {
      await patchCanonicalRelationship(lockedTx, senseiId, relationshipStudentUid, {
        currentLevel: relationshipBond,
      });
    }
    return;
  }
  if (input.tier == null) throw new ActionValidationError("학생 성급을 확인해주세요");
  await lockedTx
    .insert(pgRecruitedStudentsTable)
    .values({
      uid: nanoid(8),
      userId: senseiId,
      studentUid,
      tier: input.tier,
      ...input.currentState,
    })
    .onConflictDoUpdate({
      target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
      set: { tier: input.tier, ...input.currentState, updatedAt: new Date() },
    });

  for (const [relationshipStudentUid, relationshipBond] of Object.entries(input.relationshipBonds)) {
    const [existingRelationship] = await lockedTx
      .select()
      .from(pgRelationshipLevelsTable)
      .where(
        and(
          eq(pgRelationshipLevelsTable.userId, senseiId),
          eq(pgRelationshipLevelsTable.studentId, relationshipStudentUid),
        ),
      )
      .limit(1)
      .for("update");
    if (relationshipBond == null) {
      await lockedTx
        .delete(pgRelationshipLevelsTable)
        .where(
          and(
            eq(pgRelationshipLevelsTable.userId, senseiId),
            eq(pgRelationshipLevelsTable.studentId, relationshipStudentUid),
          ),
        );
      continue;
    }
    const targetLevel = Math.max(relationshipBond, existingRelationship?.targetLevel ?? relationshipBond);
    const currentExp = existingRelationship?.currentLevel === relationshipBond ? existingRelationship.currentExp : null;
    const items = normalizeRelationshipItems(existingRelationship?.items);
    await lockedTx
      .insert(pgRelationshipLevelsTable)
      .values({
        uid: nanoid(8),
        userId: senseiId,
        studentId: relationshipStudentUid,
        currentLevel: relationshipBond,
        currentExp,
        targetLevel,
        items,
      })
      .onConflictDoUpdate({
        target: [pgRelationshipLevelsTable.userId, pgRelationshipLevelsTable.studentId],
        set: {
          currentLevel: relationshipBond,
          currentExp: sql`case when ${pgRelationshipLevelsTable.currentLevel} = ${relationshipBond} then ${pgRelationshipLevelsTable.currentExp} else ${currentExp} end`,
          targetLevel: sql`greatest(${pgRelationshipLevelsTable.targetLevel}, excluded.target_level)`,
          updatedAt: new Date(),
        },
      });
  }
}

export async function saveStudentBasicInfo(
  env: Env,
  senseiId: number,
  studentUid: string,
  input: StudentBasicInfoSaveInput,
  options: StudentBasicInfoSaveOptions = {},
): Promise<void> {
  validateSaveInput(input);

  await withStudentBasicInfoDatabase(
    env,
    async (db) => {
      await db.transaction(async (tx) => {
        await withStudentStateProjection(
          tx,
          senseiId,
          [studentUid, ...Object.keys(input.relationshipBonds)],
          "student_basic_info",
          (lockedTx, context) => applyStudentBasicInfo(lockedTx, context, senseiId, studentUid, input, options),
          null,
          options.requestMode ?? "legacy",
        );
      });
    },
    options,
  );
}

export type StudentBasicInfoBatchEntry = {
  studentUid: string;
  // The values to save. Only fields the user changed are present.
  changes: Partial<StudentGrowthEditValues>;
  // The stored value of each changed field when the screen loaded. A different stored value now means another screen
  // changed it in the meantime.
  expected: Partial<StudentGrowthEditValues>;
};

export type StudentBasicInfoBatchOptions = {
  createClient?: PostgresClientFactory;
  requestMode?: StudentStateRequestMode;
  students: ReadonlyMap<string, StudentGrowthEditStudent>;
  equipmentLimits: readonly StudentGrowthEquipmentLimit[];
};

export type StudentBasicInfoBatchConflict = {
  studentUid: string;
  field: StudentGrowthEditField;
  // The value stored now.
  current: number | null;
};

export type StudentBasicInfoBatchFieldError = {
  studentUid: string;
  // Absent when the message is about the student as a whole, such as a student who is no longer recruited.
  field?: StudentGrowthEditField;
  message: string;
  max?: number;
};

export class StudentBasicInfoBatchConflictError extends Error {
  constructor(readonly conflicts: StudentBasicInfoBatchConflict[]) {
    super("Stored student values changed after the edit started.");
    this.name = "StudentBasicInfoBatchConflictError";
  }
}

export class StudentBasicInfoBatchValidationError extends Error {
  constructor(readonly errors: StudentBasicInfoBatchFieldError[]) {
    super("Some student values are invalid.");
    this.name = "StudentBasicInfoBatchValidationError";
  }
}

const BATCH_CURRENT_STATE_FIELDS = STUDENT_GROWTH_EDIT_FIELDS.filter(
  (field): field is Exclude<StudentGrowthEditField, "tier" | "bond"> => field !== "tier" && field !== "bond",
);

async function readBatchStoredValues(
  tx: StudentStateTransaction,
  senseiId: number,
  mode: StudentStateWriteContext["mode"],
  studentUids: readonly string[],
): Promise<Map<string, StudentGrowthEditValues>> {
  const result = new Map<string, StudentGrowthEditValues>();
  if (studentUids.length === 0) return result;
  if (mode === "nullable") {
    const rows = await tx
      .select()
      .from(pgStudentStatesTable)
      .where(
        and(
          eq(pgStudentStatesTable.userId, senseiId),
          inArray(pgStudentStatesTable.studentUid, [...studentUids]),
          isNotNull(pgStudentStatesTable.recruitedStudentUid),
          isNull(pgStudentStatesTable.deletedAt),
        ),
      );
    for (const row of rows) {
      const values = emptyStudentGrowthEditValues();
      values.tier = row.tier;
      values.bond = row.relationshipCurrentLevel;
      for (const field of BATCH_CURRENT_STATE_FIELDS) values[field] = row[field];
      result.set(row.studentUid, values);
    }
    return result;
  }
  const [rows, relationships] = await Promise.all([
    tx
      .select()
      .from(pgRecruitedStudentsTable)
      .where(
        and(
          eq(pgRecruitedStudentsTable.userId, senseiId),
          inArray(pgRecruitedStudentsTable.studentUid, [...studentUids]),
        ),
      ),
    tx
      .select()
      .from(pgRelationshipLevelsTable)
      .where(
        and(
          eq(pgRelationshipLevelsTable.userId, senseiId),
          inArray(pgRelationshipLevelsTable.studentId, [...studentUids]),
        ),
      ),
  ]);
  const bondByStudentUid = new Map(relationships.map((row) => [row.studentId, row.currentLevel]));
  for (const row of rows) {
    const values = emptyStudentGrowthEditValues();
    values.tier = row.tier;
    values.bond = bondByStudentUid.get(row.studentUid) ?? null;
    for (const field of BATCH_CURRENT_STATE_FIELDS) values[field] = row[field] ?? null;
    result.set(row.studentUid, values);
  }
  return result;
}

/**
 * Saves the edited cells of many recruited students in one transaction: either every student is saved or none is.
 * The relationship rank lives apart from the other values, and it is written in the same transaction. Each student gets
 * one data-history row, as a save from the student detail does.
 *
 * It throws StudentBasicInfoBatchConflictError when a stored value differs from the one the screen loaded, and
 * StudentBasicInfoBatchValidationError when a merged state breaks a rule. Both roll the transaction back.
 */
export async function saveStudentBasicInfoBatch(
  env: Env,
  senseiId: number,
  entries: readonly StudentBasicInfoBatchEntry[],
  options: StudentBasicInfoBatchOptions,
): Promise<void> {
  const uniqueEntries = new Map(entries.map((entry) => [entry.studentUid, entry]));
  if (uniqueEntries.size > MAX_RECRUITED_STUDENT_BATCH_SIZE) {
    throw new ActionValidationError(`학생은 최대 ${MAX_RECRUITED_STUDENT_BATCH_SIZE}명까지 한 번에 저장할 수 있어요`);
  }
  const studentUids = [...uniqueEntries.keys()];
  if (studentUids.length === 0) return;

  await withPostgresClient(
    env,
    async (client) => {
      await drizzle(client).transaction(async (tx) => {
        await withStudentStateProjection(
          tx,
          senseiId,
          studentUids,
          "student_basic_info",
          async (lockedTx, context) => {
            const stored = await readBatchStoredValues(lockedTx, senseiId, context.mode, studentUids);

            const conflicts: StudentBasicInfoBatchConflict[] = [];
            const errors: StudentBasicInfoBatchFieldError[] = [];
            const merged = new Map<string, StudentGrowthEditValues>();
            for (const entry of uniqueEntries.values()) {
              const current = stored.get(entry.studentUid);
              const student = options.students.get(entry.studentUid);
              if (!current || !student) {
                errors.push({ studentUid: entry.studentUid, message: "모집한 학생이 아니라서 저장하지 못했어요." });
                continue;
              }
              for (const field of Object.keys(entry.changes) as StudentGrowthEditField[]) {
                if (!STUDENT_GROWTH_EDIT_FIELDS.includes(field)) {
                  errors.push({ studentUid: entry.studentUid, message: "저장할 값이 올바르지 않아요." });
                  continue;
                }
                if (current[field] !== (entry.expected[field] ?? null)) {
                  conflicts.push({ studentUid: entry.studentUid, field, current: current[field] });
                }
              }
              const next = { ...current, ...entry.changes } as StudentGrowthEditValues;
              merged.set(entry.studentUid, next);
              for (const error of validateStudentGrowthEdit(next, student, options.equipmentLimits)) {
                errors.push({ studentUid: entry.studentUid, ...error });
              }
            }
            if (conflicts.length > 0) {
              throw new StudentBasicInfoBatchConflictError(conflicts);
            }
            if (errors.length > 0) throw new StudentBasicInfoBatchValidationError(errors);

            for (const entry of uniqueEntries.values()) {
              const next = merged.get(entry.studentUid);
              const student = options.students.get(entry.studentUid);
              if (!next || !student || next.tier == null) continue;
              const { tier, bond, ...currentState } = entry.changes;
              const currentStatePatch = Object.fromEntries(
                Object.entries(currentState).filter(([field]) =>
                  BATCH_CURRENT_STATE_FIELDS.some((key) => key === field),
                ),
              ) as Partial<RecruitedStudentCurrentStateInput>;
              await applyStudentBasicInfo(
                lockedTx,
                context,
                senseiId,
                entry.studentUid,
                {
                  tier: tier ?? next.tier,
                  currentState: currentStatePatch,
                  relationshipBonds: Object.hasOwn(entry.changes, "bond") ? { [entry.studentUid]: bond ?? null } : {},
                },
                {
                  equipmentValidation: {
                    student: { equipments: [...student.equipments] },
                    catalog: { equipment: options.equipmentLimits },
                  },
                },
              );
            }
          },
          null,
          options.requestMode ?? "legacy",
        );
      });
    },
    options.createClient,
  );
}
