import { and, asc, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
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

export async function getPostgresPickupHistories(
  env: Env,
  userId: number,
  options: PostgresPickupHistoryOptions = {},
) {
  const rows = await withPickupHistoryDatabase(
    env,
    (db) =>
      db
        .select()
        .from(pgPickupHistoriesTable)
        .where(eq(pgPickupHistoriesTable.userId, userId))
        .orderBy(asc(pgPickupHistoriesTable.id)),
    options,
  );
  return rows.map((row) => toPickupHistoryModel(row));
}

export async function createPostgresPickupHistory(
  env: Env,
  userId: number,
  eventId: string,
  result: PickupHistory["result"],
  rawResult: string | null,
  options: PostgresPickupHistoryOptions = {},
): Promise<void> {
  await withPickupHistoryDatabase(
    env,
    async (db) => {
      await db.insert(pgPickupHistoriesTable).values({
        uid: nanoid(8),
        userId,
        eventId,
        result,
        rawResult,
      });
    },
    options,
  );
}

export async function updatePostgresPickupHistory(
  env: Env,
  userId: number,
  uid: string,
  eventId: string,
  result: PickupHistory["result"],
  rawResult?: string | null,
  options: PostgresPickupHistoryOptions = {},
): Promise<void> {
  await withPickupHistoryDatabase(
    env,
    async (db) => {
      const updateValue: {
        eventId: string;
        result: PickupHistory["result"];
        rawResult?: string | null;
        updatedAt: Date;
      } = { eventId, result, updatedAt: new Date() };
      if (rawResult !== undefined) updateValue.rawResult = rawResult;
      await db
        .update(pgPickupHistoriesTable)
        .set(updateValue)
        .where(and(eq(pgPickupHistoriesTable.uid, uid), eq(pgPickupHistoriesTable.userId, userId)));
    },
    options,
  );
}

export async function deletePostgresPickupHistory(
  env: Env,
  userId: number,
  uid: string,
  options: PostgresPickupHistoryOptions = {},
): Promise<void> {
  await withPickupHistoryDatabase(
    env,
    async (db) => {
      await db
        .delete(pgPickupHistoriesTable)
        .where(and(eq(pgPickupHistoriesTable.uid, uid), eq(pgPickupHistoriesTable.userId, userId)));
    },
    options,
  );
}

function toPickupHistoryModel(
  row: typeof pgPickupHistoriesTable.$inferSelect,
  includeRaw = false,
): PickupHistory {
  const result: PickupHistory = {
    uid: row.uid,
    userId: row.userId,
    eventId: row.eventId,
    result: row.result,
  };
  if (includeRaw) result.rawResult = row.rawResult;
  return result;
}
