import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mockWithIdentityDatabase = jest.fn();
const mockWithIdentityTransaction = jest.fn();

jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
  withIdentityTransaction: (...args: unknown[]) => mockWithIdentityTransaction(...args),
}));

import { getAccountSessionState, leaveAccount } from "~/db/postgres/account-security";
import {
  pgAuthIdentitiesTable,
  pgConnectApiKeysTable,
  pgFeedbackTicketsTable,
  pgFollowershipsTable,
  pgPasskeysTable,
  pgPendingSenseiRegistrationsTable,
  pgSenseiPrivaciesTable,
  pgSenseisTable,
} from "~/db/postgres/schema";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;

type DeleteCall = { table: unknown; where: unknown };
type UpdateCall = { table: unknown; values: unknown; where: unknown };

function whereQuery(where: unknown) {
  return new PgDialect().sqlToQuery(where as SQL);
}

function createLeaveDb(sensei: Record<string, unknown> | undefined, identities: Array<Record<string, unknown>> = []) {
  let selectCount = 0;
  const deletes: DeleteCall[] = [];
  const updates: UpdateCall[] = [];
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
      return {
        where: jest.fn(async (where: unknown) => {
          deletes.push({ table, where });
        }),
      };
    }),
    update: jest.fn((table: unknown) => ({
      set: jest.fn((values: unknown) => {
        return {
          where: jest.fn(async (where: unknown) => {
            updates.push({ table, values, where });
          }),
        };
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
    expect(deletes.map(({ table }) => table)).toEqual(
      expect.arrayContaining([
        pgAuthIdentitiesTable,
        pgPasskeysTable,
        pgSenseiPrivaciesTable,
        pgFollowershipsTable,
        pgConnectApiKeysTable,
        pgPendingSenseiRegistrationsTable,
      ]),
    );
    for (const table of [pgAuthIdentitiesTable, pgPasskeysTable, pgSenseiPrivaciesTable, pgConnectApiKeysTable]) {
      const deletion = deletes.find((call) => call.table === table);
      expect(deletion).toBeDefined();
      expect(whereQuery(deletion?.where).params).toEqual([7]);
    }
    const followershipDeletion = deletes.find((call) => call.table === pgFollowershipsTable);
    expect(followershipDeletion).toBeDefined();
    const followershipWhere = whereQuery(followershipDeletion?.where);
    expect(followershipWhere.params).toEqual([7, 7]);
    expect(followershipWhere.sql).toContain('"followerships"."follower_id"');
    expect(followershipWhere.sql).toContain('"followerships"."followee_id"');
    const pendingRegistrationDeletion = deletes.find((call) => call.table === pgPendingSenseiRegistrationsTable);
    expect(pendingRegistrationDeletion).toBeDefined();
    expect(whereQuery(pendingRegistrationDeletion?.where).params).toEqual([
      "google",
      "google-legacy",
      "github",
      "github-1",
    ]);

    expect(updates[0]).toMatchObject({ values: { replyEmail: null } });
    expect(updates[0]?.table).toBe(pgFeedbackTicketsTable);
    expect(whereQuery(updates[0]?.where).params).toEqual([7]);
    expect(updates[1]).toMatchObject({
      table: pgSenseisTable,
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
    expect(whereQuery(updates[1]?.where).params).toEqual([7]);
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
