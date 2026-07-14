import { and, count, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgFavoriteStudentsTable } from "~/db/postgres/schema";
import type { FavoritedCount, FavoriteStudent } from "~/domain/favorite-student";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type PostgresFavoriteOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

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
