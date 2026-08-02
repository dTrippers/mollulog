import { describe, expect, it, jest } from "@jest/globals";

const mockDrizzle = jest.fn();
jest.mock("drizzle-orm/d1", () => ({ drizzle: mockDrizzle }));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((column: unknown, value: unknown) => ({ kind: "eq", column, value })),
  inArray: jest.fn((column: unknown, values: unknown[]) => ({ kind: "inArray", column, values })),
}));
jest.mock("~/models/sensei", () => ({
  senseisTable: {
    id: "id",
    username: "username",
    profileStudentId: "profileStudentId",
    profileVisibility: "profileVisibility",
  },
}));

import { getCommunityAuthorIdByUsername, getCommunityAuthorsByIds } from "~/db/postgres/community-authors";

const env = { DB: {} as D1Database } as Pick<Env, "DB">;

describe("community author bridge", () => {
  it("splits author IDs into D1 IN batches of 90", async () => {
    const conditions: Array<{ kind: string; values?: unknown[] }> = [];
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn((condition: { kind: string; values?: unknown[] }) => {
            conditions.push(condition);
            const rows = (condition.values ?? []).map((id) => ({
              id,
              username: `user-${id}`,
              profileStudentId: null,
              profileVisibility: "public",
            }));
            return rows;
          }),
        })),
      })),
    };
    mockDrizzle.mockReturnValue(db);

    const authors = await getCommunityAuthorsByIds(
      env,
      Array.from({ length: 92 }, (_, index) => index + 1),
    );

    expect(conditions.map((condition) => condition.values?.length)).toEqual([90, 2]);
    expect(authors).toHaveProperty("size", 92);
  });

  it("resolves a username to its D1 user ID", async () => {
    const rows = [{ id: 42 }];
    const limit = jest.fn(async (_limit?: number) => rows);
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => Object.assign([], { limit })),
        })),
      })),
    };
    mockDrizzle.mockReturnValue(db);

    await expect(getCommunityAuthorIdByUsername(env, "sensei")).resolves.toBe(42);
    expect(limit).toHaveBeenCalledWith(1);
  });
});
