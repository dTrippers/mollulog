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

import { runScheduledJobs } from "~/jobs/scheduled";

const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncYoutubeCommunityPosts.mockResolvedValue({ synced: 0 });
});

describe("runScheduledJobs", () => {
  it("runs the youtube sync job", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    await runScheduledJobs(env, ctx);

    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(env);
  });

  it("raises scheduled job failures", async () => {
    mockedSyncYoutubeCommunityPosts.mockRejectedValue(new Error("youtube failed"));

    await expect(runScheduledJobs({} as Env, {} as ExecutionContext)).rejects.toThrow(
      "One or more scheduled jobs failed",
    );
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledTimes(1);
  });
});
