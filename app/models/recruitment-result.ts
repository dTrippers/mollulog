import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import { type UtcIsoString, nowUtcIso } from "~/lib/date-time";
import {
  communityPostsTable,
  createRecruitmentResultCommunityPost,
  deleteCommunityPostByUid,
  getPrimaryPlaintextBlockText,
  parseCommunityPostBlocks,
  upsertRecruitmentResultCommunityPost,
} from "./community";
import type { PickupHistory } from "./pickup-history";
import { upsertRecruitedStudentFromRecruitmentResult } from "./recruited-student";
import { type StudentLookup, resolveRecruitmentResultStudent } from "~/domain/recruitment-result";

const IN_QUERY_BATCH_SIZE = 90;

export const recruitmentResultsTable = sqliteTable("recruitment_results", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  recruitmentGroupUid: text().notNull(),
  contentUid: text(),
  completedAt: text(),
  recruitedStudents: text().notNull().default("[]"),
  exchangedStudents: text().notNull().default("[]"),
  tier3Count: int(),
  trial: int(),
  rawResult: text(),
  commentPostUid: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type RecruitmentResultStudent = {
  studentUid: string;
  tier: number;
  pickup: boolean;
};

export type RecruitmentCompletionMeta = {
  tier: number;
  pickup: boolean;
  recruitmentType: RecruitmentTypeEnum;
};

export type RecruitmentResult = {
  uid: string;
  userId: number;
  recruitmentGroupUid: string;
  contentUid: string | null;
  completedAt: UtcIsoString | null;
  recruitedStudents: RecruitmentResultStudent[];
  exchangedStudents: RecruitmentResultStudent[];
  tier3Count?: number | null;
  trial: number | null;
  rawResult: string | null;
  commentPostUid: string | null;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
};

export type UpsertRecruitmentResultInput = {
  uid?: string;
  recruitmentGroupUid: string;
  contentUid?: string | null;
  completedAt?: UtcIsoString | null;
  recruitedStudents?: RecruitmentResultStudent[];
  exchangedStudents?: RecruitmentResultStudent[];
  tier3Count?: number | null;
  trial?: number | null;
  rawResult?: string | null;
  comment?: string | null;
  subjectStudentUid?: string | null;
};

export type AddRecruitedStudentToResultInput = {
  recruitmentGroupUid: string;
  contentUid?: string | null;
  studentUid: string;
  tier?: number | null;
  pickup?: boolean;
};

type RecruitmentResultRow = typeof recruitmentResultsTable.$inferSelect;

function splitIntoBatches<T>(values: T[], batchSize = IN_QUERY_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < values.length; start += batchSize) {
    batches.push(values.slice(start, start + batchSize));
  }
  return batches;
}

function parseRecruitedStudents(value: string): RecruitmentResultStudent[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sanitizeRecruitmentResultStudents(parsed as RecruitmentResultStudent[]);
  } catch {
    return [];
  }
}

function toModel(row: RecruitmentResultRow): RecruitmentResult {
  return {
    uid: row.uid,
    userId: row.userId,
    recruitmentGroupUid: row.recruitmentGroupUid,
    contentUid: row.contentUid ?? null,
    completedAt: row.completedAt as UtcIsoString | null,
    recruitedStudents: parseRecruitedStudents(row.recruitedStudents),
    exchangedStudents: parseRecruitedStudents(row.exchangedStudents),
    tier3Count: row.tier3Count ?? null,
    trial: row.trial ?? null,
    rawResult: row.rawResult ?? null,
    commentPostUid: row.commentPostUid ?? null,
    createdAt: row.createdAt as UtcIsoString,
    updatedAt: row.updatedAt as UtcIsoString,
  };
}

