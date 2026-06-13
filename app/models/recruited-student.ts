import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";

export const recruitedStudentsTable = sqliteTable("recruited_students", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  studentUid: text().notNull(),
  tier: int().notNull(),
  level: int(),
  skillEx: int(),
  skillNormal: int(),
  skillEnhanced: int(),
  skillSub: int(),
  equip1: int(),
  equip2: int(),
  equip3: int(),
  equipSpecial: int(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type RecruitedStudentCurrentState = {
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
};

export type RecruitedStudentCurrentStateInput = RecruitedStudentCurrentState;

export type RecruitedStudent = RecruitedStudentCurrentState & {
  uid: string;
  studentUid: string;
  tier: number;
};

const currentStateRanges = {
  level: { label: "레벨", min: 1, max: 90 },
  skillEx: { label: "EX 스킬", min: 1, max: 5 },
  skillNormal: { label: "기본 스킬", min: 1, max: 10 },
  skillEnhanced: { label: "강화 스킬", min: 1, max: 10 },
  skillSub: { label: "서브 스킬", min: 1, max: 10 },
  equip1: { label: "장비 1", min: 1, max: 10 },
  equip2: { label: "장비 2", min: 1, max: 10 },
  equip3: { label: "장비 3", min: 1, max: 10 },
  equipSpecial: { label: "애용품", min: 1, max: 2 },
} satisfies Record<keyof RecruitedStudentCurrentStateInput, { label: string; min: number; max: number }>;

function toModel(recruitedStudent: typeof recruitedStudentsTable.$inferSelect): RecruitedStudent {
  return {
    uid: recruitedStudent.uid,
    studentUid: recruitedStudent.studentUid,
    tier: recruitedStudent.tier,
    level: recruitedStudent.level,
    skillEx: recruitedStudent.skillEx,
    skillNormal: recruitedStudent.skillNormal,
    skillEnhanced: recruitedStudent.skillEnhanced,
    skillSub: recruitedStudent.skillSub,
    equip1: recruitedStudent.equip1,
    equip2: recruitedStudent.equip2,
    equip3: recruitedStudent.equip3,
    equipSpecial: recruitedStudent.equipSpecial,
  };
}

export function validateRecruitedStudentCurrentStateInput(input: RecruitedStudentCurrentStateInput) {
  for (const [field, range] of Object.entries(currentStateRanges) as [
    keyof RecruitedStudentCurrentStateInput,
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
}

export async function getRecruitedStudents(env: Env, senseiId: number): Promise<RecruitedStudent[]> {
  const db = drizzle(env.DB);
  const recruitedStudents = await db.select().from(recruitedStudentsTable).where(eq(recruitedStudentsTable.userId, senseiId));
  return recruitedStudents.map(toModel);
}

export async function getRecruitedStudentTiers(env: Env, senseiId: number): Promise<Record<string, number>> {
  const recruitedStudents = await getRecruitedStudents(env, senseiId);
  return recruitedStudents.reduce((acc, { studentUid, tier }) => {
    acc[studentUid] = tier;
    return acc;
  }, {} as Record<string, number>);
}

export async function upsertRecruitedStudent(env: Env, senseiId: number, studentUid: string, tier: number) {
  if (tier < 1 || tier > 9) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const db = drizzle(env.DB);
  const uid = nanoid(8);
  await db.insert(recruitedStudentsTable).values({ uid, userId: senseiId, studentUid, tier }).onConflictDoUpdate({
    target: [recruitedStudentsTable.userId, recruitedStudentsTable.studentUid],
    set: { tier },
  });
}

export async function upsertRecruitedStudentFromRecruitmentResult(
  env: Env,
  senseiId: number,
  studentUid: string,
  tier: number,
) {
  if (tier < 1 || tier > 9) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const db = drizzle(env.DB);
  const uid = nanoid(8);
  await db
    .insert(recruitedStudentsTable)
    .values({ uid, userId: senseiId, studentUid, tier })
    .onConflictDoUpdate({
      target: [recruitedStudentsTable.userId, recruitedStudentsTable.studentUid],
      set: {
        tier: sql`max(${recruitedStudentsTable.tier}, ${tier})`,
        updatedAt: sql`current_timestamp`,
      },
    });
}

export async function updateRecruitedStudentCurrentState(
  env: Env,
  senseiId: number,
  studentUid: string,
  input: RecruitedStudentCurrentStateInput,
) {
  validateRecruitedStudentCurrentStateInput(input);

  const db = drizzle(env.DB);
  await db
    .update(recruitedStudentsTable)
    .set({ ...input, updatedAt: sql`current_timestamp` })
    .where(and(eq(recruitedStudentsTable.userId, senseiId), eq(recruitedStudentsTable.studentUid, studentUid)));
}

export async function removeRecruitedStudent(env: Env, senseiId: number, studentUid: string) {
  const db = drizzle(env.DB);
  await db.delete(recruitedStudentsTable)
    .where(and(eq(recruitedStudentsTable.userId, senseiId), eq(recruitedStudentsTable.studentUid, studentUid)));
}
