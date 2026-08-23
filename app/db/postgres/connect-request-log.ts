import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgConnectRequestLogsTable } from "./schema";

type ConnectRequestLogDatabase = NodePgDatabase;

export type PostgresConnectRequestLogOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

export async function insertPostgresConnectRequestLog(
  env: Env,
  input: {
    uid: string;
    apiKeyUid: string | null;
    endpoint: string;
    status: number;
  },
  options: PostgresConnectRequestLogOptions = {},
): Promise<void> {
  const { createClient = createPostgresClient, ctx } = options;
  await withPostgresClient(
    env,
    async (client) => {
      const run = async (db: ConnectRequestLogDatabase) => {
        await db.insert(pgConnectRequestLogsTable).values(input);
      };
      const db = drizzle(client);
      if (ctx) {
        await ctx.tracing.enterSpan("postgres.connect_request_logs.insert", () => run(db));
      } else {
        await run(db);
      }
    },
    createClient,
    ctx,
  );
}