export function normalizeRecruitmentResultStudents(
  students: RecruitmentResultStudent[] | undefined,
): RecruitmentResultStudent[] {
  const byStudentUid = new Map<string, RecruitmentResultStudent>();
  for (const student of students ?? []) {
    const studentUid = student.studentUid?.trim();
    if (!studentUid) {
      continue;
    }

    const tier = Math.max(1, Math.min(9, Number.isFinite(student.tier) ? Math.trunc(student.tier) : 3));
    const existing = byStudentUid.get(studentUid);
    byStudentUid.set(studentUid, {
      studentUid,
      tier: Math.max(existing?.tier ?? 0, tier),
      pickup: Boolean(existing?.pickup || student.pickup),
    });
  }

  return [...byStudentUid.values()];
}

export function appendRecruitmentResultStudent(
  students: RecruitmentResultStudent[] | undefined,
  student: RecruitmentResultStudent,
): RecruitmentResultStudent[] {
  return sanitizeRecruitmentResultStudents([...(students ?? []), student]);
}

export function removeRecruitmentResultStudent(
  students: RecruitmentResultStudent[] | undefined,
  studentUid: string,
): RecruitmentResultStudent[] {
  let removed = false;
  return sanitizeRecruitmentResultStudents(
    (students ?? []).filter((student) => {
      if (!removed && student.studentUid === studentUid) {
        removed = true;
        return false;
      }

      return true;
    }),
  );
}

export function sanitizeRecruitmentResultStudents(
  students: RecruitmentResultStudent[] | undefined,
): RecruitmentResultStudent[] {
  return (students ?? []).flatMap((student) => {
    const studentUid = student.studentUid?.trim();
    if (!studentUid) {
      return [];
    }

    const tier = Math.max(1, Math.min(9, Number.isFinite(student.tier) ? Math.trunc(student.tier) : 3));
    return [{ studentUid, tier, pickup: Boolean(student.pickup) }];
  });
}

export function createRecruitmentResultStudentsFromPickupHistory(
  history: Pick<PickupHistory, "result">,
  pickupStudentUids: Set<string> = new Set(),
  studentInitialTiers: Record<string, number> = {},
): RecruitmentResultStudent[] {
  return sanitizeRecruitmentResultStudents(
    history.result.flatMap((trial) =>
      trial.tier3StudentIds.map((studentUid) => ({
        studentUid,
        tier: studentInitialTiers[studentUid] ?? 3,
        pickup: pickupStudentUids.has(studentUid),
      })),
    ),
  );
}

export function mergeEditableRecruitmentResultStudents({
  existingStudents,
  history,
  lookup,
  pickupStudentUids = new Set(),
  studentInitialTiers = {},
}: {
  existingStudents: RecruitmentResultStudent[];
  history: Pick<PickupHistory, "result">;
  lookup: StudentLookup;
  pickupStudentUids?: Set<string>;
  studentInitialTiers?: Record<string, number>;
}): RecruitmentResultStudent[] {
  // The edit form owns only ★3 draw rows; non-★3 rows written by quick-complete flows must survive saves.
  const preservedExistingStudents = sanitizeRecruitmentResultStudents(existingStudents).flatMap((student) => {
    const resolvedStudent = resolveRecruitmentResultStudent(student, lookup);
    if (resolvedStudent.tier === 3) {
      return [];
    }

    return [
      {
        studentUid: student.studentUid,
        tier: resolvedStudent.tier,
        pickup: resolvedStudent.pickup,
      },
    ];
  });
  const editedFormStudents = createRecruitmentResultStudentsFromPickupHistory(
    history,
    pickupStudentUids,
    studentInitialTiers,
  );

  return sanitizeRecruitmentResultStudents([...preservedExistingStudents, ...editedFormStudents]);
}

export function getRecruitmentResultTrialFromPickupHistory(history: Pick<PickupHistory, "result">): number | null {
  if (history.result.length === 0) {
    return null;
  }

  return Math.max(...history.result.map((trial) => trial.trial));
}

export function getRecruitmentResultTier3CountFromPickupHistory(history: Pick<PickupHistory, "result">): number {
  return history.result.reduce((sum, trial) => sum + trial.tier3Count, 0);
}

export async function getRecruitmentResult(env: Env, userId: number, uid: string): Promise<RecruitmentResult | null> {
  const db = drizzle(env.DB);
  const row = await db
    .select()
    .from(recruitmentResultsTable)
    .where(and(eq(recruitmentResultsTable.userId, userId), eq(recruitmentResultsTable.uid, uid)))
    .get();

  return row ? toModel(row) : null;
}

