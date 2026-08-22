import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();
jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
  utcIsoString: (value: Date | string) => (value instanceof Date ? value.toISOString() : value),
}));

import { getSenseiPrivacyByUserId, upsertSenseiPrivacy } from "~/models/sensei-privacy";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
const row = {
  id: 4,
  userId: 7,
  memberCode: "MEMBER7",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-02T00:00:00.000Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("sensei privacy PostgreSQL contract", () => {
  it("preserves privacy timestamps and member code on reads", async () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => [row],
    };
    const db = { select: jest.fn(() => builder) };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("sensei_privacy_by_user");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(getSenseiPrivacyByUserId(env, 7)).resolves.toEqual({
      id: 4,
      userId: 7,
      memberCode: "MEMBER7",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
  });

  it("upserts privacy by user id instead of creating duplicates", async () => {
    const onConflictDoUpdate = jest.fn(async (_config?: unknown) => undefined);
    const values = jest.fn((_values?: unknown) => ({ onConflictDoUpdate }));
    const db = { insert: jest.fn(() => ({ values })) };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("upsert_sensei_privacy");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(upsertSenseiPrivacy(env, 7, "MEMBER8")).resolves.toBeUndefined();
    expect(values).toHaveBeenCalledWith({ userId: 7, memberCode: "MEMBER8" });
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: expect.any(Array),
      set: expect.objectContaining({ memberCode: "MEMBER8", updatedAt: expect.any(Date) }),
    });
  });
});
