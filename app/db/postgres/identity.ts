import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type IdentityDatabase = NodePgDatabase;

export type IdentityRepositoryOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

/**
 * Runs one identity operation on one operation-scoped PostgreSQL client.
 * Identity writes intentionally do not fall back to D1 when PostgreSQL is
 * unavailable: after cutover PostgreSQL is the canonical store.
 */
export function withIdentityDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: IdentityDatabase) => Promise<T>,
  options: IdentityRepositoryOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "identity");
        span?.setAttribute("identity.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.identity.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

/**
 * Runs a group of identity writes in one transaction on the same
 * operation-scoped PostgreSQL connection.
 */
export function withIdentityTransaction<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: IdentityDatabase) => Promise<T>,
  options: IdentityRepositoryOptions = {},
): Promise<T> {
  return withIdentityDatabase(
    env,
    queryName,
    (db) => db.transaction((tx) => operation(tx as unknown as IdentityDatabase)),
    options,
  );
}

export function utcIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