export async function getRecruitmentResults(env: Env, userId: number): Promise<RecruitmentResult[]> {
  const db = drizzle(env.DB);
  const rows = await db.select().from(recruitmentResultsTable).where(eq(recruitmentResultsTable.userId, userId)).all();

  return rows.map(toModel);
}

export async function getRecruitmentResultsByRecruitmentGroupUids(
  env: Env,
  userId: number,
  recruitmentGroupUids: string[],
): Promise<RecruitmentResult[]> {
  const uniqueUids = [...new Set(recruitmentGroupUids)].filter((uid) => uid.length > 0);
  if (uniqueUids.length === 0) {
    return [];
  }

  const db = drizzle(env.DB);
  const rows = (
    await Promise.all(
      splitIntoBatches(uniqueUids).map((batch) =>
        db
          .select()
          .from(recruitmentResultsTable)
          .where(
            and(
              eq(recruitmentResultsTable.userId, userId),
              inArray(recruitmentResultsTable.recruitmentGroupUid, batch),
            ),
          )
          .all(),
      ),
    )
  ).flat();

  return rows.map(toModel);
}

export async function getRecruitmentResultComment(
  env: Env,
  userId: number,
  commentPostUid: string | null | undefined,
): Promise<string | null> {
  if (!commentPostUid) {
    return null;
  }

  const db = drizzle(env.DB);
  const post = await db
    .select({ blocks: communityPostsTable.blocks })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.uid, commentPostUid), eq(communityPostsTable.userId, userId)))
    .get();

  return post ? getPrimaryPlaintextBlockText(parseCommunityPostBlocks(post.blocks)) : null;
}

export async function getRecruitmentResultComments(
  env: Env,
  userId: number,
  commentPostUids: (string | null | undefined)[],
): Promise<Map<string, { uid: string; body: string; createdAt: UtcIsoString }>> {
  const uniqueUids = [...new Set(commentPostUids.filter((uid): uid is string => Boolean(uid)))];
  if (uniqueUids.length === 0) {
    return new Map();
  }

  const db = drizzle(env.DB);
  const posts = (
    await Promise.all(
      splitIntoBatches(uniqueUids).map((batch) =>
        db
          .select({
            uid: communityPostsTable.uid,
            blocks: communityPostsTable.blocks,
            createdAt: communityPostsTable.createdAt,
          })
          .from(communityPostsTable)
          .where(and(eq(communityPostsTable.userId, userId), inArray(communityPostsTable.uid, batch)))
          .all(),
      ),
    )
  ).flat();

  return new Map(
    posts.flatMap((post) => {
      const comment = getPrimaryPlaintextBlockText(parseCommunityPostBlocks(post.blocks))?.trim();
      return comment
        ? [[post.uid, { uid: post.uid, body: comment, createdAt: post.createdAt as UtcIsoString }] as const]
        : [];
    }),
  );
}

async function syncRecruitedStudents(env: Env, userId: number, students: RecruitmentResultStudent[]) {
  // Recruitment results are an additive projection into recruited_students.
  // Cancelling completion or removing a result must not auto-delete from recruited_students,
  // because that table is also edited manually and feeds parties, growth, shops, and ranks.
  await Promise.all(
    students.map((student) =>
      upsertRecruitedStudentFromRecruitmentResult(env, userId, student.studentUid, student.tier),
    ),
  );
}

