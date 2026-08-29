import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";

const mockWithPostgresClient = jest.fn();

jest.mock("~/lib/postgres.server", () => ({
  createPostgresClient: jest.fn(),
  withPostgresClient: (...args: unknown[]) => mockWithPostgresClient(...args),
}));

import { assertDiscordOwnership, withDiscordOwnershipTransaction } from "~/db/postgres/identity";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;

type OwnershipRows = {
  identities?: Array<{ sensei_id: number; provider_user_id: string }>;
  connections?: Array<{ user_id: number; discord_user_id: string; status: string }>;
};

function setupClient(rows: OwnershipRows = {}) {
  const statements: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      statements.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (sql.includes("from auth_identities")) return { rows: rows.identities ?? [], rowCount: 0 };
      if (sql.includes("from discord_connections")) return { rows: rows.connections ?? [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }),
  } as unknown as Client;
  mockWithPostgresClient.mockImplementationOnce(async (_env, operation) =>
    (operation as (databaseClient: Client) => Promise<unknown>)(client),
  );
  return { client, statements };
}

describe("Discord ownership transaction", () => {
  it("serializes the Discord and user keys in deterministic order and allows the same owner", async () => {
    const { statements } = setupClient({
      identities: [{ sensei_id: 7, provider_user_id: "1234567890" }],
      connections: [{ user_id: 7, discord_user_id: "1234567890", status: "active" }],
    });

    await expect(
      withDiscordOwnershipTransaction(
        env,
        "test_claim",
        { userId: 7, discordUserId: "1234567890" },
        async () => "claimed",
      ),
    ).resolves.toBe("claimed");

    const lockParams = statements
      .filter(({ sql }) => sql.startsWith("select pg_advisory_xact_lock"))
      .map(({ params }) => params?.[0]);
    expect(lockParams).toEqual(["mollulog:discord-ownership:discord:1234567890", "mollulog:discord-ownership:user:7"]);
    expect(statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("rejects a Discord ID owned by another user before the callback can write", async () => {
    const { statements } = setupClient({
      connections: [{ user_id: 8, discord_user_id: "1234567890", status: "pending" }],
    });
    const operation = jest.fn(async () => undefined);

    await expect(
      withDiscordOwnershipTransaction(env, "test_claim", { userId: 7, discordUserId: "1234567890" }, operation),
    ).rejects.toMatchObject({ reason: "discord_in_use" });

    expect(operation).not.toHaveBeenCalled();
    expect(statements.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("rejects a second Discord ID for a user that already owns another one", async () => {
    setupClient({
      identities: [{ sensei_id: 7, provider_user_id: "1111111111" }],
    });

    await expect(
      withDiscordOwnershipTransaction(
        env,
        "test_claim",
        { userId: 7, discordUserId: "2222222222" },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ reason: "discord_id_mismatch" });
  });

  it("uses the same cross-table check for an anonymous sign-in probe", async () => {
    const { statements } = setupClient();
    await expect(assertDiscordOwnership(env, { discordUserId: "1234567890" })).resolves.toEqual({
      identities: [],
      connections: [],
    });
    expect(statements.some(({ sql }) => sql.includes("for update"))).toBe(true);
    expect(statements.at(-1)?.sql).toBe("COMMIT");
  });
});
