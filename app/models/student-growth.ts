import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgStudentStatesTable, pgStudentTargetsTable } from "~/db/postgres/schema";
import {
  patchCanonicalStudentState,
  patchCanonicalStudentTarget,
  type StudentStateRequestMode,
  withStudentStateWrite,
} from "~/db/postgres/student-state";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  assertAbilityReleaseAvailable,
  assertWeaponLevelRange,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";
import { withPostgresClient } from "~/lib/postgres.server";
import {
  type RecruitedStudentCurrentStateInput,
  RecruitedStudentValidationError,
  validateRecruitedStudentCurrentStateInput,
} from "~/models/recruited-student";

type StudentGrowthDb = NodePgDatabase;

export type StudentGrowth = {
  uid: string;
  studentUid: string;
  targetLevel: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
  targetTier: number | null;
  targetWeaponLevel: number | null;
  targetAbilityHp: number | null;
  targetAbilityAtk: number | null;
  targetAbilityHeal: number | null;
};

export type StudentGrowthWithMetadata = StudentGrowth & { createdAt: string };
export type StudentGrowthInput = Omit<StudentGrowth, "uid" | "studentUid">;
type StudentGrowthRow = Pick<
  typeof pgStudentTargetsTable.$inferSelect,
  | "studentUid"
  | "targetLevel"
  | "targetSkillEx"
  | "targetSkillNormal"
  | "targetSkillEnhanced"
  | "targetSkillSub"
  | "targetEquip1"
  | "targetEquip2"
  | "targetEquip3"
  | "targetEquipSpecial"
  | "targetTier"
  | "targetWeaponLevel"
  | "targetAbilityHp"
  | "targetAbilityAtk"
  | "targetAbilityHeal"
> & { studentGrowthUid: string | null };
type StudentGrowthMetadataRow = StudentGrowthRow & { createdAt: string | null };

const studentGrowthColumns = {
  studentGrowthUid: pgStudentTargetsTable.studentGrowthUid,
  studentUid: pgStudentTargetsTable.studentUid,
  targetLevel: pgStudentTargetsTable.targetLevel,
  targetSkillEx: pgStudentTargetsTable.targetSkillEx,
  targetSkillNormal: pgStudentTargetsTable.targetSkillNormal,
  targetSkillEnhanced: pgStudentTargetsTable.targetSkillEnhanced,
  targetSkillSub: pgStudentTargetsTable.targetSkillSub,
  targetEquip1: pgStudentTargetsTable.targetEquip1,
  targetEquip2: pgStudentTargetsTable.targetEquip2,
  targetEquip3: pgStudentTargetsTable.targetEquip3,
  targetEquipSpecial: pgStudentTargetsTable.targetEquipSpecial,
  targetTier: pgStudentTargetsTable.targetTier,
  targetWeaponLevel: pgStudentTargetsTable.targetWeaponLevel,
  targetAbilityHp: pgStudentTargetsTable.targetAbilityHp,
  targetAbilityAtk: pgStudentTargetsTable.targetAbilityAtk,
  targetAbilityHeal: pgStudentTargetsTable.targetAbilityHeal,
} as const;

