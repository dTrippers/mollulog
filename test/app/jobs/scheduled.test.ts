import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { syncTimelineContents } from "~/jobs/sync-timeline-contents";
import { syncYoutubeCommunityPosts } from "~/models/youtube";

jest.mock("~/jobs/sync-timeline-contents", () => ({
  syncTimelineContents: jest.fn(),
}));

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

const mockedSyncTimelineContents = syncTimelineContents as jest.MockedFunction<typeof syncTimelineContents>;
const mockedSyncYoutubeCommunityPosts = syncYoutubeCommunityPosts as jest.MockedFunction<
  typeof syncYoutubeCommunityPosts
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSyncTimelineContents.mockResolvedValue(undefined);
  mockedSyncYoutubeCommunityPosts.mockResolvedValue({ synced: 0 });
});

describe("runScheduledJobs", () => {
  it("runs timeline and youtube sync jobs", async () => {
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    await runScheduledJobs(env, ctx);

    expect(mockedSyncTimelineContents).toHaveBeenCalledWith(env, ctx);
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledWith(env);
  });

  it("runs independent jobs even when one scheduled job fails", async () => {
    mockedSyncTimelineContents.mockRejectedValue(new Error("timeline failed"));

    await expect(runScheduledJobs({} as Env, {} as ExecutionContext)).rejects.toThrow(
      "One or more scheduled jobs failed",
    );
    expect(mockedSyncYoutubeCommunityPosts).toHaveBeenCalledTimes(1);
  });
});