export async function upsertRecruitmentResult(
  env: Env,
  userId: number,
  input: UpsertRecruitmentResultInput,
): Promise<RecruitmentResult> {
  const db = drizzle(env.DB);
  const now = nowUtcIso();
  const existingByUid = input.uid ? await getRecruitmentResult(env, userId, input.uid) : null;
  const existing =
    existingByUid ??
    (await getRecruitmentResultsByRecruitmentGroupUids(env, userId, [input.recruitmentGroupUid]))[0] ??
    null;
  const uid = existing?.uid ?? input.uid ?? nanoid(8);
  const recruitedStudents = sanitizeRecruitmentResultStudents(input.recruitedStudents ?? existing?.recruitedStudents);
  const exchangedStudents = sanitizeRecruitmentResultStudents(input.exchangedStudents ?? existing?.exchangedStudents);
  const tier3Count = input.tier3Count !== undefined ? input.tier3Count : existing?.tier3Count;
  const completedAt = input.completedAt !== undefined ? input.completedAt : (existing?.completedAt ?? now);
  const contentUid = input.contentUid !== undefined ? input.contentUid : existing?.contentUid;
  const trial = input.trial !== undefined ? input.trial : existing?.trial;
  const rawResult = input.rawResult !== undefined ? input.rawResult : existing?.rawResult;

  await db
    .insert(recruitmentResultsTable)
    .values({
      uid,
      userId,
      recruitmentGroupUid: input.recruitmentGroupUid,
      contentUid: contentUid ?? null,
      completedAt,
      recruitedStudents: JSON.stringify(recruitedStudents),
      exchangedStudents: JSON.stringify(exchangedStudents),
      tier3Count: tier3Count ?? null,
      trial: trial ?? null,
      rawResult: rawResult ?? null,
      commentPostUid: existing?.commentPostUid ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [recruitmentResultsTable.userId, recruitmentResultsTable.recruitmentGroupUid],
      set: {
        contentUid: contentUid ?? null,
        completedAt,
        recruitedStudents: JSON.stringify(recruitedStudents),
        exchangedStudents: JSON.stringify(exchangedStudents),
        tier3Count: tier3Count ?? null,
        trial: trial ?? null,
        rawResult: rawResult ?? null,
        updatedAt: now,
      },
    });

  await syncRecruitedStudents(
    env,
    userId,
    normalizeRecruitmentResultStudents([...recruitedStudents, ...exchangedStudents]),
  );

  const comment = input.comment?.trim();
  if (comment && contentUid) {
    const current = (await getRecruitmentResult(env, userId, uid)) ?? { uid, commentPostUid: null };
    const commentPostUid = current.commentPostUid
      ? await upsertRecruitmentResultCommunityPost(env, {
          postUid: current.commentPostUid,
          userId,
          recruitmentResultUid: uid,
          body: comment,
          subjectContentUid: contentUid,
          subjectStudentUid:
            input.subjectStudentUid ??
            recruitedStudents.find((student) => student.pickup)?.studentUid ??
            exchangedStudents.find((student) => student.pickup)?.studentUid ??
            null,
        })
      : await createRecruitmentResultCommunityPost(env, {
          userId,
          recruitmentResultUid: uid,
          body: comment,
          subjectContentUid: contentUid,
          subjectStudentUid:
            input.subjectStudentUid ??
            recruitedStudents.find((student) => student.pickup)?.studentUid ??
            exchangedStudents.find((student) => student.pickup)?.studentUid ??
            null,
        });

    await db
      .update(recruitmentResultsTable)
      .set({ commentPostUid, updatedAt: nowUtcIso() })
      .where(and(eq(recruitmentResultsTable.userId, userId), eq(recruitmentResultsTable.uid, uid)));
  } else if (input.comment !== undefined) {
    const current = await getRecruitmentResult(env, userId, uid);
    if (current?.commentPostUid) {
      await deleteCommunityPostByUid(env, current.commentPostUid, userId);
      await db
        .update(recruitmentResultsTable)
        .set({ commentPostUid: null, updatedAt: nowUtcIso() })
        .where(and(eq(recruitmentResultsTable.userId, userId), eq(recruitmentResultsTable.uid, uid)));
    }
  }

  const result = await getRecruitmentResult(env, userId, uid);
  if (!result) {
    throw new Error("Failed to upsert recruitment result");
  }

  return result;
}