const growthRanges = {
  targetLevel: { label: "목표 레벨", min: 1, max: 90 },
  targetSkillEx: { label: "목표 EX 스킬", min: 1, max: 5 },
  targetSkillNormal: { label: "목표 기본 스킬", min: 1, max: 10 },
  targetSkillEnhanced: { label: "목표 강화 스킬", min: 1, max: 10 },
  targetSkillSub: { label: "목표 서브 스킬", min: 1, max: 10 },
  targetEquip1: { label: "목표 장비 1", min: 1, max: 10 },
  targetEquip2: { label: "목표 장비 2", min: 1, max: 10 },
  targetEquip3: { label: "목표 장비 3", min: 1, max: 10 },
  targetEquipSpecial: { label: "목표 애용품", min: 1, max: 2 },
  targetTier: { label: "목표 성급", min: 1, max: 9 },
  targetWeaponLevel: { label: "목표 고유무기 레벨", min: 0, max: WEAPON_LEVEL_MAX_LEVEL },
  targetAbilityHp: { label: "목표 능력 개방 체력", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  targetAbilityAtk: { label: "목표 능력 개방 공격력", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  targetAbilityHeal: { label: "목표 능력 개방 치유력", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
} satisfies Record<keyof StudentGrowthInput, { label: string; min: number; max: number }>;

export class StudentGrowthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentGrowthValidationError";
  }
}

function toModel(row: StudentGrowthRow): StudentGrowth {
  if (row.studentGrowthUid == null) {
    throw new Error("Student growth projection is missing its source UID.");
  }

  return {
    uid: row.studentGrowthUid,
    studentUid: row.studentUid,
    targetLevel: row.targetLevel,
    targetSkillEx: row.targetSkillEx,
    targetSkillNormal: row.targetSkillNormal,
    targetSkillEnhanced: row.targetSkillEnhanced,
    targetSkillSub: row.targetSkillSub,
    targetEquip1: row.targetEquip1,
    targetEquip2: row.targetEquip2,
    targetEquip3: row.targetEquip3,
    targetEquipSpecial: row.targetEquipSpecial,
    targetTier: row.targetTier,
    targetWeaponLevel: row.targetWeaponLevel,
    targetAbilityHp: row.targetAbilityHp,
    targetAbilityAtk: row.targetAbilityAtk,
    targetAbilityHeal: row.targetAbilityHeal,
  };
}

function toModelWithMetadata(row: StudentGrowthMetadataRow): StudentGrowthWithMetadata {
  if (row.createdAt == null) {
    throw new Error("Student growth projection is missing its planner registration timestamp.");
  }

  return {
    ...toModel(row),
    createdAt: row.createdAt,
  };
}

export function validateStudentGrowthInput(input: Partial<StudentGrowthInput>) {
  try {
    for (const [field, range] of Object.entries(growthRanges) as [
      keyof StudentGrowthInput,
      { label: string; min: number; max: number },
    ][]) {
      const value = input[field];
      if (value == null) continue;
      if (!Number.isInteger(value)) throw new Error(`${range.label}은(는) 숫자만 입력할 수 있어요`);
      if (value < range.min || value > range.max) {
        throw new Error(`${range.label}은(는) ${range.min}부터 ${range.max} 사이만 입력할 수 있어요`);
      }
    }
    if (input.targetTier != null) validateStudentGrowthTargetStateForTier(input, input.targetTier);
  } catch (error) {
    if (error instanceof StudentGrowthValidationError) throw error;
    throw new StudentGrowthValidationError(error instanceof Error ? error.message : "목표 상태를 확인해주세요");
  }
}

export function validateStudentGrowthTargetStateForTier(
  input: Partial<
    Pick<StudentGrowthInput, "targetWeaponLevel" | "targetAbilityHp" | "targetAbilityAtk" | "targetAbilityHeal">
  >,
  targetTier: number | null | undefined,
) {
  try {
    assertWeaponLevelRange(input.targetWeaponLevel, targetTier, "목표 고유무기 레벨");
    assertAbilityReleaseAvailable(
      [input.targetAbilityHp, input.targetAbilityAtk, input.targetAbilityHeal],
      targetTier,
      "목표 능력 해방",
    );
  } catch (error) {
    throw new StudentGrowthValidationError(error instanceof Error ? error.message : "목표 상태를 확인해주세요");
  }
}

const tierBoundTargetFields = [
  "targetTier",
  "targetWeaponLevel",
  "targetAbilityHp",
  "targetAbilityAtk",
  "targetAbilityHeal",
] as const;

/** Validate the stored target merged with a partial update: an explicit null clears a field, an omitted field keeps it. */
export function validateMergedStudentGrowthTarget(
  existing: Partial<Pick<StudentGrowthInput, (typeof tierBoundTargetFields)[number]>> | null | undefined,
  patch: Partial<StudentGrowthInput>,
  currentTier: number | null,
) {
  const merged = Object.fromEntries(
    tierBoundTargetFields.map((field) => [
      field,
      Object.hasOwn(patch, field) ? (patch[field] ?? null) : (existing?.[field] ?? null),
    ]),
  ) as Pick<StudentGrowthInput, (typeof tierBoundTargetFields)[number]>;
  validateStudentGrowthTargetStateForTier(merged, merged.targetTier ?? currentTier);
}

/** Save the growth-table row's current and target values as one audited change. */
export async function saveStudentGrowthAndCurrentState(
  env: Env,
  senseiId: number,
  studentUid: string,
  currentState: Partial<RecruitedStudentCurrentStateInput> | null,
  targets: Partial<StudentGrowthInput>,
  fallbackTier: number | null,
  requestMode: StudentStateRequestMode = "legacy",
): Promise<void> {
  validateStudentGrowthInput(targets);

  await withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      await withStudentStateWrite(
        tx,
        senseiId,
        [studentUid],
        "student_growth_form",
        async (lockedTx) => {
          const [state] = await lockedTx
            .select()
            .from(pgStudentStatesTable)
            .where(and(eq(pgStudentStatesTable.userId, senseiId), eq(pgStudentStatesTable.studentUid, studentUid)))
            .limit(1);
          const [existingTarget] =
            Object.keys(targets).length > 0
              ? await lockedTx
                  .select()
                  .from(pgStudentTargetsTable)
                  .where(
                    and(eq(pgStudentTargetsTable.userId, senseiId), eq(pgStudentTargetsTable.studentUid, studentUid)),
                  )
                  .limit(1)
              : [];
          validateMergedStudentGrowthTarget(existingTarget, targets, state?.tier ?? fallbackTier);
          if (currentState && state?.recruitedStudentUid != null) {
            try {
              validateRecruitedStudentCurrentStateInput(currentState);
              const weaponLevel = Object.hasOwn(currentState, "weaponLevel")
                ? (currentState.weaponLevel ?? null)
                : state.weaponLevel;
              const ability = [
                Object.hasOwn(currentState, "abilityHp") ? (currentState.abilityHp ?? null) : state.abilityHp,
                Object.hasOwn(currentState, "abilityAtk") ? (currentState.abilityAtk ?? null) : state.abilityAtk,
                Object.hasOwn(currentState, "abilityHeal") ? (currentState.abilityHeal ?? null) : state.abilityHeal,
              ];
              assertWeaponLevelRange(weaponLevel, state.tier, "고유무기 레벨");
              assertAbilityReleaseAvailable(ability, state.tier, "능력 해방");
            } catch (error) {
              throw new RecruitedStudentValidationError(
                error instanceof Error ? error.message : "현재 상태를 확인해주세요",
              );
            }
            await patchCanonicalStudentState(lockedTx, senseiId, studentUid, currentState);
          }
          if (Object.keys(targets).length > 0) {
            await patchCanonicalStudentTarget(lockedTx, senseiId, studentUid, {
              ...targets,
              studentGrowthUid: existingTarget?.studentGrowthUid ?? nanoid(8),
              plannerAddedAt: existingTarget?.plannerAddedAt ?? new Date().toISOString(),
            });
          }
          return;
        },
        null,
        requestMode,
      );
    });
  });
}

