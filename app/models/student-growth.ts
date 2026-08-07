import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgStudentGrowthTable } from "~/db/postgres/schema";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  assertAbilityReleaseAvailable,
  assertWeaponLevelRange,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";
import { withPostgresClient } from "~/lib/postgres.server";

type StudentGrowthDb = NodePgDatabase;
export const studentGrowthTable = pgStudentGrowthTable;

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

function toModel(row: typeof pgStudentGrowthTable.$inferSelect): StudentGrowth {
  return {
    uid: row.uid,
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

function toModelWithMetadata(row: typeof pgStudentGrowthTable.$inferSelect): StudentGrowthWithMetadata {
  return { ...toModel(row), createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt };
}

export function validateStudentGrowthInput(input: StudentGrowthInput) {
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
}

export function validateStudentGrowthTargetStateForTier(
  input: Pick<StudentGrowthInput, "targetWeaponLevel" | "targetAbilityHp" | "targetAbilityAtk" | "targetAbilityHeal">,
  targetTier: number | null | undefined,
) {
  assertWeaponLevelRange(input.targetWeaponLevel, targetTier, "목표 고유무기 레벨");
  assertAbilityReleaseAvailable(
    [input.targetAbilityHp, input.targetAbilityAtk, input.targetAbilityHeal],
    targetTier,
    "목표 능력 해방",
  );
}

function withDb<T>(env: Env, operation: (db: StudentGrowthDb) => Promise<T>): Promise<T> {
  return withPostgresClient(env, (client) => operation(drizzle(client)));
}

export async function getStudentGrowths(env: Env, senseiId: number): Promise<StudentGrowth[]> {
  return withDb(env, async (db) => {
    const rows = await db.select().from(pgStudentGrowthTable).where(eq(pgStudentGrowthTable.userId, senseiId));
    return rows.map(toModel);
  });
}

export async function getStudentGrowthsWithMetadata(env: Env, senseiId: number): Promise<StudentGrowthWithMetadata[]> {
  return withDb(env, async (db) => {
    const rows = await db.select().from(pgStudentGrowthTable).where(eq(pgStudentGrowthTable.userId, senseiId));
    return rows.map(toModelWithMetadata);
  });
}

export async function getStudentGrowth(env: Env, senseiId: number, studentUid: string): Promise<StudentGrowth | null> {
  return withDb(env, async (db) => {
    const [row] = await db
      .select()
      .from(pgStudentGrowthTable)
      .where(and(eq(pgStudentGrowthTable.userId, senseiId), eq(pgStudentGrowthTable.studentUid, studentUid)))
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
      .select()
      .from(pgStudentGrowthTable)
      .where(and(eq(pgStudentGrowthTable.userId, senseiId), eq(pgStudentGrowthTable.studentUid, studentUid)))
      .limit(1);
    return row ? toModelWithMetadata(row) : null;
  });
}

export async function upsertStudentGrowth(env: Env, senseiId: number, studentUid: string, input: StudentGrowthInput) {
  validateStudentGrowthInput(input);
  await withDb(env, async (db) => {
    await db
      .insert(pgStudentGrowthTable)
      .values({ uid: nanoid(8), userId: senseiId, studentUid, ...input })
      .onConflictDoUpdate({
        target: [pgStudentGrowthTable.userId, pgStudentGrowthTable.studentUid],
        set: { ...input, updatedAt: new Date() },
      });
  });
}

export async function removeStudentGrowth(env: Env, senseiId: number, studentUid: string) {
  await withDb(env, (db) =>
    db
      .delete(pgStudentGrowthTable)
      .where(and(eq(pgStudentGrowthTable.userId, senseiId), eq(pgStudentGrowthTable.studentUid, studentUid))),
  );
}
