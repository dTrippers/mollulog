import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";

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
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type StudentGrowth = {
  uid: string;
  studentUid: string;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
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
};

export type StudentGrowthInput = Omit<StudentGrowth, "uid" | "studentUid">;

const growthRanges = {
  level: { label: "레벨", min: 1, max: 90 },
  skillEx: { label: "EX 스킬", min: 1, max: 5 },
  skillNormal: { label: "기본 스킬", min: 1, max: 10 },
  skillEnhanced: { label: "강화 스킬", min: 1, max: 10 },
  skillSub: { label: "서브 스킬", min: 1, max: 10 },
  equip1: { label: "장비 1", min: 1, max: 10 },
  equip2: { label: "장비 2", min: 1, max: 10 },
  equip3: { label: "장비 3", min: 1, max: 10 },
  equipSpecial: { label: "애용품", min: 1, max: 10 },
  targetLevel: { label: "목표 레벨", min: 1, max: 90 },
  targetSkillEx: { label: "목표 EX 스킬", min: 1, max: 5 },
  targetSkillNormal: { label: "목표 기본 스킬", min: 1, max: 10 },
  targetSkillEnhanced: { label: "목표 강화 스킬", min: 1, max: 10 },
  targetSkillSub: { label: "목표 서브 스킬", min: 1, max: 10 },
  targetEquip1: { label: "목표 장비 1", min: 1, max: 10 },
  targetEquip2: { label: "목표 장비 2", min: 1, max: 10 },
  targetEquip3: { label: "목표 장비 3", min: 1, max: 10 },
  targetEquipSpecial: { label: "목표 애용품", min: 1, max: 10 },
  targetTier: { label: "목표 성급", min: 1, max: 9 },
} satisfies Record<keyof StudentGrowthInput, { label: string; min: number; max: number }>;

function toModel(studentGrowth: typeof studentGrowthTable.$inferSelect): StudentGrowth {
  return {
    uid: studentGrowth.uid,
    studentUid: studentGrowth.studentUid,
    level: studentGrowth.level,
    skillEx: studentGrowth.skillEx,
    skillNormal: studentGrowth.skillNormal,
    skillEnhanced: studentGrowth.skillEnhanced,
    skillSub: studentGrowth.skillSub,
    equip1: studentGrowth.equip1,
    equip2: studentGrowth.equip2,
    equip3: studentGrowth.equip3,
    equipSpecial: studentGrowth.equipSpecial,
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
  };
}

export function validateStudentGrowthInput(input: StudentGrowthInput) {
  for (const [field, range] of Object.entries(growthRanges) as [keyof StudentGrowthInput, { label: string; min: number; max: number }][]) {
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
}

export async function getStudentGrowths(env: Env, senseiId: number): Promise<StudentGrowth[]> {
  const db = drizzle(env.DB);
  const studentGrowths = await db.select().from(studentGrowthTable).where(eq(studentGrowthTable.userId, senseiId));
  return studentGrowths.map(toModel);
}

export async function getStudentGrowth(env: Env, senseiId: number, studentUid: string): Promise<StudentGrowth | null> {
  const db = drizzle(env.DB);
  const result = await db.select().from(studentGrowthTable)
    .where(and(eq(studentGrowthTable.userId, senseiId), eq(studentGrowthTable.studentUid, studentUid)))
    .limit(1);

  return result.length > 0 ? toModel(result[0]) : null;
}

export async function upsertStudentGrowth(env: Env, senseiId: number, studentUid: string, input: StudentGrowthInput) {
  validateStudentGrowthInput(input);

  const db = drizzle(env.DB);
  const uid = nanoid(8);
  await db.insert(studentGrowthTable)
    .values({ uid, userId: senseiId, studentUid, ...input })
    .onConflictDoUpdate({
      target: [studentGrowthTable.userId, studentGrowthTable.studentUid],
      set: { ...input, updatedAt: sql`current_timestamp` },
    });
}

export async function removeStudentGrowth(env: Env, senseiId: number, studentUid: string) {
  const db = drizzle(env.DB);
  await db.delete(studentGrowthTable)
    .where(and(eq(studentGrowthTable.userId, senseiId), eq(studentGrowthTable.studentUid, studentUid)));
}
