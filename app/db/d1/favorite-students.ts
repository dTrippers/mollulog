import { and, asc, eq, gt, inArray, lte, type SQLWrapper, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import type { FavoritedCount, FavoriteStudent, FavoriteStudentRecord } from "~/domain/favorite-student";
import { type ConcurrencyGate, mapWithConcurrencyLimit } from "~/lib/concurrency";
import { normalizeInstant } from "~/lib/date-time";

export const d1FavoriteStudentsTable = sqliteTable("content_favorite_students", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  studentId: text().notNull(),
  contentId: text().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export const d1FavoriteCountsTable = sqliteTable("content_favorite_counts", {
  id: int().primaryKey({ autoIncrement: true }),
  studentId: text().notNull(),
  contentId: text().notNull(),
  count: int().notNull().default(0),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

const FAVORITED_COUNT_QUERY_CONCURRENCY = 4;
const D1_IN_QUERY_BATCH_SIZE = 90;

const favoriteColumns = {
  uid: d1FavoriteStudentsTable.uid,
  studentId: d1FavoriteStudentsTable.studentId,
  contentId: d1FavoriteStudentsTable.contentId,
};

function toRecord(row: typeof d1FavoriteStudentsTable.$inferSelect): FavoriteStudentRecord {
  return {
    id: row.id,
    uid: row.uid,
    userId: row.userId,
    studentId: row.studentId,
    contentId: row.contentId,
    createdAt: normalizeInstant(row.createdAt),
    updatedAt: normalizeInstant(row.updatedAt),
  };
}

export async function getD1UserFavoritedStudents(
  env: Pick<Env, "DB">,
  userId: number,
  contentId?: string,
): Promise<FavoriteStudent[]> {
  const db = drizzle(env.DB);
  const filter: SQLWrapper[] = [eq(d1FavoriteStudentsTable.userId, userId)];
  if (contentId) filter.push(eq(d1FavoriteStudentsTable.contentId, contentId));
  return db
    .select(favoriteColumns)
    .from(d1FavoriteStudentsTable)
    .where(and(...filter))
    .all();
}

export async function getD1FavoritedCounts(
  env: Pick<Env, "DB">,
  studentIds: string[],
  concurrencyGate?: ConcurrencyGate,
): Promise<FavoritedCount[]> {
  const uniqueStudentIds = [...new Set(studentIds)];
  if (uniqueStudentIds.length === 0) return [];

  const db = drizzle(env.DB);
  const runQuery: ConcurrencyGate = concurrencyGate ?? ((task) => task());
  const batches: string[][] = [];
  for (let start = 0; start < uniqueStudentIds.length; start += D1_IN_QUERY_BATCH_SIZE) {
    batches.push(uniqueStudentIds.slice(start, start + D1_IN_QUERY_BATCH_SIZE));
  }
  const batchResults = await mapWithConcurrencyLimit(batches, FAVORITED_COUNT_QUERY_CONCURRENCY, (batch) =>
    runQuery(() =>
      db
        .select({
          studentId: d1FavoriteCountsTable.studentId,
          contentId: d1FavoriteCountsTable.contentId,
          count: d1FavoriteCountsTable.count,
        })
        .from(d1FavoriteCountsTable)
        .where(inArray(d1FavoriteCountsTable.studentId, batch))
        .all(),
    ),
  );
  return batchResults.flat();
}

export async function favoriteStudentD1(
  env: Pick<Env, "DB">,
  userId: number,
  studentId: string,
  contentId: string,
): Promise<void> {
  const db = drizzle(env.DB);
  await db.batch([
    db
      .insert(d1FavoriteStudentsTable)
      .values({ uid: nanoid(8), userId, studentId, contentId })
      .onConflictDoNothing({
        target: [d1FavoriteStudentsTable.userId, d1FavoriteStudentsTable.contentId, d1FavoriteStudentsTable.studentId],
      }),
    db
      .insert(d1FavoriteCountsTable)
      .values({ studentId, contentId, count: sql`changes()` })
      .onConflictDoUpdate({
        target: [d1FavoriteCountsTable.studentId, d1FavoriteCountsTable.contentId],
        set: {
          count: sql`${d1FavoriteCountsTable.count} + changes()`,
          updatedAt: sql`case changes() when 1 then current_timestamp else ${d1FavoriteCountsTable.updatedAt} end`,
        },
      }),
  ]);
}

export async function unfavoriteStudentD1(
  env: Pick<Env, "DB">,
  userId: number,
  studentId: string,
  contentId: string,
): Promise<void> {
  const db = drizzle(env.DB);
  await db.batch([
    db
      .delete(d1FavoriteStudentsTable)
      .where(
        and(
          eq(d1FavoriteStudentsTable.userId, userId),
          eq(d1FavoriteStudentsTable.studentId, studentId),
          eq(d1FavoriteStudentsTable.contentId, contentId),
        ),
      ),
    db
      .update(d1FavoriteCountsTable)
      .set({
        count: sql`max(${d1FavoriteCountsTable.count} - changes(), 0)`,
        updatedAt: sql`case changes() when 1 then current_timestamp else ${d1FavoriteCountsTable.updatedAt} end`,
      })
      .where(and(eq(d1FavoriteCountsTable.studentId, studentId), eq(d1FavoriteCountsTable.contentId, contentId))),
  ]);
}

export async function getD1FavoriteRecord(
  env: Pick<Env, "DB">,
  userId: number,
  studentId: string,
  contentId: string,
): Promise<FavoriteStudentRecord | null> {
  const [row] = await drizzle(env.DB)
    .select()
    .from(d1FavoriteStudentsTable)
    .where(
      and(
        eq(d1FavoriteStudentsTable.userId, userId),
        eq(d1FavoriteStudentsTable.studentId, studentId),
        eq(d1FavoriteStudentsTable.contentId, contentId),
      ),
    )
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function getD1FavoriteRecordsPage(
  env: Pick<Env, "DB">,
  afterId: number,
  limit: number,
): Promise<FavoriteStudentRecord[]> {
  const rows = await drizzle(env.DB)
    .select()
    .from(d1FavoriteStudentsTable)
    .where(gt(d1FavoriteStudentsTable.id, afterId))
    .orderBy(asc(d1FavoriteStudentsTable.id))
    .limit(limit);
  return rows.map(toRecord);
}

export async function getD1FavoriteRecordsThroughId(
  env: Pick<Env, "DB">,
  afterId: number,
  throughId: number,
): Promise<FavoriteStudentRecord[]> {
  const rows = await drizzle(env.DB)
    .select()
    .from(d1FavoriteStudentsTable)
    .where(and(gt(d1FavoriteStudentsTable.id, afterId), lte(d1FavoriteStudentsTable.id, throughId)))
    .orderBy(asc(d1FavoriteStudentsTable.id));
  return rows.map(toRecord);
}
