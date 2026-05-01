import { and, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";


type FavoriteStudent = {
  uid: string;
  studentId: string;
  contentId: string;
};

const favoriteStudentsTable = sqliteTable("content_favorite_students", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  studentId: text().notNull(),
  contentId: text().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

const SELECT_USER_FAVORITE_STUDENTS_COLUMNS = {
  uid: favoriteStudentsTable.uid,
  studentId: favoriteStudentsTable.studentId,
  contentId: favoriteStudentsTable.contentId,
};

export async function getUserFavoritedStudents(env: Env, userId: number, contentId?: string): Promise<FavoriteStudent[]> {
  const db = drizzle(env.DB);
  const filter: SQLWrapper[] = [eq(favoriteStudentsTable.userId, userId)];
  if (contentId) {
    filter.push(eq(favoriteStudentsTable.contentId, contentId));
  }

  return db.select(SELECT_USER_FAVORITE_STUDENTS_COLUMNS).from(favoriteStudentsTable).where(and(...filter)).all();
}


type FavoritedCount = {
  studentId: string;
  contentId: string;
  count: number;
}

export async function getFavoritedCounts(env: Env, studentIds: string[]): Promise<FavoritedCount[]> {
  if (studentIds.length === 0) {
    return [];
  }

  const db = drizzle(env.DB);

  // Cloudflare D1/SQLite has a limit on the number of SQL variables per statement.
  // Use a conservative batch size to avoid hitting the limit.
  const BATCH_SIZE = 90;

  const batches: string[][] = [];
  for (let start = 0; start < studentIds.length; start += BATCH_SIZE) {
    batches.push(studentIds.slice(start, start + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map((batch) =>
      db.select({
        studentId: contentFavoriteCountsTable.studentId,
        contentId: contentFavoriteCountsTable.contentId,
        count: contentFavoriteCountsTable.count,
      })
      .from(contentFavoriteCountsTable)
      .where(inArray(contentFavoriteCountsTable.studentId, batch))
      .all(),
    ),
  );

  return batchResults.flat();
}

// Add new table definition
export const contentFavoriteCountsTable = sqliteTable("content_favorite_counts", {
  id: int().primaryKey({ autoIncrement: true }),
  studentId: text().notNull(),
  contentId: text().notNull(),
  count: int().notNull().default(0),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export async function favoriteStudent(env: Env, userId: number, studentId: string, contentId: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.batch([
    db.insert(favoriteStudentsTable)
      .values({ uid: nanoid(8), userId, studentId, contentId })
      .onConflictDoNothing({
        target: [favoriteStudentsTable.userId, favoriteStudentsTable.contentId, favoriteStudentsTable.studentId],
      }),
    db.insert(contentFavoriteCountsTable)
      .values({ studentId, contentId, count: sql`changes()` })
      .onConflictDoUpdate({
        target: [contentFavoriteCountsTable.studentId, contentFavoriteCountsTable.contentId],
        set: {
          count: sql`${contentFavoriteCountsTable.count} + changes()`,
          updatedAt: sql`case changes() when 1 then current_timestamp else ${contentFavoriteCountsTable.updatedAt} end`,
        },
      }),
  ]);
}

export async function unfavoriteStudent(env: Env, userId: number, studentId: string, contentId: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.batch([
    db.delete(favoriteStudentsTable).where(and(
      eq(favoriteStudentsTable.userId, userId),
      eq(favoriteStudentsTable.studentId, studentId),
      eq(favoriteStudentsTable.contentId, contentId),
    )),
    db.update(contentFavoriteCountsTable)
      .set({
        count: sql`max(${contentFavoriteCountsTable.count} - changes(), 0)`,
        updatedAt: sql`case changes() when 1 then current_timestamp else ${contentFavoriteCountsTable.updatedAt} end`,
      })
      .where(and(
        eq(contentFavoriteCountsTable.studentId, studentId),
        eq(contentFavoriteCountsTable.contentId, contentId),
      )),
  ]);
}
