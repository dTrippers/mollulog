import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();
jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
}));

import {
  consentToQuestionMemberData,
  getQuestionMemberDataConsentAt,
  revokeQuestionMemberDataConsent,
} from "~/models/sensei";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("question member-data consent model", () => {
  it("reads the persisted timestamp directly", async () => {
    const consentedAt = new Date("2026-10-19T01:02:03.000Z");
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => [{ questionMemberDataConsentedAt: consentedAt }],
    };
    const db = { select: jest.fn(() => builder) };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, queryName, operation) => {
      expect(queryName).toBe("question_member_data_consent_by_sensei");
      return (operation as (database: typeof db) => unknown)(db);
    });

    await expect(getQuestionMemberDataConsentAt(env, 7)).resolves.toBe(consentedAt);
  });

  it("does not treat a missing account as an account with no consent", async () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: async () => [],
    };
    const db = { select: jest.fn(() => builder) };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, _queryName, operation) =>
      (operation as (database: typeof db) => unknown)(db),
    );

    await expect(getQuestionMemberDataConsentAt(env, 7)).rejects.toThrow("Sensei does not exist.");
  });

  it("stores the current time as consent", async () => {
    let updateValues: unknown;
    const builder = {
      set: (values: unknown) => {
        updateValues = values;
        return builder;
      },
      where: () => builder,
      returning: async () => [{ id: 7 }],
    };
    const db = { update: jest.fn(() => builder) };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, _queryName, operation) =>
      (operation as (database: typeof db) => unknown)(db),
    );

    const consentedAt = await consentToQuestionMemberData(env, 7);
    expect(updateValues).toEqual({ questionMemberDataConsentedAt: consentedAt, updatedAt: consentedAt });
    expect(consentedAt).toBeInstanceOf(Date);
  });

  it("clears consent when revoked", async () => {
    let updateValues: unknown;
    const builder = {
      set: (values: unknown) => {
        updateValues = values;
        return builder;
      },
      where: () => builder,
      returning: async () => [{ id: 7 }],
    };
    const db = { update: jest.fn(() => builder) };
    mockWithIdentityDatabase.mockImplementationOnce(async (_env, _queryName, operation) =>
      (operation as (database: typeof db) => unknown)(db),
    );

    await expect(revokeQuestionMemberDataConsent(env, 7)).resolves.toBeUndefined();
    expect(updateValues).toEqual({ questionMemberDataConsentedAt: null, updatedAt: expect.any(Date) });
  });
});
