import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();

jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
}));

import type { pgSenseisTable } from "~/db/postgres/schema";
import { postgresUniqueConstraintName } from "~/lib/db";
import { createSensei, getSenseiById, isSenseiProfileVisibleTo, toSenseiModel, updateSensei } from "~/models/sensei";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
const row: typeof pgSenseisTable.$inferSelect = {
  id: 7,
  uid: "sensei-7",
  username: "teacher",
  friendCode: null,
  profileStudentId: null,
  googleId: null,
  githubId: null,
  active: true,
  bio: "bio",
  role: "guest",
  profileVisibility: "private",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

function selectDb(result: unknown[]) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder.from = () => builder;
  builder.where = () => builder;
  builder.limit = async () => result;
  return { select: jest.fn(() => builder) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("identity PostgreSQL repository contract", () => {
  it("preserves the session-facing Sensei shape while mapping PostgreSQL boolean active", () => {
    expect(toSenseiModel(row)).toEqual({
      id: 7,
      uid: "sensei-7",
      username: "teacher",
      friendCode: null,
      profileStudentId: null,
      bio: "bio",
      active: true,
      role: "guest",
      profileVisibility: "private",
    });
    expect(Object.keys(toSenseiModel(row))).toEqual([
      "id",
      "uid",
      "username",
      "friendCode",
      "profileStudentId",
      "bio",
      "active",
      "role",
      "profileVisibility",
    ]);
  });

  it("reads a sensei through the operation-scoped PostgreSQL wrapper", async () => {
    const db = selectDb([row]);
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("sensei_by_id");
      return (operation as (database: typeof db) => unknown)(db);
    });
    await expect(getSenseiById(env, 7)).resolves.toMatchObject({ id: 7, active: true });
    expect(mockWithIdentityDatabase).toHaveBeenCalledWith(env, "sensei_by_id", expect.any(Function));
  });

  it("maps PostgreSQL 23505 constraint names to the existing username error contract", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "senseis_username_uidx",
    });
    mockWithIdentityDatabase.mockImplementationOnce(async () => {
      throw duplicate;
    });
    await expect(
      createSensei(env, {
        username: "teacher",
        friendCode: null,
        profileStudentId: null,
        bio: null,
      }),
    ).resolves.toEqual({ error: { username: "이미 사용중인 닉네임입니다." } });
    expect(postgresUniqueConstraintName(duplicate)).toBe("senseis_username_uidx");
  });

  it("persists profile and privacy fields through the PostgreSQL update", async () => {
    const selected = selectDb([row]);
    const set = jest.fn((values: unknown) => ({ where: jest.fn(async () => undefined), values }));
    const db = {
      ...selected,
      update: jest.fn(() => ({ set })),
    };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("update_sensei");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(
      updateSensei(env, 7, {
        username: "teacher-new",
        friendCode: "ABCDEFGH",
        profileStudentId: "student-7",
        bio: "updated bio",
        profileVisibility: "public",
      }),
    ).resolves.toEqual({});
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "teacher-new",
        friendCode: "ABCDEFGH",
        profileStudentId: "student-7",
        bio: "updated bio",
        profileVisibility: "public",
      }),
    );
  });

  it("maps a PostgreSQL username duplicate from profile updates", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "senseis_username_uidx",
    });
    mockWithIdentityDatabase.mockImplementationOnce(async () => {
      throw duplicate;
    });

    await expect(updateSensei(env, 7, { username: "taken" })).resolves.toEqual({
      error: { username: "이미 사용중인 닉네임입니다." },
    });
  });

  it("allows a private author to see their own profile but hides it from other viewers", () => {
    const privateSensei = toSenseiModel(row);
    expect(isSenseiProfileVisibleTo(privateSensei)).toBe(false);
    expect(isSenseiProfileVisibleTo(privateSensei, 7)).toBe(true);
    expect(isSenseiProfileVisibleTo(privateSensei, 8)).toBe(false);
  });
});
