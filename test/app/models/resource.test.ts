import { describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { getAllStudentsFavoriteItems } from "~/models/resource";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;
const env = { DISABLE_CACHE: "true" } as unknown as Env;

describe("student favorite item source validation", () => {
  it("rejects a GraphQL error instead of caching an empty gift list", async () => {
    mockedRunQuery.mockResolvedValue({ data: undefined, error: new Error("GraphQL failure") } as never);

    await expect(getAllStudentsFavoriteItems(env, true)).rejects.toThrow("GraphQL failure");
  });

  it("rejects when runQuery itself rejects instead of returning an empty gift list", async () => {
    mockedRunQuery.mockClear();
    const transportError = new Error("BAQL request rejected");
    mockedRunQuery.mockRejectedValueOnce(transportError);

    await expect(getAllStudentsFavoriteItems(env, true)).rejects.toBe(transportError);
    expect(mockedRunQuery).toHaveBeenCalledTimes(1);
  });

  it("rejects a response without the required student list", async () => {
    mockedRunQuery.mockResolvedValue({ data: {}, error: undefined } as never);

    await expect(getAllStudentsFavoriteItems(env, true)).rejects.toThrow("missing students");
  });

  it("accepts a valid empty student list", async () => {
    mockedRunQuery.mockResolvedValue({ data: { students: [] }, error: undefined } as never);

    await expect(getAllStudentsFavoriteItems(env, true)).resolves.toEqual([]);
  });

  it("returns a representative non-empty favorite item projection", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        students: [
          {
            uid: "student-a",
            name: "학생 A",
            favoriteItems: [
              { favorited: true, favoriteLevel: 2, exp: 12, item: { uid: "1001", name: "선물", rarity: 3 } },
              { favorited: false, favoriteLevel: 1, exp: 5, item: { uid: "5996", name: "공통 선물", rarity: 1 } },
            ],
          },
        ],
      },
      error: undefined,
    } as never);

    await expect(getAllStudentsFavoriteItems(env, true)).resolves.toEqual([
      {
        itemUid: "1001",
        itemName: "선물",
        itemRarity: 3,
        favoriteLevels: { 2: { exp: 12, students: [{ uid: "student-a", name: "학생 A" }] } },
      },
      {
        itemUid: "5996",
        itemName: "공통 선물",
        itemRarity: 1,
        favoriteLevels: { 1: { exp: 5, students: [{ uid: "student-a", name: "학생 A" }] } },
      },
    ]);
  });

  it("rejects a failed forced refresh instead of serving a stale source projection", async () => {
    const now = Date.now();
    const put = jest.fn(async () => undefined);
    const forcedEnv = {
      KV_CACHE: {
        get: jest.fn(async () => JSON.stringify({ _ver: 2, data: [{ itemUid: "stale" }], cachedAt: now - 1_900_000 })),
        put,
      },
    } as unknown as Env;
    mockedRunQuery.mockResolvedValue({ data: undefined, error: new Error("BAQL unavailable") } as never);

    await expect(getAllStudentsFavoriteItems(forcedEnv, true)).rejects.toThrow("BAQL unavailable");
    expect(put).not.toHaveBeenCalled();
  });
});