function withDb<T>(env: Env, operation: (db: StudentGrowthDb) => Promise<T>): Promise<T> {
  return withPostgresClient(env, (client) => operation(drizzle(client)));
}

export async function getStudentGrowths(env: Env, senseiId: number): Promise<StudentGrowth[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select(studentGrowthColumns)
      .from(pgStudentTargetsTable)
      .where(
        and(
          eq(pgStudentTargetsTable.userId, senseiId),
          isNotNull(pgStudentTargetsTable.studentGrowthUid),
          isNull(pgStudentTargetsTable.deletedAt),
        ),
      );
    return rows.map(toModel);
  });
}

export async function getStudentGrowthsWithMetadata(env: Env, senseiId: number): Promise<StudentGrowthWithMetadata[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        ...studentGrowthColumns,
        createdAt: sql<
          string | null
        >`to_char(${pgStudentTargetsTable.plannerAddedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(pgStudentTargetsTable)
      .where(
        and(
          eq(pgStudentTargetsTable.userId, senseiId),
          isNotNull(pgStudentTargetsTable.studentGrowthUid),
          isNull(pgStudentTargetsTable.deletedAt),
        ),
      );
    return rows.map(toModelWithMetadata);
  });
}

export async function getStudentGrowth(env: Env, senseiId: number, studentUid: string): Promise<StudentGrowth | null> {
  return withDb(env, async (db) => {
    const [row] = await db
      .select(studentGrowthColumns)
      .from(pgStudentTargetsTable)
      .where(
        and(
          eq(pgStudentTargetsTable.userId, senseiId),
          eq(pgStudentTargetsTable.studentUid, studentUid),
          isNotNull(pgStudentTargetsTable.studentGrowthUid),
          isNull(pgStudentTargetsTable.deletedAt),
        ),
      )
      .limit(1);
    return row ? toModel(row) : null;
  });
}

export async function getStudentGrowthWithMetadata(
  env: Env,
  senseiId: number,
  studentUid: string,
): Promise<StudentGrowthWithMetadata | null> {
  return withDb(env, async (db) => {
    const [row] = await db
      .select({
        ...studentGrowthColumns,
        createdAt: sql<
          string | null
        >`to_char(${pgStudentTargetsTable.plannerAddedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(pgStudentTargetsTable)
      .where(
        and(
          eq(pgStudentTargetsTable.userId, senseiId),
          eq(pgStudentTargetsTable.studentUid, studentUid),
          isNotNull(pgStudentTargetsTable.studentGrowthUid),
          isNull(pgStudentTargetsTable.deletedAt),
        ),
      )
      .limit(1);
    return row ? toModelWithMetadata(row) : null;
  });
}

