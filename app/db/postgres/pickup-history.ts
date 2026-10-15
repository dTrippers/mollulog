import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import type { PickupHistory } from "~/models/pickup-history";
import { pgPickupHistoriesTable } from "./schema";

type PickupHistoryDatabase = NodePgDatabase;

export type PostgresPickupHistoryOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

async function withPickupHistoryDatabase<T>(
  env: Env,
  operation: (db: PickupHistoryDatabase) => Promise<T>,
  options: PostgresPickupHistoryOptions = {},
): Promise<T> {
  const { createClient = createPostgresClient, ctx } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = () => operation(drizzle(client));
      return ctx ? ctx.tracing.enterSpan("postgres.pickup_histories.operation", run) : run();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresPickupHistory(
  env: Env,
  userId: number,
  uid: string,
  includeRaw = false,
  options: PostgresPickupHistoryOptions = {},
) {
  const row = await withPickupHistoryDatabase(
    env,
    (db) =>
      db
        .select()
        .from(pgPickupHistoriesTable)
        .where(and(eq(pgPickupHistoriesTable.uid, uid), eq(pgPickupHistoriesTable.userId, userId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    options,
  );
  return row ? toPickupHistoryModel(row, includeRaw) : null;
}

function toPickupHistoryModel(row: typeof pgPickupHistoriesTable.$inferSelect, includeRaw = false): PickupHistory {
  const result: PickupHistory = {
    uid: row.uid,
    userId: row.userId,
    eventId: row.eventId,
    result: row.result,
  };
  if (includeRaw) result.rawResult = row.rawResult;
  return result;
}
