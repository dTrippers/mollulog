import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgFavoriteStudentsTable } from "~/db/postgres/schema";
import type { FavoritedCount, FavoriteStudent, FavoriteStudentRecord } from "~/domain/favorite-student";
import { normalizeInstant } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type PgFavoriteStudent = typeof pgFavoriteStudentsTable.$inferSelect;

export type PostgresFavoriteOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

export function toFavoriteRecord(row: PgFavoriteStudent): FavoriteStudentRecord {
  return {
    id: row.id,
    uid: row.uid,
    userId: row.userId,
    studentId: row.studentUid,
    contentId: row.timelineContentUid,
    createdAt: normalizeInstant(row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt),
    updatedAt: normalizeInstant(row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt),
  };
}

async function withFavoriteDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresFavoriteOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "content_favorite_students");
        span?.setAttribute("favorite.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.favorites.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresUserFavoritedStudents(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  timelineContentUid?: string,
  options: PostgresFavoriteOptions = {},
): Promise<FavoriteStudent[]> {
  return withFavoriteDatabase(
    env,
    "get_by_user",
    async (db) => {
      const filters = [eq(pgFavoriteStudentsTable.userId, userId)];
      if (timelineContentUid) {
        filters.push(eq(pgFavoriteStudentsTable.timelineContentUid, timelineContentUid));
      }
      return db
        .select({
          uid: pgFavoriteStudentsTable.uid,
          studentId: pgFavoriteStudentsTable.studentUid,
          contentId: pgFavoriteStudentsTable.timelineContentUid,
        })
        .from(pgFavoriteStudentsTable)
        .where(and(...filters));
    },
    options,
  );
}

export async function getPostgresFavoritedCounts(
  env: Pick<Env, "HYPERDRIVE">,
  studentUids: string[],
  options: PostgresFavoriteOptions = {},
): Promise<FavoritedCount[]> {
  const uniqueStudentUids = [...new Set(studentUids)];
  if (uniqueStudentUids.length === 0) return [];
  return withFavoriteDatabase(
    env,
    "get_counts",
    (db) =>
      db
        .select({
          studentId: pgFavoriteStudentsTable.studentUid,
          contentId: pgFavoriteStudentsTable.timelineContentUid,
          count: count(),
        })
        .from(pgFavoriteStudentsTable)
        .where(inArray(pgFavoriteStudentsTable.studentUid, uniqueStudentUids))
        .groupBy(pgFavoriteStudentsTable.studentUid, pgFavoriteStudentsTable.timelineContentUid),
    options,
  );
}

export async function applyPostgresFavoriteState(
  env: Pick<Env, "HYPERDRIVE">,
  key: { userId: number; studentId: string; contentId: string },
  record: FavoriteStudentRecord | null,
  options: PostgresFavoriteOptions = {},
): Promise<void> {
  await withFavoriteDatabase(
    env,
    "apply_state",
    async (db) => {
      if (!record) {
        await db
          .delete(pgFavoriteStudentsTable)
          .where(
            and(
              eq(pgFavoriteStudentsTable.userId, key.userId),
              eq(pgFavoriteStudentsTable.studentUid, key.studentId),
              eq(pgFavoriteStudentsTable.timelineContentUid, key.contentId),
            ),
          );
        return;
      }
      await upsertPostgresFavoriteRecords(db, [record]);
    },
    options,
  );
}

export async function setPostgresFavoriteState(
  env: Pick<Env, "HYPERDRIVE">,
  key: { userId: number; studentId: string; contentId: string },
  favorited: boolean,
  options: PostgresFavoriteOptions = {},
): Promise<void> {
  await withFavoriteDatabase(
    env,
    "set_state",
    async (db) => {
      if (!favorited) {
        await db
          .delete(pgFavoriteStudentsTable)
          .where(
            and(
              eq(pgFavoriteStudentsTable.userId, key.userId),
              eq(pgFavoriteStudentsTable.studentUid, key.studentId),
              eq(pgFavoriteStudentsTable.timelineContentUid, key.contentId),
            ),
          );
        return;
      }
      const now = new Date();
      await db
        .insert(pgFavoriteStudentsTable)
        .values({
          uid: nanoid(8),
          userId: key.userId,
          studentUid: key.studentId,
          timelineContentUid: key.contentId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            pgFavoriteStudentsTable.userId,
            pgFavoriteStudentsTable.timelineContentUid,
            pgFavoriteStudentsTable.studentUid,
          ],
        });
    },
    options,
  );
}

export async function upsertPostgresFavoriteRecords(
  db: NodePgDatabase,
  records: FavoriteStudentRecord[],
): Promise<void> {
  if (records.length === 0) return;
  await db
    .insert(pgFavoriteStudentsTable)
    .values(
      records.map((record) => ({
        id: record.id,
        uid: record.uid,
        userId: record.userId,
        studentUid: record.studentId,
        timelineContentUid: record.contentId,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      })),
    )
    .onConflictDoUpdate({
      target: [
        pgFavoriteStudentsTable.userId,
        pgFavoriteStudentsTable.timelineContentUid,
        pgFavoriteStudentsTable.studentUid,
      ],
      set: {
        id: sql`excluded.id`,
        uid: sql`excluded.uid`,
        createdAt: sql`excluded.created_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

export async function getPostgresFavoriteRecordsPage(
  db: NodePgDatabase,
  afterId: number,
  limit: number,
): Promise<FavoriteStudentRecord[]> {
  const rows = await db
    .select()
    .from(pgFavoriteStudentsTable)
    .where(gt(pgFavoriteStudentsTable.id, afterId))
    .orderBy(asc(pgFavoriteStudentsTable.id))
    .limit(limit);
  return rows.map(toFavoriteRecord);
}

export async function getPostgresFavoriteRecordsByUids(
  db: NodePgDatabase,
  uids: string[],
): Promise<FavoriteStudentRecord[]> {
  if (uids.length === 0) return [];
  const rows = await db.select().from(pgFavoriteStudentsTable).where(inArray(pgFavoriteStudentsTable.uid, uids));
  return rows.map(toFavoriteRecord);
}

export async function deletePostgresFavoriteRecordsByUids(db: NodePgDatabase, uids: string[]): Promise<number> {
  if (uids.length === 0) return 0;
  const deleted = await db
    .delete(pgFavoriteStudentsTable)
    .where(inArray(pgFavoriteStudentsTable.uid, uids))
    .returning({ uid: pgFavoriteStudentsTable.uid });
  return deleted.length;
}