export async function upsertStudentGrowth(env: Env, senseiId: number, studentUid: string, input: StudentGrowthInput) {
  validateStudentGrowthInput(input);
  await withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      await withStudentStateWrite(
        tx,
        senseiId,
        [studentUid],
        "student_growth",
        async (lockedTx) => {
          const [existing] = await lockedTx
            .select()
            .from(pgStudentTargetsTable)
            .where(and(eq(pgStudentTargetsTable.userId, senseiId), eq(pgStudentTargetsTable.studentUid, studentUid)))
            .limit(1);
          const providedInput = Object.fromEntries(
            Object.entries(input).filter(([, value]) => value != null),
          ) as Partial<StudentGrowthInput>;
          const [state] = await lockedTx
            .select({ tier: pgStudentStatesTable.tier })
            .from(pgStudentStatesTable)
            .where(and(eq(pgStudentStatesTable.userId, senseiId), eq(pgStudentStatesTable.studentUid, studentUid)))
            .limit(1);
          validateMergedStudentGrowthTarget(existing, providedInput, state?.tier ?? null);
          const patch: Record<string, unknown> = {
            studentGrowthUid: existing?.studentGrowthUid ?? nanoid(8),
            plannerAddedAt: existing?.plannerAddedAt ?? new Date().toISOString(),
            ...providedInput,
          };
          await patchCanonicalStudentTarget(
            lockedTx,
            senseiId,
            studentUid,
            patch as Parameters<typeof patchCanonicalStudentTarget>[3],
          );
          return;
        },
        null,
        null,
      );
    });
  });
}

export async function removeStudentGrowth(env: Env, senseiId: number, studentUid: string) {
  await withDb(env, (db) =>
    db.transaction(async (tx) => {
      await withStudentStateWrite(
        tx,
        senseiId,
        [studentUid],
        "student_growth",
        async (lockedTx) => {
          await patchCanonicalStudentTarget(lockedTx, senseiId, studentUid, {
            studentGrowthUid: null,
            plannerAddedAt: null,
            targetLevel: null,
            targetSkillEx: null,
            targetSkillNormal: null,
            targetSkillEnhanced: null,
            targetSkillSub: null,
            targetEquip1: null,
            targetEquip2: null,
            targetEquip3: null,
            targetEquipSpecial: null,
            targetTier: null,
            targetWeaponLevel: null,
            targetAbilityHp: null,
            targetAbilityAtk: null,
            targetAbilityHeal: null,
          });
          return;
        },
        null,
        null,
      );
    }),
  );
}
