import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import { senseisTable } from "./sensei";
import type { StudentGradingTagValue } from "./student-grading-tag";
import {
  deleteGradingTags,
  getGradingTags,
  getGradingTagsByGradingUids,
  updateGradingTags,
} from "./student-grading-tag";

export const studentGradingsTable = sqliteTable("student_gradings", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  studentUid: text().notNull(),
  comment: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type StudentGrading = {
  uid: string;
  studentUid: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: StudentGradingTagValue[]; // Optional, loaded separately
};

export type StudentGradingWithUser = StudentGrading & {
  user: {
    username: string;
    profileStudentId: string | null;
  };
};

function toModel(grading: typeof studentGradingsTable.$inferSelect): StudentGrading {
  return {
    uid: grading.uid,
    studentUid: grading.studentUid,
    comment: grading.comment,
    createdAt: grading.createdAt,
    updatedAt: grading.updatedAt,
  };
}

export async function getStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  includeTags = false,
): Promise<StudentGrading | null> {
  const db = drizzle(env.DB);
  const result = await db
    .select()
    .from(studentGradingsTable)
    .where(and(eq(studentGradingsTable.userId, senseiId), eq(studentGradingsTable.studentUid, studentUid)))
    .limit(1);

  if (result.length === 0) return null;

  const grading = toModel(result[0]);

  if (includeTags) {
    grading.tags = (await getGradingTags(env, grading.uid)).map((tag) => tag.tagValue);
  }

  return grading;
}

export async function upsertStudentGrading(
  env: Env,
  senseiId: number,
  studentUid: string,
  comment: string | null,
  tags: StudentGradingTagValue[],
): Promise<void> {
  // Validate comment length
  if (comment && comment.length > 100) {
    throw new Error("Comment must be less than 100 characters");
  }

  const db = drizzle(env.DB);

  // Check if grading already exists
  const existing = await db
    .select()
    .from(studentGradingsTable)
    .where(and(eq(studentGradingsTable.userId, senseiId), eq(studentGradingsTable.studentUid, studentUid)))
    .limit(1);

  let gradingUid: string;

  if (existing.length > 0) {
    // Update existing grading
    gradingUid = existing[0].uid;
    await db
      .update(studentGradingsTable)
      .set({ comment, updatedAt: sql`current_timestamp` })
      .where(eq(studentGradingsTable.uid, gradingUid));
  } else {
    // Create new grading
    gradingUid = nanoid(8);
    await db.insert(studentGradingsTable).values({
      uid: gradingUid,
      userId: senseiId,
      studentUid,
      comment,
    });
  }

  // Update tags
  await updateGradingTags(env, gradingUid, studentUid, tags);
}

export async function deleteStudentGrading(env: Env, senseiId: number, studentUid: string): Promise<void> {
  const db = drizzle(env.DB);
  const existing = await db
    .select({ uid: studentGradingsTable.uid })
    .from(studentGradingsTable)
    .where(and(eq(studentGradingsTable.userId, senseiId), eq(studentGradingsTable.studentUid, studentUid)))
    .limit(1);

  if (existing.length === 0) {
    return;
  }

  await deleteGradingTags(env, existing[0].uid);
  await db
    .delete(studentGradingsTable)
    .where(and(eq(studentGradingsTable.userId, senseiId), eq(studentGradingsTable.studentUid, studentUid)));
}

export async function getStudentGradingsByStudentWithUsers(
  env: Env,
  studentUid: string,
  includeTags = false,
): Promise<StudentGradingWithUser[]> {
  const db = drizzle(env.DB);
  const gradings = await db
    .select({
      uid: studentGradingsTable.uid,
      studentUid: studentGradingsTable.studentUid,
      comment: studentGradingsTable.comment,
      createdAt: studentGradingsTable.createdAt,
      updatedAt: studentGradingsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(studentGradingsTable)
    .innerJoin(senseisTable, eq(studentGradingsTable.userId, senseisTable.id))
    .where(eq(studentGradingsTable.studentUid, studentUid));

  const result: StudentGradingWithUser[] = gradings.map((grading) => ({
    uid: grading.uid,
    studentUid: grading.studentUid,
    comment: grading.comment,
    createdAt: grading.createdAt,
    updatedAt: grading.updatedAt,
    user: {
      username: grading.username,
      profileStudentId: grading.profileStudentId,
    },
  }));

  if (includeTags) {
    const gradingUids = result.map((g) => g.uid);
    const tagsMap = await getGradingTagsByGradingUids(env, gradingUids);
    for (const grading of result) {
      grading.tags = tagsMap[grading.uid]?.map((tag) => tag.tagValue) || [];
    }
  }
  return result;
}

export async function getStudentGradingsByUser(env: Env, userId: number): Promise<StudentGrading[]> {
  const db = drizzle(env.DB);
  const gradings = await db
    .select({
      uid: studentGradingsTable.uid,
      studentUid: studentGradingsTable.studentUid,
      comment: studentGradingsTable.comment,
      createdAt: studentGradingsTable.createdAt,
      updatedAt: studentGradingsTable.updatedAt,
    })
    .from(studentGradingsTable)
    .where(eq(studentGradingsTable.userId, userId));

  const result: StudentGrading[] = gradings.map((grading) => ({
    uid: grading.uid,
    studentUid: grading.studentUid,
    comment: grading.comment,
    createdAt: grading.createdAt,
    updatedAt: grading.updatedAt,
  }));

  const gradingUids = result.map((g) => g.uid);
  const tagsMap = await getGradingTagsByGradingUids(env, gradingUids);
  for (const grading of result) {
    grading.tags = tagsMap[grading.uid]?.map((tag) => tag.tagValue) || [];
  }
  return result;
}

export async function getRecentStudentGradingsWithUsers(
  env: Env,
  limit = 3,
  includeTags = false,
): Promise<StudentGradingWithUser[]> {
  const db = drizzle(env.DB);
  const gradings = await db
    .select({
      uid: studentGradingsTable.uid,
      studentUid: studentGradingsTable.studentUid,
      comment: studentGradingsTable.comment,
      createdAt: studentGradingsTable.createdAt,
      updatedAt: studentGradingsTable.updatedAt,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
    })
    .from(studentGradingsTable)
    .innerJoin(senseisTable, eq(studentGradingsTable.userId, senseisTable.id))
    .orderBy(desc(studentGradingsTable.updatedAt), desc(studentGradingsTable.createdAt))
    .limit(limit);

  const result: StudentGradingWithUser[] = gradings.map((grading) => ({
    uid: grading.uid,
    studentUid: grading.studentUid,
    comment: grading.comment,
    createdAt: grading.createdAt,
    updatedAt: grading.updatedAt,
    user: {
      username: grading.username,
      profileStudentId: grading.profileStudentId,
    },
  }));

  if (includeTags) {
    const gradingUids = result.map((grading) => grading.uid);
    const tagsMap = await getGradingTagsByGradingUids(env, gradingUids);
    for (const grading of result) {
      grading.tags = tagsMap[grading.uid]?.map((tag) => tag.tagValue) || [];
    }
  }

  return result;
}
