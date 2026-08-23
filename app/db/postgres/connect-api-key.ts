import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import type { ConnectApiKeyScope } from "~/models/connect-api-key";
import { pgConnectApiKeysTable } from "./schema";

type ConnectApiKeyDatabase = NodePgDatabase;

export type PostgresConnectApiKeyInput = {
  uid: string;
  userId: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ConnectApiKeyScope[];
};

export type PostgresConnectApiKeyOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

async function withConnectApiKeyDatabase<T>(
  env: Env,
  operation: (db: ConnectApiKeyDatabase) => Promise<T>,
  options: PostgresConnectApiKeyOptions = {},
): Promise<T> {
  const { createClient = createPostgresClient, ctx } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = () => operation(drizzle(client));
      return ctx ? ctx.tracing.enterSpan("postgres.connect_api_keys.operation", run) : run();
    },
    createClient,
    ctx,
  );
}

export async function createPostgresConnectApiKey(
  env: Env,
  input: PostgresConnectApiKeyInput,
  options: PostgresConnectApiKeyOptions = {},
) {
  return withConnectApiKeyDatabase(
    env,
    async (db) => {
      const [row] = await db.insert(pgConnectApiKeysTable).values(input).returning();
      if (!row) throw new Error("Failed to create PostgreSQL Connect API key");
      return row;
    },
    options,
  );
}

export async function listPostgresConnectApiKeys(
  env: Env,
  userId: number,
  options: PostgresConnectApiKeyOptions = {},
) {
  return withConnectApiKeyDatabase(
    env,
    (db) =>
      db
        .select()
        .from(pgConnectApiKeysTable)
        .where(and(eq(pgConnectApiKeysTable.userId, userId), isNull(pgConnectApiKeysTable.revokedAt)))
        .orderBy(desc(pgConnectApiKeysTable.createdAt), desc(pgConnectApiKeysTable.id)),
    options,
  );
}

export async function revokePostgresConnectApiKey(
  env: Env,
  userId: number,
  uid: string,
  revokedAt = new Date(),
  options: PostgresConnectApiKeyOptions = {},
): Promise<void> {
  await withConnectApiKeyDatabase(
    env,
    async (db) => {
      await db
        .update(pgConnectApiKeysTable)
        .set({ revokedAt })
        .where(
          and(
            eq(pgConnectApiKeysTable.userId, userId),
            eq(pgConnectApiKeysTable.uid, uid),
            isNull(pgConnectApiKeysTable.revokedAt),
          ),
        );
    },
    options,
  );
}
