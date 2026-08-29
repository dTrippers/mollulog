import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type IdentityDatabase = NodePgDatabase;

export type IdentityRepositoryOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

export type DiscordOwnershipClaim = {
  discordUserId: string;
  userId?: number;
};

export type DiscordOwnershipState = {
  identities: Array<{ userId: number; discordUserId: string }>;
  connections: Array<{ userId: number; discordUserId: string; status: string }>;
};

export type DiscordOwnershipConflictReason = "discord_in_use" | "discord_id_mismatch";

/**
 * Raised after the ownership transaction finds a Discord ID that cannot be
 * claimed by the requested MolluLog user.
 *
 * The reason is intentionally machine-readable only. Callers map it to a
 * safe user-facing message without exposing provider identifiers.
 */
export class DiscordOwnershipConflictError extends Error {
  readonly reason: DiscordOwnershipConflictReason;

  constructor(reason: DiscordOwnershipConflictReason) {
    super(reason);
    this.name = "DiscordOwnershipConflictError";
    this.reason = reason;
  }
}

type DiscordOwnershipRow = {
  user_id: number;
  discord_user_id: string;
  status?: string;
};

type DiscordIdentityOwnershipRow = {
  sensei_id: number;
  provider_user_id: string;
};

function lockLabel(kind: "discord" | "user", value: string | number): string {
  return `mollulog:discord-ownership:${kind}:${value}`;
}

/**
 * Transaction-level locks are acquired in the same lexical order by every
 * Discord claim path. PostgreSQL's hash lock key is stable for a given label;
 * collisions only serialize unrelated claims and cannot weaken ownership.
 */
export async function lockDiscordOwnershipUser(client: Client, userId: number): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockLabel("user", userId)]);
}

async function lockDiscordOwnership(client: Client, claim: DiscordOwnershipClaim): Promise<void> {
  const normalizedDiscordUserId = claim.discordUserId.trim();
  const labels = [lockLabel("discord", normalizedDiscordUserId)];
  if (claim.userId !== undefined) {
    labels.push(lockLabel("user", claim.userId));
  }
  labels.sort();
  for (const label of labels) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [label]);
  }
}

async function readDiscordOwnership(client: Client, claim: DiscordOwnershipClaim): Promise<DiscordOwnershipState> {
  const normalizedDiscordUserId = claim.discordUserId.trim();
  const identityParams: Array<string | number> = [normalizedDiscordUserId];
  const connectionParams: Array<string | number> = [normalizedDiscordUserId];
  const userPredicate = claim.userId === undefined ? "" : " or sensei_id = $2";
  const connectionUserPredicate = claim.userId === undefined ? "" : " or user_id = $2";
  if (claim.userId !== undefined) {
    identityParams.push(claim.userId);
    connectionParams.push(claim.userId);
  }

  const [identityResult, connectionResult] = await Promise.all([
    client.query<DiscordIdentityOwnershipRow>(
      `select sensei_id, provider_user_id
         from auth_identities
        where provider = 'discord'
          and (provider_user_id = $1${userPredicate})
        for update`,
      identityParams,
    ),
    client.query<DiscordOwnershipRow>(
      `select user_id, discord_user_id, status
         from discord_connections
        where (discord_user_id = $1${connectionUserPredicate})
        for update`,
      connectionParams,
    ),
  ]);

  return {
    identities: identityResult.rows.map((row) => ({
      userId: Number(row.sensei_id),
      discordUserId: String(row.provider_user_id),
    })),
    connections: connectionResult.rows.map((row) => ({
      userId: Number(row.user_id),
      discordUserId: String(row.discord_user_id),
      status: String(row.status ?? ""),
    })),
  };
}

function validateDiscordOwnershipClaim(claim: DiscordOwnershipClaim, ownership: DiscordOwnershipState): void {
  const ownerIds = new Set([
    ...ownership.identities.map((identity) => identity.userId),
    ...ownership.connections.map((connection) => connection.userId),
  ]);

  if (claim.userId === undefined) {
    if (ownerIds.size > 0) {
      throw new DiscordOwnershipConflictError("discord_in_use");
    }
    return;
  }

  if ([...ownerIds].some((ownerId) => ownerId !== claim.userId)) {
    throw new DiscordOwnershipConflictError("discord_in_use");
  }

  const userIdentityIds = ownership.identities
    .filter((identity) => identity.userId === claim.userId)
    .map((identity) => identity.discordUserId);
  const userConnectionIds = ownership.connections
    .filter((connection) => connection.userId === claim.userId)
    .map((connection) => connection.discordUserId);
  const mismatchedIds = [...userIdentityIds, ...userConnectionIds].some(
    (discordUserId) => discordUserId !== claim.discordUserId.trim(),
  );
  if (mismatchedIds) {
    throw new DiscordOwnershipConflictError("discord_id_mismatch");
  }
}

/**
 * Executes one Discord ownership claim in a single PostgreSQL transaction.
 * The callback runs only after both identity tables have been locked and
 * checked, so every caller shares the same cross-table claim boundary.
 */
export function withDiscordOwnershipTransaction<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  claim: DiscordOwnershipClaim,
  operation: (db: IdentityDatabase, client: Client, ownership: DiscordOwnershipState) => Promise<T>,
  options: IdentityRepositoryOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = async () => {
        await client.query("BEGIN");
        try {
          await lockDiscordOwnership(client, claim);
          const ownership = await readDiscordOwnership(client, claim);
          validateDiscordOwnershipClaim(claim, ownership);
          const result = await operation(drizzle(client), client, ownership);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original claim or database error.
          }
          throw error;
        }
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.identity.${queryName}`, run) : run();
    },
    createClient,
    ctx,
  );
}

/**
 * Runs a Discord connection lifecycle mutation that only targets a known
 * MolluLog user. The user lock is shared with the two-key claim helper and
 * prevents unlink/status changes from racing a claim for that user.
 */
export function withDiscordUserTransaction<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  userId: number,
  operation: (db: IdentityDatabase, client: Client) => Promise<T>,
  options: IdentityRepositoryOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = async () => {
        await client.query("BEGIN");
        try {
          await lockDiscordOwnershipUser(client, userId);
          const result = await operation(drizzle(client), client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original lifecycle or database error.
          }
          throw error;
        }
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.identity.${queryName}`, run) : run();
    },
    createClient,
    ctx,
  );
}

/**
 * Runs the common cross-table ownership check without writing. This is used
 * by Discord sign-in before deciding whether to create a pending registration.
 */
export function assertDiscordOwnership(
  env: Pick<Env, "HYPERDRIVE">,
  claim: DiscordOwnershipClaim,
  options: IdentityRepositoryOptions = {},
): Promise<DiscordOwnershipState> {
  return withDiscordOwnershipTransaction(
    env,
    "assert_discord_ownership",
    claim,
    async (_db, _client, ownership) => ownership,
    options,
  );
}

/**
 * Runs one identity operation on one operation-scoped PostgreSQL client.
 * Identity writes intentionally do not fall back to another store when
 * PostgreSQL is unavailable: PostgreSQL is the canonical store.
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
