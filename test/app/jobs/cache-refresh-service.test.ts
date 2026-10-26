import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  CACHE_REFRESH_TASK_LABELS,
  CACHE_REFRESH_TASK_NAMES,
  type CacheRefreshJob,
  createPendingCacheRefreshTaskResults,
} from "~/domain/cache-refresh";
import { getCacheRefreshStatus, startCacheRefresh } from "~/jobs/cache-refresh-control.server";

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock("~/jobs/cache-refresh-control.server", () => ({
  getCacheRefreshStatus: jest.fn(),
  startCacheRefresh: jest.fn(),
}));

import {
  ADMIN_CACHE_REFRESH_REQUESTER_ID,
  getAdminCacheRefreshStatus,
  startAdminCacheRefresh,
} from "~/jobs/cache-refresh-service.server";

const mockedGetCacheRefreshStatus = getCacheRefreshStatus as jest.MockedFunction<typeof getCacheRefreshStatus>;
const mockedStartCacheRefresh = startCacheRefresh as jest.MockedFunction<typeof startCacheRefresh>;

const env = {} as Env;
const ctx = {} as ExecutionContext;

function makeJob(): CacheRefreshJob {
  const taskResults = createPendingCacheRefreshTaskResults();
  return {
    uid: "job-uid",
    requestedBy: ADMIN_CACHE_REFRESH_REQUESTER_ID,
    status: "running",
    completedCount: 1,
    totalCount: CACHE_REFRESH_TASK_NAMES.length,
    taskResults: {
      ...taskResults,
      syncYoutubeCommunityPosts: { status: "failed", durationMs: 1200, error: "internal task detail" },
      syncRawStudents: { status: "running", durationMs: null, error: null },
    },
    startedAt: "2026-10-26T00:00:01.000Z",
    finishedAt: null,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:02.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("cache refresh service", () => {
  it("starts a refresh as the admin requester and returns an ordered task snapshot", async () => {
    mockedStartCacheRefresh.mockResolvedValue({ job: makeJob(), created: true });

    const result = await startAdminCacheRefresh(env, ctx);

    expect(mockedStartCacheRefresh).toHaveBeenCalledWith(env, ctx, ADMIN_CACHE_REFRESH_REQUESTER_ID);
    expect(result.created).toBe(true);
    expect(result.job.tasks.map((task) => task.name)).toEqual([...CACHE_REFRESH_TASK_NAMES]);
    expect(result.job.tasks[0]).toEqual({
      name: "syncYoutubeCommunityPosts",
      label: CACHE_REFRESH_TASK_LABELS.syncYoutubeCommunityPosts,
      status: "failed",
      durationMs: 1200,
    });
    expect(JSON.stringify(result)).not.toContain("internal task detail");
  });

  it("returns the status of the requested job", async () => {
    mockedGetCacheRefreshStatus.mockResolvedValue(makeJob());

    const result = await getAdminCacheRefreshStatus(env, ctx, "job-uid");

    expect(mockedGetCacheRefreshStatus).toHaveBeenCalledWith(env, ctx, "job-uid");
    expect(result).toMatchObject({ uid: "job-uid", status: "running" });
    expect(result?.tasks[1]).toMatchObject({ name: "syncRawStudents", status: "running" });
  });

  it("returns null when no job exists", async () => {
    mockedGetCacheRefreshStatus.mockResolvedValue(null);

    await expect(getAdminCacheRefreshStatus(env, ctx, null)).resolves.toBeNull();
  });

  it("does not expose internal errors to the caller", async () => {
    mockedStartCacheRefresh.mockRejectedValue(new Error("internal workflow failure"));
    mockedGetCacheRefreshStatus.mockRejectedValue(new Error("internal database failure"));

    await expect(startAdminCacheRefresh(env, ctx)).rejects.toThrow("Cache refresh service request failed");
    await expect(getAdminCacheRefreshStatus(env, ctx, null)).rejects.toThrow("Cache refresh service request failed");
  });
});
