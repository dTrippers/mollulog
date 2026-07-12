import { Client } from "pg";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";

type HyperdriveEnv = Pick<Env, "HYPERDRIVE">;
type PostgresClientFactory = (env: HyperdriveEnv) => Client;

/**
 * Creates one PostgreSQL connection for one request or scheduled job.
 * Hyperdrive owns the reusable origin pool, so this client must not be cached
 * in module scope or shared between requests.
 */
export function createPostgresClient(env: HyperdriveEnv): Client {
  return new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: RUNTIME_TIMEOUTS.postgres.connect,
  });
}

/** Connects and always releases the request-scoped client. */
export async function withPostgresClient<T>(
  env: HyperdriveEnv,
  operation: (client: Client) => Promise<T>,
  createClient: PostgresClientFactory = createPostgresClient,
): Promise<T> {
  const client = createClient(env);
  await client.connect();

  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

/** Minimal read-only probe for Phase 0 connectivity checks. */
export async function probePostgres(
  env: HyperdriveEnv,
  createClient: PostgresClientFactory = createPostgresClient,
): Promise<void> {
  await withPostgresClient(
    env,
    async (client) => {
      await client.query("SELECT 1");
    },
    createClient,
  );
}
