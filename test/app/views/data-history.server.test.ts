import { describe, expect, it, jest } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const mockApi = {
  getApiAuditHistory: jest.fn<AsyncMock>(),
  getPersonalApiKeys: jest.fn<AsyncMock>(),
};
const mockItemCatalog = { getItemCatalogResources: jest.fn<AsyncMock>() };
const mockStudents = { getAllStudents: jest.fn<AsyncMock>() };

jest.mock("~/models/mollulog-api", () => mockApi);
jest.mock("~/models/item-catalog", () => mockItemCatalog);
jest.mock("~/models/student", () => mockStudents);

import { getDataHistoryView } from "~/views/data-history.server";

describe("getDataHistoryView", () => {
  it("composes history and display names with the requested cursor and filter", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;
    const events = [{ kind: "student", id: 42, studentUid: "student-1" }];
    const students = [
      { uid: "student-1", name: "아루" },
      { uid: "student-2", name: "무츠키" },
    ];
    const itemResources = [
      { uid: "gift-1", name: "선물 1" },
      { uid: "gift-2", name: "선물 2" },
    ];
    const apiKeys = [
      {
        uid: "key-1",
        scopes: ["students:read"],
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        revokedAt: null,
      },
    ];
    mockApi.getApiAuditHistory.mockResolvedValue({ events, nextCursor: "next-page" });
    mockApi.getPersonalApiKeys.mockResolvedValue(apiKeys);
    mockStudents.getAllStudents.mockResolvedValue(students);
    mockItemCatalog.getItemCatalogResources.mockResolvedValue(itemResources);

    await expect(getDataHistoryView(env, 5, { cursor: "previous-page", filter: "api", ctx })).resolves.toEqual({
      events,
      nextCursor: "next-page",
      filter: "api",
      studentsByUid: { "student-1": "아루", "student-2": "무츠키" },
      itemNamesByUid: { "gift-1": "선물 1", "gift-2": "선물 2" },
      apiKeysByUid: {
        "key-1": {
          scopes: ["students:read"],
          createdAt: "2026-10-01T00:00:00.000Z",
          expiresAt: "2027-01-01T00:00:00.000Z",
          revokedAt: null,
        },
      },
    });
    expect(mockApi.getApiAuditHistory).toHaveBeenCalledWith(
      env,
      5,
      {
        limit: 50,
        cursor: "previous-page",
        filter: "api",
      },
      { ctx },
    );
    expect(mockApi.getPersonalApiKeys).toHaveBeenCalledWith(env, 5, { ctx });
    expect(mockStudents.getAllStudents).toHaveBeenCalledWith(env, true);
    expect(mockItemCatalog.getItemCatalogResources).toHaveBeenCalledWith(env);
  });
});