export async function addRecruitedStudentToResult(
  env: Env,
  userId: number,
  input: AddRecruitedStudentToResultInput,
): Promise<RecruitmentResult> {
  const db = drizzle(env.DB);
  const now = nowUtcIso();
  const existing =
    (await getRecruitmentResultsByRecruitmentGroupUids(env, userId, [input.recruitmentGroupUid]))[0] ?? null;
  const uid = existing?.uid ?? nanoid(8);
  const student = sanitizeRecruitmentResultStudents([
    {
      studentUid: input.studentUid,
      tier: input.tier ?? 3,
      pickup: input.pickup ?? true,
    },
  ])[0];

  if (!student) {
    throw new Error("studentUid is required");
  }

  const recruitedStudents = appendRecruitmentResultStudent(existing?.recruitedStudents, student);
  const contentUid = input.contentUid !== undefined ? input.contentUid : existing?.contentUid;
  const completedAt = existing?.completedAt ?? now;

  await db
    .insert(recruitmentResultsTable)
    .values({
      uid,
      userId,
      recruitmentGroupUid: input.recruitmentGroupUid,
      contentUid: contentUid ?? null,
      completedAt,
      recruitedStudents: JSON.stringify(recruitedStudents),
      exchangedStudents: JSON.stringify(existing?.exchangedStudents ?? []),
      tier3Count: existing?.tier3Count ?? null,
      trial: existing?.trial ?? null,
      rawResult: existing?.rawResult ?? null,
      commentPostUid: existing?.commentPostUid ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [recruitmentResultsTable.userId, recruitmentResultsTable.recruitmentGroupUid],
      set: {
        contentUid: contentUid ?? null,
        completedAt,
        recruitedStudents: JSON.stringify(recruitedStudents),
        exchangedStudents: JSON.stringify(existing?.exchangedStudents ?? []),
        tier3Count: existing?.tier3Count ?? null,
        updatedAt: now,
      },
    });

  await upsertRecruitedStudentFromRecruitmentResult(env, userId, student.studentUid, student.tier);

  const result = await getRecruitmentResult(env, userId, uid);
  if (!result) {
    throw new Error("Failed to add recruited student to recruitment result");
  }

  return result;
}

export async function removeRecruitedStudentFromResult(
  env: Env,
  userId: number,
  recruitmentGroupUid: string,
  studentUid: string,
): Promise<RecruitmentResult | null> {
  const existing = (await getRecruitmentResultsByRecruitmentGroupUids(env, userId, [recruitmentGroupUid]))[0] ?? null;
  if (!existing) {
    return null;
  }

  const db = drizzle(env.DB);
  const now = nowUtcIso();
  const recruitedStudents = removeRecruitmentResultStudent(existing.recruitedStudents, studentUid);
  const completedAt =
    recruitedStudents.length > 0 || existing.exchangedStudents.length > 0 ? existing.completedAt : null;

  await db
    .update(recruitmentResultsTable)
    .set({
      recruitedStudents: JSON.stringify(recruitedStudents),
      completedAt,
      updatedAt: now,
    })
    .where(and(eq(recruitmentResultsTable.userId, userId), eq(recruitmentResultsTable.uid, existing.uid)));

  return getRecruitmentResult(env, userId, existing.uid);
}

export async function setRecruitmentResultCompletion(
  env: Env,
  userId: number,
  recruitmentGroupUid: string,
  completed: boolean,
  options: Omit<UpsertRecruitmentResultInput, "recruitmentGroupUid" | "completedAt"> = {},
): Promise<RecruitmentResult> {
  return upsertRecruitmentResult(env, userId, {
    ...options,
    recruitmentGroupUid,
    completedAt: completed ? nowUtcIso() : null,
  });
}

export async function deleteRecruitmentResult(env: Env, userId: number, uid: string): Promise<void> {
  const db = drizzle(env.DB);
  const existing = await getRecruitmentResult(env, userId, uid);
  if (!existing) {
    return;
  }

  if (existing.commentPostUid) {
    await deleteCommunityPostByUid(env, existing.commentPostUid, userId);
  }

  await db
    .delete(recruitmentResultsTable)
    .where(and(eq(recruitmentResultsTable.userId, userId), eq(recruitmentResultsTable.uid, uid)));
}
