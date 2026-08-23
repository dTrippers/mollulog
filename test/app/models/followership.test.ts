import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();
const mockIdentityDb = {
  select: jest.fn(),
  insert: jest.fn(),
};

jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
}));

import {
  follow,
  getFollowerIds,
  getFollowershipLists,
  getFollowershipSummary,
  getFollowingIds,
} from "~/models/followership";

beforeEach(() => {
  jest.clearAllMocks();
  let countCall = 0;
  let relationshipCall = 0;
  mockIdentityDb.select.mockImplementation((selection: unknown) => {
    const selectionRecord = selection as Record<string, unknown>;
    const keys = Object.keys(selectionRecord);
    if (keys.includes("count")) {
      const value = countCall++ === 0 ? [{ count: 2 }] : [{ count: 2 }];
      return createBuilder(value);
    }
    if (keys.includes("followerId")) return createBuilder([{ followerId: 2 }, { followerId: 4 }]);
    if (keys.includes("followeeId")) return createBuilder([{ followeeId: 2 }, { followeeId: 3 }]);
    if (keys.includes("sensei")) {
      return createBuilder([
        {
          sensei: {
            id: 2,
            uid: "sensei-2",
            username: "sensei2",
            friendCode: null,
            profileStudentId: null,
            bio: null,
            active: true,
            role: "guest",
            profileVisibility: "public",
          },
        },
      ]);
    }
    if (keys.includes("id")) {
      const value = relationshipCall++ === 0 ? [{ id: 1 }] : [{ id: 1 }];
      return createBuilder(value);
    }
    throw new Error(`Unexpected select: ${keys.join(",")}`);
  });
  const onConflictDoNothing = jest.fn(async () => undefined);
  const values = jest.fn(() => ({ onConflictDoNothing }));
  mockIdentityDb.insert.mockReturnValue({ values });
  mockWithIdentityDatabase.mockImplementation(async (_env, _name, operation: unknown) =>
    (operation as (db: typeof mockIdentityDb) => unknown)(mockIdentityDb),
  );
});

function createBuilder(value: unknown) {
  const builder = Promise.resolve(value) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  builder.from = () => builder;
  builder.innerJoin = () => builder;
  builder.where = () => builder;
  builder.limit = async () => value;
  return builder;
}

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;

describe("PostgreSQL followership model", () => {
  it("returns counts and viewer relationships from PostgreSQL", async () => {
    await expect(getFollowershipSummary(env, 1, 2)).resolves.toEqual({
      followerCount: 2,
      followingCount: 2,
      followed: true,
      following: true,
    });
    expect(mockWithIdentityDatabase).toHaveBeenCalledWith(
      env,
      "followership_summary",
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("loads following and follower profiles through one identity operation", async () => {
    await expect(getFollowershipLists(env, 1, 9, { ctx: {} as ExecutionContext })).resolves.toEqual({
      following: [expect.objectContaining({ id: 2 })],
      followers: [expect.objectContaining({ id: 2 })],
    });
    expect(mockWithIdentityDatabase).toHaveBeenCalledTimes(1);
    expect(mockWithIdentityDatabase).toHaveBeenCalledWith(
      env,
      "followership_lists",
      expect.any(Function),
      expect.objectContaining({ ctx: expect.anything() }),
    );
  });

  it("selects only the required relationship IDs", async () => {
    await expect(getFollowerIds(env, 1)).resolves.toEqual([2, 4]);
    await expect(getFollowingIds(env, 1)).resolves.toEqual([2, 3]);
    expect(mockIdentityDb.select).toHaveBeenCalledWith(expect.objectContaining({ followerId: expect.anything() }));
    expect(mockIdentityDb.select).toHaveBeenCalledWith(expect.objectContaining({ followeeId: expect.anything() }));
  });

  it("uses a conflict-safe insert for repeated follows", async () => {
    await follow(env, 1, 2);
    expect(mockIdentityDb.insert).toHaveBeenCalled();
    const insertBuilder = mockIdentityDb.insert.mock.results[0]?.value as { values: jest.Mock };
    expect(insertBuilder.values).toBeDefined();
    const valuesBuilder = insertBuilder.values.mock.results[0]?.value as { onConflictDoNothing: jest.Mock };
    expect(valuesBuilder.onConflictDoNothing).toHaveBeenCalledWith({ target: expect.any(Array) });
  });
});
