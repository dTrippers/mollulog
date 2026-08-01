import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  assertAbilityReleaseAvailable,
  assertWeaponLevelRange,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";

export const studentGrowthTable = sqliteTable("student_growth", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  studentUid: text().notNull(),
  level: int(),
  skillEx: int(),
  skillNormal: int(),
  skillEnhanced: int(),
  skillSub: int(),
  equip1: int(),
  equip2: int(),
  equip3: int(),
  equipSpecial: int(),
  targetLevel: int(),
  targetSkillEx: int(),
  targetSkillNormal: int(),
  targetSkillEnhanced: int(),
  targetSkillSub: int(),
  targetEquip1: int(),
  targetEquip2: int(),
  targetEquip3: int(),
  targetEquipSpecial: int(),
  targetTier: int(),
  targetWeaponLevel: int(),
  targetAbilityHp: int(),
  targetAbilityAtk: int(),
  targetAbilityHeal: int(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

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

export type StudentGrowthWithMetadata = StudentGrowth & {
  createdAt: string;
};

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

function toModel(studentGrowth: typeof studentGrowthTable.$inferSelect): StudentGrowth {
  return {
    uid: studentGrowth.uid,
    studentUid: studentGrowth.studentUid,
    targetLevel: studentGrowth.targetLevel,
    targetSkillEx: studentGrowth.targetSkillEx,
    targetSkillNormal: studentGrowth.targetSkillNormal,
    targetSkillEnhanced: studentGrowth.targetSkillEnhanced,
    targetSkillSub: studentGrowth.targetSkillSub,
    targetEquip1: studentGrowth.targetEquip1,
    targetEquip2: studentGrowth.targetEquip2,
    targetEquip3: studentGrowth.targetEquip3,
    targetEquipSpecial: studentGrowth.targetEquipSpecial,
    targetTier: studentGrowth.targetTier,
    targetWeaponLevel: studentGrowth.targetWeaponLevel,
    targetAbilityHp: studentGrowth.targetAbilityHp,
    targetAbilityAtk: studentGrowth.targetAbilityAtk,
    targetAbilityHeal: studentGrowth.targetAbilityHeal,
  };
}

function toModelWithMetadata(studentGrowth: typeof studentGrowthTable.$inferSelect): StudentGrowthWithMetadata {
  return {
    ...toModel(studentGrowth),
    createdAt: studentGrowth.createdAt,
  };
}

export function validateStudentGrowthInput(input: StudentGrowthInput) {
  for (const [field, range] of Object.entries(growthRanges) as [
    keyof StudentGrowthInput,
    { label: string; min: number; max: number },
  ][]) {
    const value = input[field];
    if (value == null) {
      continue;
    }

    if (!Number.isInteger(value)) {
      throw new Error(`${range.label}은(는) 숫자만 입력할 수 있어요`);
    }

    if (value < range.min || value > range.max) {
      throw new Error(`${range.label}은(는) ${range.min}부터 ${range.max} 사이만 입력할 수 있어요`);
    }
  }

  if (input.targetTier != null) {
    validateStudentGrowthTargetStateForTier(input, input.targetTier);
  }
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

export async function getStudentGrowths(env: Env, senseiId: number): Promise<StudentGrowth[]> {
  const db = drizzle(env.DB);
  const studentGrowths = await db.select().from(studentGrowthTable).where(eq(studentGrowthTable.userId, senseiId));
  return studentGrowths.map(toModel);
}

export async function getStudentGrowthsWithMetadata(env: Env, senseiId: number): Promise<StudentGrowthWithMetadata[]> {
  const db = drizzle(env.DB);
  const studentGrowths = await db.select().from(studentGrowthTable).where(eq(studentGrowthTable.userId, senseiId));
  return studentGrowths.map(toModelWithMetadata);
}

export async function getStudentGrowth(env: Env, senseiId: number, studentUid: string): Promise<StudentGrowth | null> {
  const db = drizzle(env.DB);
  const result = await db
    .select()
    .from(studentGrowthTable)
    .where(and(eq(studentGrowthTable.userId, senseiId), eq(studentGrowthTable.studentUid, studentUid)))
    .limit(1);

  return result.length > 0 ? toModel(result[0]) : null;
}

export async function getStudentGrowthWithMetadata(
  env: Env,
  senseiId: number,
  studentUid: string,
): Promise<StudentGrowthWithMetadata | null> {
  const db = drizzle(env.DB);
  const result = await db
    .select()
    .from(studentGrowthTable)
    .where(and(eq(studentGrowthTable.userId, senseiId), eq(studentGrowthTable.studentUid, studentUid)))
    .limit(1);

  return result.length > 0 ? toModelWithMetadata(result[0]) : null;
}

export async function upsertStudentGrowth(env: Env, senseiId: number, studentUid: string, input: StudentGrowthInput) {
  validateStudentGrowthInput(input);

  const uid = nanoid(8);
  await env.DB.prepare(`
    insert into student_growth (
      uid,
      userId,
      studentUid,
      targetLevel,
      targetSkillEx,
      targetSkillNormal,
      targetSkillEnhanced,
      targetSkillSub,
      targetEquip1,
      targetEquip2,
      targetEquip3,
      targetEquipSpecial,
      targetTier,
      targetWeaponLevel,
      targetAbilityHp,
      targetAbilityAtk,
      targetAbilityHeal
    )
    values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
    on conflict(userId, studentUid) do update set
      targetLevel = excluded.targetLevel,
      targetSkillEx = excluded.targetSkillEx,
      targetSkillNormal = excluded.targetSkillNormal,
      targetSkillEnhanced = excluded.targetSkillEnhanced,
      targetSkillSub = excluded.targetSkillSub,
      targetEquip1 = excluded.targetEquip1,
      targetEquip2 = excluded.targetEquip2,
      targetEquip3 = excluded.targetEquip3,
      targetEquipSpecial = excluded.targetEquipSpecial,
      targetTier = excluded.targetTier,
      targetWeaponLevel = excluded.targetWeaponLevel,
      targetAbilityHp = excluded.targetAbilityHp,
      targetAbilityAtk = excluded.targetAbilityAtk,
      targetAbilityHeal = excluded.targetAbilityHeal,
      updatedAt = current_timestamp
  `)
    .bind(
      uid,
      senseiId,
      studentUid,
      input.targetLevel,
      input.targetSkillEx,
      input.targetSkillNormal,
      input.targetSkillEnhanced,
      input.targetSkillSub,
      input.targetEquip1,
      input.targetEquip2,
      input.targetEquip3,
      input.targetEquipSpecial,
      input.targetTier,
      input.targetWeaponLevel,
      input.targetAbilityHp,
      input.targetAbilityAtk,
      input.targetAbilityHeal,
    )
    .run();
}

export async function removeStudentGrowth(env: Env, senseiId: number, studentUid: string) {
  const db = drizzle(env.DB);
  await db
    .delete(studentGrowthTable)
    .where(and(eq(studentGrowthTable.userId, senseiId), eq(studentGrowthTable.studentUid, studentUid)));
}
