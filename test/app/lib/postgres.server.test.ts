import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { createPostgresClient, probePostgres, withPostgresClient } from "~/lib/postgres.server";

const connectionString = "postgres://local:test@127.0.0.1:5432/mollulog";

function createEnv(): Pick<Env, "HYPERDRIVE"> {
  return {
    HYPERDRIVE: { connectionString } as Hyperdrive,
  };
}

function createClient() {
  const connect = jest.fn(async () => undefined);
  const query = jest.fn(async (_sql: string) => ({ rows: [], rowCount: 1 }));
  const end = jest.fn(async () => undefined);
  return {
    client: { connect, query, end } as unknown as Client,
    connect,
    query,
    end,
  };
}

describe("request-scoped PostgreSQL client", () => {
  it("uses the Hyperdrive connection string and configured connect timeout", () => {
    const client = createPostgresClient(createEnv());

    const connectionParameters = (
      client as unknown as {
        connectionParameters: Record<string, unknown>;
      }
    ).connectionParameters;

    expect(connectionParameters).toEqual(
      expect.objectContaining({
        database: "mollulog",
        host: "127.0.0.1",
        port: 5432,
        user: "local",
        connect_timeout: 5,
      }),
    );
  });

  it("closes the client after a successful operation", async () => {
    const { client, connect, end } = createClient();

    await expect(
      withPostgresClient(
        createEnv(),
        async () => "ok",
        () => client,
      ),
    ).resolves.toBe("ok");

    expect(connect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("closes the client when the operation fails", async () => {
    const { client, end } = createClient();
    const error = new Error("query failed");

    await expect(
      withPostgresClient(
        createEnv(),
        async () => {
          throw error;
        },
        () => client,
      ),
    ).rejects.toBe(error);

    expect(end).toHaveBeenCalledTimes(1);
  });

  it("runs a read-only smoke query", async () => {
    const { client, query } = createClient();

    await probePostgres(createEnv(), () => client);

    expect(query).toHaveBeenCalledWith("SELECT 1");
  });
});
