import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mocks = jest.mocked({
  deleteByUids: jest.fn<(...args: unknown[]) => Promise<number>>(),
  d1Page: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  d1ThroughId: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  pgByUids: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  pgPage: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  upsert: jest.fn<(...args: unknown[]) => Promise<void>>(),
});

jest.mock("~/lib/d1-session", () => ({
  withD1Session: (env: Env) => env,
}));

jest.mock("~/db/d1/favorite-students", () => ({
  getD1FavoriteRecordsPage: (...args: unknown[]) => mocks.d1Page(...args),
  getD1FavoriteRecordsThroughId: (...args: unknown[]) => mocks.d1ThroughId(...args),
}));

jest.mock("~/db/postgres/favorite-students", () => ({
  deletePostgresFavoriteRecordsByUids: (...args: unknown[]) => mocks.deleteByUids(...args),
  getPostgresFavoriteRecordsByUids: (...args: unknown[]) => mocks.pgByUids(...args),
  getPostgresFavoriteRecordsPage: (...args: unknown[]) => mocks.pgPage(...args),
  upsertPostgresFavoriteRecords: (...args: unknown[]) => mocks.upsert(...args),
}));

jest.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({}),
}));

jest.mock("~/lib/postgres.server", () => ({
  createPostgresClient: jest.fn(),
  withPostgresClient: async (
    _env: Env,
    operation: (client: { query: (sql: string) => Promise<void> }) => Promise<unknown>,
  ) => operation({ query: jest.fn(async () => undefined) }),
}));

import { reconcileFavoriteStudents } from "~/models/favorite-student-reconciliation.server";

const record = {
  id: 1,
  uid: "favorite-1",
  userId: 10,
  studentId: "student-1",
  contentId: "content-1",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const extra = {
  ...record,
  id: 2,
  uid: "favorite-extra",
  studentId: "student-extra",
};

describe("favorite student reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.d1Page
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([]);
    mocks.pgPage
      .mockResolvedValueOnce([record, extra])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([]);
    mocks.d1ThroughId.mockResolvedValue([record]);
    mocks.pgByUids.mockResolvedValue([record]);
    mocks.deleteByUids.mockResolvedValue(1);
    mocks.upsert.mockResolvedValue();
  });

  it("upserts source rows, deletes target extras, and audits exact parity", async () => {
    await expect(reconcileFavoriteStudents({} as Env)).resolves.toMatchObject({
      matched: true,
      upsertedRows: 1,
      deletedRows: 1,
      sourceCount: 1,
      targetCount: 1,
      missingTargetCount: 0,
      unexpectedTargetCount: 0,
      mismatchedCount: 0,
    });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.anything(), [record]);
    expect(mocks.deleteByUids).toHaveBeenCalledWith(expect.anything(), ["favorite-extra"]);
  });
});
