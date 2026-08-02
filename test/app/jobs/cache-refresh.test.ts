import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { syncYoutubeCommunityPosts } from "~/models/youtube";

jest.mock("~/models/youtube", () => ({
  syncYoutubeCommunityPosts: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

import { runCacheRefreshTask } from "~/jobs/cache-refresh";

const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncYoutubeCommunityPosts.mockResolvedValue({ synced: 0 });
});

describe("runCacheRefreshTask", () => {
  it("records a successful YouTube sync", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    const result = await runCacheRefreshTask(env, ctx, "job-uid", "syncYoutubeCommunityPosts");

    expect(result).toEqual({ status: "succeeded", durationMs: expect.any(Number), error: null });
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(env, ctx);
  });
});
