import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();
const mockWithIdentityTransaction = jest.fn();

jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
  withIdentityTransaction: (...args: unknown[]) => mockWithIdentityTransaction(...args),
}));

import type { pgSenseisTable } from "~/db/postgres/schema";
import { createSenseiWithAuthIdentity, getSenseiByAuthIdentity, linkAuthIdentity } from "~/models/auth-identity";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
const senseiRow: typeof pgSenseisTable.$inferSelect = {
  id: 12,
  uid: "sensei-12",
  username: "teacher",
  friendCode: null,
  profileStudentId: null,
  googleId: "google-1",
  githubId: null,
  active: true,
  sessionVersion: 0,
  bio: null,
  role: "guest",
  profileVisibility: "public",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

function createIdentityDb() {
  const insertedValues: unknown[] = [];
  const db = {
    insert: jest.fn(() => ({
      values: jest.fn((values: unknown) => {
        insertedValues.push(values);
        return {
          returning: jest.fn(async () => (insertedValues.length === 1 ? [senseiRow] : [])),
        };
      }),
    })),
    transaction: jest.fn(async (operation: unknown) => (operation as (database: typeof db) => unknown)(db)),
  };
  return { db, insertedValues };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("OAuth identity contracts", () => {
  it.each([
    ["google", "google-1"],
    ["github", "github-1"],
  ] as const)("creates the %s profile and identity in one transaction", async (provider, providerUserId) => {
    const { db, insertedValues } = createIdentityDb();
    mockWithIdentityTransaction.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("create_sensei_with_auth_identity");
      return db.transaction(operation as unknown);
    });

    await expect(
      createSenseiWithAuthIdentity(
        env,
        { username: "teacher", friendCode: null, profileStudentId: null, bio: null },
        provider,
        providerUserId,
      ),
    ).resolves.toMatchObject({ sensei: { id: 12, active: true } });
    expect(mockWithIdentityTransaction).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[1]).toMatchObject({ senseiId: 12, provider, providerUserId });
  });

  it.each([
    "google",
    "github",
  ] as const)("maps a %s identity duplicate from the transaction without leaving a profile result", async (provider) => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "auth_identities_provider_user_uidx",
    });
    let rolledBack = false;
    mockWithIdentityTransaction.mockImplementationOnce(async (_env, _queryName, operation) => {
      const db = {
        insert: jest.fn(() => ({
          values: jest.fn((values: unknown) => {
            if (typeof values === "object" && values !== null && "providerUserId" in values) {
              return Promise.reject(duplicate);
            }
            return { returning: jest.fn(async () => [senseiRow]) };
          }),
        })),
        transaction: jest.fn(async (callback: unknown) => {
          try {
            return await (callback as (database: typeof db) => Promise<unknown>)(db);
          } catch (error) {
            rolledBack = true;
            throw error;
          }
        }),
      };
      return db.transaction(operation as unknown);
    });

    await expect(
      createSenseiWithAuthIdentity(
        env,
        { username: "teacher", friendCode: null, profileStudentId: null, bio: null },
        provider,
        `${provider}-1`,
      ),
    ).resolves.toEqual({ error: { form: "이미 다른 계정에 연결된 로그인 계정이에요." } });
    expect(rolledBack).toBe(true);
  });

  it.each(["google", "github"] as const)("keeps %s linking duplicate-safe", async (provider) => {
    const existing = { senseiId: 12 };
    let selectCount = 0;
    const selectBuilder = {
      from: () => selectBuilder,
      where: () => selectBuilder,
      limit: async () => (selectCount++ === 0 ? [existing] : [{ id: 12 }]),
    };
    const db = {
      select: jest.fn(() => selectBuilder),
      transaction: jest.fn(async (operation: unknown) =>
        (operation as (database: unknown) => unknown)({
          insert: jest.fn(() => ({ values: jest.fn(() => ({ onConflictDoNothing: jest.fn() })) })),
          update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn() })) })),
        }),
      ),
    };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, _queryName, operation) =>
      (operation as (database: typeof db) => unknown)(db),
    );

    await expect(linkAuthIdentity(env, 12, provider, `${provider}-1`)).resolves.toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["google", "google-1"],
    ["github", "github-1"],
  ] as const)("looks up the %s identity through the PostgreSQL join", async (provider, providerUserId) => {
    const selectBuilder = {
      from: () => selectBuilder,
      innerJoin: () => selectBuilder,
      where: () => selectBuilder,
      limit: async () => [{ sensei: senseiRow }],
    };
    const db = { select: jest.fn(() => selectBuilder) };
    mockWithIdentityDatabase.mockImplementation(async (_env, _queryName, operation) =>
      (operation as (database: typeof db) => unknown)(db),
    );

    await expect(getSenseiByAuthIdentity(env, provider, providerUserId)).resolves.toMatchObject({ id: 12 });
    expect(db.select).toHaveBeenCalled();
  });
});
