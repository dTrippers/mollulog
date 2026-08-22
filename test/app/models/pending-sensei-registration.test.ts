import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();
jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
}));

import {
  createPendingSenseiRegistration,
  deletePendingSenseiRegistration,
  getPendingSenseiRegistration,
} from "~/models/pending-sensei-registration";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
const row = {
  id: 469,
  uid: "pending-469",
  provider: "github" as const,
  providerUserId: "github-469",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("pending OAuth registration PostgreSQL contract", () => {
  it("keeps an existing provider registration and creates a missing one idempotently", async () => {
    let selectCount = 0;
    const selectBuilder = {
      from: () => selectBuilder,
      where: () => selectBuilder,
      limit: async () => (selectCount++ === 0 ? [] : [row]),
    };
    const returning = jest.fn(async () => [row]);
    const onConflictDoNothing = jest.fn((_config?: unknown) => ({ returning }));
    const values = jest.fn(() => ({ onConflictDoNothing }));
    const db = {
      select: jest.fn(() => selectBuilder),
      insert: jest.fn(() => ({ values })),
    };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("create_pending_registration");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(createPendingSenseiRegistration(env, "github", "github-469")).resolves.toEqual({
      uid: row.uid,
      provider: row.provider,
      providerUserId: row.providerUserId,
    });
    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: expect.any(Array) });
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it("reads and deletes the pending row by its stable uid", async () => {
    const selectBuilder = {
      from: () => selectBuilder,
      where: () => selectBuilder,
      limit: async () => [row],
    };
    const db = {
      select: jest.fn(() => selectBuilder),
      delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
    };
    mockWithIdentityDatabase
      .mockImplementationOnce(async (_env, queryName, operation) => {
        expect(queryName).toBe("pending_registration_by_uid");
        return (operation as (database: typeof db) => unknown)(db);
      })
      .mockImplementationOnce(async (_env, queryName, operation) => {
        expect(queryName).toBe("delete_pending_registration");
        return (operation as (database: typeof db) => unknown)(db);
      });

    await expect(getPendingSenseiRegistration(env, row.uid)).resolves.toEqual({
      uid: row.uid,
      provider: row.provider,
      providerUserId: row.providerUserId,
    });
    await expect(deletePendingSenseiRegistration(env, row.uid)).resolves.toBeUndefined();
    expect(db.delete).toHaveBeenCalledTimes(1);
  });
});
