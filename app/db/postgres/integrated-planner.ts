import { and, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { nowUtcIso } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgFavoriteStudentsTable } from "./schema";

export type PostgresIntegratedPlannerOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

async function withIntegratedPlannerDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresIntegratedPlannerOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "integrated_planner");
        span?.setAttribute("integrated_planner.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.integrated_planner.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function savePostgresIntegratedRecruitmentPlan(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  studentUids: readonly string[],
  options: PostgresIntegratedPlannerOptions = {},
): Promise<void> {
  const selectedStudentUids = new Set(studentUids);

  await withIntegratedPlannerDatabase(
    env,
    "recruitment.save",
    async (db) => {
      await db.transaction(async (tx) => {
        const currentFavorites = await tx
          .select({ studentUid: pgFavoriteStudentsTable.studentUid })
          .from(pgFavoriteStudentsTable)
          .where(
            and(eq(pgFavoriteStudentsTable.userId, userId), eq(pgFavoriteStudentsTable.timelineContentUid, eventUid)),
          );
        const currentStudentUids = new Set(currentFavorites.map(({ studentUid }) => studentUid));
        const removedStudentUids = [...currentStudentUids].filter((studentUid) => !selectedStudentUids.has(studentUid));
        const addedStudentUids = [...selectedStudentUids].filter((studentUid) => !currentStudentUids.has(studentUid));

        if (removedStudentUids.length > 0) {
          await tx
            .delete(pgFavoriteStudentsTable)
            .where(
              and(
                eq(pgFavoriteStudentsTable.userId, userId),
                eq(pgFavoriteStudentsTable.timelineContentUid, eventUid),
                inArray(pgFavoriteStudentsTable.studentUid, removedStudentUids),
              ),
            );
        }

        if (addedStudentUids.length > 0) {
          const now = new Date(nowUtcIso());
          await tx
            .insert(pgFavoriteStudentsTable)
            .values(
              addedStudentUids.map((studentUid) => ({
                uid: nanoid(8),
                userId,
                studentUid,
                timelineContentUid: eventUid,
                createdAt: now,
                updatedAt: now,
              })),
            )
            .onConflictDoNothing({
              target: [
                pgFavoriteStudentsTable.userId,
                pgFavoriteStudentsTable.timelineContentUid,
                pgFavoriteStudentsTable.studentUid,
              ],
            });
        }
      });
    },
    options,
  );
}
