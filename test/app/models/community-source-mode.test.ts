import { describe, expect, it, jest } from "@jest/globals";
import { getCommunityFeedPageWithCache } from "~/models/community";
import { resolveCommunitySourceMode } from "~/models/community.server";

describe("community source mode", () => {
  it("accepts only the explicit D1 and Hyperdrive modes", () => {
    expect(resolveCommunitySourceMode("d1")).toBe("d1");
    expect(resolveCommunitySourceMode("hyperdrive")).toBe("hyperdrive");
  });

  it("fails closed for missing or invalid configuration", () => {
    expect(() => resolveCommunitySourceMode(undefined)).toThrow("invalid COMMUNITY_SOURCE_MODE");
    expect(() => resolveCommunitySourceMode("shadow")).toThrow("invalid COMMUNITY_SOURCE_MODE");
  });

  it("shares the anonymous first-page cache path for Hyperdrive while bypassing signed-in and deeper pages", async () => {
    const values = new Map<string, string>();
    const kv = {
      get: jest.fn(async (key: string) => values.get(key) ?? null),
      put: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ keys: [], list_complete: true })),
    };
    const env = {
      COMMUNITY_SOURCE_MODE: "hyperdrive",
      HYPERDRIVE: { connectionString: "postgres://unused" },
      DB: { withSession: jest.fn(() => ({})) },
      KV_CACHE: kv,
    } as unknown as Env;
    const result = { items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 1 };
    const loader = jest.fn(async () => result);

    await getCommunityFeedPageWithCache(env, { page: 1 }, loader);
    await getCommunityFeedPageWithCache(env, { page: 1 }, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    await getCommunityFeedPageWithCache(env, { page: 1, currentUserId: 10 }, loader);
    await getCommunityFeedPageWithCache(env, { page: 2 }, loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
