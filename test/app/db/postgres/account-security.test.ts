import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();
const mockWithIdentityTransaction = jest.fn();

jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
  withIdentityTransaction: (...args: unknown[]) => mockWithIdentityTransaction(...args),
}));

import { getAccountSessionState, leaveAccount } from "~/db/postgres/account-security";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;

function createLeaveDb(
  sensei: Record<string, unknown> | undefined,
  identities: Array<Record<string, unknown>> = [],
) {
  let selectCount = 0;
  const deletes: unknown[] = [];
  const updates: unknown[] = [];
  const db = {
    select: jest.fn(() => {
      const selectIndex = selectCount++;
      if (selectIndex === 0) {
        const lockBuilder = {
          for: jest.fn(async () => (sensei ? [sensei] : [])),
        };
        const limitBuilder = {
          for: lockBuilder.for,
        };
        const whereBuilder = {
          limit: jest.fn(() => limitBuilder),
        };
        return {
          from: jest.fn(() => ({ where: jest.fn(() => whereBuilder) })),
        };
      }
      return {
        from: jest.fn(() => ({ where: jest.fn(async () => identities) })),
      };
    }),
    delete: jest.fn((table: unknown) => {
      deletes.push(table);
      return { where: jest.fn(async () => undefined) };
    }),
    update: jest.fn((table: unknown) => ({
      set: jest.fn((values: unknown) => {
        updates.push({ table, values });
        return { where: jest.fn(async () => undefined) };
      }),
    })),
  };
  return { db, deletes, updates };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("account-security PostgreSQL repository", () => {
  it("reads the active flag and session version from the canonical row", async () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => [{ active: true, sessionVersion: 4 }],
    };
    const db = { select: jest.fn(() => builder) };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("account_session_state");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(getAccountSessionState(env, 7)).resolves.toEqual({ active: true, sessionVersion: 4 });
  });

  it("does not mutate any table when the submitted username does not match", async () => {
    const { db, deletes, updates } = createLeaveDb({
      id: 7,
      uid: "sensei-7",
      username: "teacher",
      googleId: "google-1",
      githubId: null,
      active: true,
      sessionVersion: 2,
    });
    mockWithIdentityTransaction.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("leave_account");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(leaveAccount(env, { userId: 7, username: "other" })).resolves.toEqual({
      status: "username_mismatch",
    });
    expect(deletes).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("clears only account credentials and deactivates the identity in one transaction", async () => {
    const { db, deletes, updates } = createLeaveDb(
      {
        id: 7,
        uid: "sensei-7",
        username: "teacher",
        googleId: "google-legacy",
        githubId: null,
        active: true,
        sessionVersion: 2,
      },
      [{ provider: "github", providerUserId: "github-1" }],
    );
    mockWithIdentityTransaction.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("leave_account");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(leaveAccount(env, { userId: 7, username: "teacher" })).resolves.toEqual({
      status: "left",
      sessionVersion: 3,
    });
    expect(deletes).toHaveLength(6);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ values: { replyEmail: null } });
    expect(updates[1]).toMatchObject({
      values: {
        active: false,
        profileVisibility: "private",
        username: "deleted-sensei-7",
        bio: null,
        friendCode: null,
        profileStudentId: null,
        googleId: null,
        githubId: null,
        role: "guest",
      },
    });
    const leftUsername = (updates[1] as { values: { username: string } }).values.username;
    expect(leftUsername).not.toMatch(/^[a-zA-Z0-9_]{4,20}$/);
  });

  it("propagates transaction failures without attempting the identity update", async () => {
    const { db, updates } = createLeaveDb({
      id: 7,
      uid: "sensei-7",
      username: "teacher",
      googleId: null,
      githubId: null,
      active: true,
      sessionVersion: 0,
    });
    db.delete.mockImplementationOnce(() => ({
      where: jest.fn(async () => {
        throw new Error("database failure");
      }),
    }));
    mockWithIdentityTransaction.mockImplementationOnce(async (_env, _queryName, operation) =>
      (operation as (database: typeof db) => unknown)(db),
    );

    await expect(leaveAccount(env, { userId: 7, username: "teacher" })).rejects.toThrow("database failure");
    expect(updates).toHaveLength(0);
  });
});
