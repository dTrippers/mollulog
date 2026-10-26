import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getFurnitureCatalogSource } from "~/models/furniture-catalog";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { refreshIndexContents } from "~/views/home";

jest.mock("~/models/youtube", () => ({
  syncYoutubeCommunityPosts: jest.fn(),
}));

jest.mock("~/views/home", () => ({
  refreshIndexContents: jest.fn(),
}));

jest.mock("~/models/furniture-catalog", () => ({
  getFurnitureCatalogSource: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

import { runCacheRefreshTask } from "~/jobs/cache-refresh";
import { createCacheRefreshScope } from "~/lib/cache/refresh-scope";

const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;
const mockedGetFurnitureCatalogSource = getFurnitureCatalogSource as jest.MockedFunction<
  typeof getFurnitureCatalogSource
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncYoutubeCommunityPosts.mockResolvedValue({ synced: 0 });
  mockedGetFurnitureCatalogSource.mockResolvedValue({ furnitures: [], themes: [] });
});

describe("runCacheRefreshTask", () => {
  it("records a successful YouTube sync", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    const result = await runCacheRefreshTask(
      env,
      ctx,
      "job-uid",
      "syncYoutubeCommunityPosts",
      createCacheRefreshScope(),
    );

    expect(result).toEqual({ status: "succeeded", durationMs: expect.any(Number), error: null });
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(env, ctx);
  });

  it("warms the furniture catalog with a forced source refresh", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    const result = await runCacheRefreshTask(
      env,
      ctx,
      "job-uid",
      "getFurnitureCatalogSource",
      createCacheRefreshScope(),
    );

    expect(result).toEqual({ status: "succeeded", durationMs: expect.any(Number), error: null });
    expect(mockedGetFurnitureCatalogSource).toHaveBeenCalledWith(env, true);
  });

  it("fails the home task when the snapshot was incomplete and not cached", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;
    jest.mocked(refreshIndexContents).mockRejectedValue(new Error("home index contents are incomplete"));

    const result = await runCacheRefreshTask(env, ctx, "job-uid", "getIndexContents", createCacheRefreshScope());

    expect(result).toEqual({ status: "failed", durationMs: expect.any(Number), error: expect.any(String) });
    expect(refreshIndexContents).toHaveBeenCalledWith(env, ctx);
  });
});
