import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { isRecruitGoal, type RecruitGoal } from "~/domain/recruit-recommendation";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgRecruitRecommendationProfilesTable } from "./schema";

export type PostgresRecruitRecommendationProfileOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

async function withProfileDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresRecruitRecommendationProfileOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "recruit_recommendation_profiles");
        span?.setAttribute("recruit_recommendation.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.recruit_recommendation.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

/** The goal the user chose, or null when the user has not chosen one. A stored value outside the goals is a failure. */
export async function getPostgresRecruitGoal(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresRecruitRecommendationProfileOptions = {},
): Promise<RecruitGoal | null> {
  return withProfileDatabase(
    env,
    "get_goal",
    async (db) => {
      const [row] = await db
        .select({ goal: pgRecruitRecommendationProfilesTable.goal })
        .from(pgRecruitRecommendationProfilesTable)
        .where(eq(pgRecruitRecommendationProfilesTable.userId, userId))
        .limit(1);
      if (!row) return null;
      if (!isRecruitGoal(row.goal)) throw new Error(`Invalid stored recruit goal: ${String(row.goal)}`);
      return row.goal;
    },
    options,
  );
}

export async function setPostgresRecruitGoal(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  goal: RecruitGoal,
  options: PostgresRecruitRecommendationProfileOptions = {},
): Promise<void> {
  await withProfileDatabase(
    env,
    "set_goal",
    async (db) => {
      const now = new Date();
      await db
        .insert(pgRecruitRecommendationProfilesTable)
        .values({ userId, goal, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: pgRecruitRecommendationProfilesTable.userId,
          set: { goal, updatedAt: now },
        });
    },
    options,
  );
}
