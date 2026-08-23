import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  CACHE_REFRESH_TASK_NAMES,
  type CacheRefreshJob,
  type CacheRefreshWorkflowOutput,
  createPendingCacheRefreshTaskResults,
} from "~/domain/cache-refresh";
import {
  completeCacheRefreshJob,
  createCacheRefreshJob,
  failCacheRefreshJob,
  failStaleCacheRefreshJob,
  getActiveCacheRefreshJob,
  getCacheRefreshJob,
  getLatestCacheRefreshJob,
} from "~/models/cache-refresh-job";

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock("~/models/cache-refresh-job", () => ({
  completeCacheRefreshJob: jest.fn(),
  createCacheRefreshJob: jest.fn(),
  failCacheRefreshJob: jest.fn(),
  failStaleCacheRefreshJob: jest.fn(),
  getActiveCacheRefreshJob: jest.fn(),
  getCacheRefreshJob: jest.fn(),
  getLatestCacheRefreshJob: jest.fn(),
}));

import { getCacheRefreshStatus, startCacheRefresh } from "~/jobs/cache-refresh-control.server";

const mockedCompleteCacheRefreshJob = completeCacheRefreshJob as jest.MockedFunction<typeof completeCacheRefreshJob>;
const mockedCreateCacheRefreshJob = createCacheRefreshJob as jest.MockedFunction<typeof createCacheRefreshJob>;
const mockedFailCacheRefreshJob = failCacheRefreshJob as jest.MockedFunction<typeof failCacheRefreshJob>;
const mockedFailStaleCacheRefreshJob = failStaleCacheRefreshJob as jest.MockedFunction<typeof failStaleCacheRefreshJob>;
const mockedGetActiveCacheRefreshJob = getActiveCacheRefreshJob as jest.MockedFunction<typeof getActiveCacheRefreshJob>;
const mockedGetCacheRefreshJob = getCacheRefreshJob as jest.MockedFunction<typeof getCacheRefreshJob>;
const mockedGetLatestCacheRefreshJob = getLatestCacheRefreshJob as jest.MockedFunction<typeof getLatestCacheRefreshJob>;

function makeJob(status: CacheRefreshJob["status"], uid = "job-uid"): CacheRefreshJob {
  return {
    uid,
    requestedBy: 1,
    status,
    currentTask: null,
    completedCount: 0,
    totalCount: CACHE_REFRESH_TASK_NAMES.length,
    taskResults: createPendingCacheRefreshTaskResults(),
    startedAt: status === "queued" ? null : "2026-07-23T00:00:00.000Z",
    finishedAt:
      status === "completed" || status === "partial_failure" || status === "failed" ? "2026-07-23T01:00:00.000Z" : null,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:30:00.000Z",
  };
}

function createEnv(workflowStatus: unknown = { status: "running" }) {
  const status = jest.fn(async () => workflowStatus);
  const get = jest.fn(async (_uid: string) => ({ status }));
  const create = jest.fn(async (_options: unknown) => undefined);
  const env = { CACHE_REFRESH_WORKFLOW: { create, get } } as unknown as Env;
  return { env, create, get, status };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetActiveCacheRefreshJob.mockResolvedValue(null);
  mockedGetCacheRefreshJob.mockResolvedValue(null);
  mockedGetLatestCacheRefreshJob.mockResolvedValue(null);
  mockedCreateCacheRefreshJob.mockImplementation(async (_env, input) => makeJob("queued", input.uid));
  mockedCompleteCacheRefreshJob.mockResolvedValue();
  mockedFailCacheRefreshJob.mockResolvedValue();
  mockedFailStaleCacheRefreshJob.mockResolvedValue(false);
});

describe("cache refresh control", () => {
  it("creates a cache refresh job and starts a workflow instance", async () => {
    const { env, create } = createEnv();

    const result = await startCacheRefresh(env, {} as ExecutionContext, 7);

    expect(result.created).toBe(true);
    expect(mockedCreateCacheRefreshJob).toHaveBeenCalledWith(expect.anything(), {
      uid: result.job.uid,
      requestedBy: 7,
    });
    expect(create).toHaveBeenCalledWith({
      id: result.job.uid,
      params: { requestedBy: 7 },
      retention: { successRetention: "7 days", errorRetention: "7 days" },
    });
  });

  it("returns an existing running job instead of starting a duplicate", async () => {
    const active = makeJob("running");
    mockedGetActiveCacheRefreshJob.mockResolvedValue(active);
    mockedGetCacheRefreshJob.mockResolvedValue(active);
    const { env, create } = createEnv();

    await expect(startCacheRefresh(env, {} as ExecutionContext, 7)).resolves.toEqual({
      job: active,
      created: false,
    });
    expect(create).not.toHaveBeenCalled();
    expect(mockedCreateCacheRefreshJob).not.toHaveBeenCalled();
  });

  it("persists a completed workflow output during reconciliation", async () => {
    const active = makeJob("running");
    const completed = makeJob("completed");
    const output: CacheRefreshWorkflowOutput = {
      status: "completed",
      taskResults: createPendingCacheRefreshTaskResults(),
    };
    mockedGetCacheRefreshJob.mockResolvedValueOnce(active).mockResolvedValueOnce(completed);
    const { env } = createEnv({ status: "complete", output });

    await expect(getCacheRefreshStatus(env, {} as ExecutionContext, active.uid)).resolves.toEqual(completed);
    expect(mockedCompleteCacheRefreshJob).toHaveBeenCalledWith(
      expect.anything(),
      active.uid,
      output.status,
      output.taskResults,
    );
  });

  it.each(["errored", "terminated"] as const)("fails a job when its workflow is %s", async (status) => {
    const active = makeJob("running");
    const failed = makeJob("failed");
    mockedGetCacheRefreshJob.mockResolvedValueOnce(active).mockResolvedValueOnce(failed);
    const { env } = createEnv({ status, error: { name: "Error", message: "stopped" } });

    await expect(getCacheRefreshStatus(env, {} as ExecutionContext, active.uid)).resolves.toEqual(failed);
    expect(mockedFailCacheRefreshJob).toHaveBeenCalledWith(expect.anything(), active.uid);
  });

  it("fails a completed workflow with an invalid output", async () => {
    const active = makeJob("running");
    const failed = makeJob("failed");
    mockedGetCacheRefreshJob.mockResolvedValueOnce(active).mockResolvedValueOnce(failed);
    const { env } = createEnv({ status: "complete", output: null });

    await expect(getCacheRefreshStatus(env, {} as ExecutionContext, active.uid)).resolves.toEqual(failed);
    expect(mockedFailCacheRefreshJob).toHaveBeenCalledWith(expect.anything(), active.uid);
  });

  it("keeps a recent job active when workflow status is temporarily unavailable", async () => {
    const active = makeJob("running");
    mockedGetActiveCacheRefreshJob.mockResolvedValue(active);
    const { env, get, create } = createEnv();
    get.mockRejectedValue(new Error("workflow API unavailable"));

    await expect(startCacheRefresh(env, {} as ExecutionContext, 7)).resolves.toEqual({
      job: active,
      created: false,
    });
    expect(mockedFailStaleCacheRefreshJob).toHaveBeenCalledWith(expect.anything(), active.uid, 24);
    expect(create).not.toHaveBeenCalled();
  });

  it("applies stale recovery when workflow status is unknown", async () => {
    const active = makeJob("running");
    mockedGetCacheRefreshJob.mockResolvedValue(active);
    const { env } = createEnv({ status: "unknown" });

    await expect(getCacheRefreshStatus(env, {} as ExecutionContext, active.uid)).resolves.toEqual(active);
    expect(mockedFailStaleCacheRefreshJob).toHaveBeenCalledWith(expect.anything(), active.uid, 24);
  });

  it("releases a stale job when workflow status remains unavailable", async () => {
    const active = makeJob("running", "stale-job");
    const failed = makeJob("failed", active.uid);
    mockedGetActiveCacheRefreshJob.mockResolvedValue(active);
    mockedFailStaleCacheRefreshJob.mockResolvedValue(true);
    mockedGetCacheRefreshJob.mockResolvedValue(failed);
    const { env, get, create } = createEnv();
    get.mockRejectedValue(new Error("workflow instance not found"));

    const result = await startCacheRefresh(env, {} as ExecutionContext, 7);

    expect(mockedFailStaleCacheRefreshJob).toHaveBeenCalledWith(expect.anything(), active.uid, 24);
    expect(result.created).toBe(true);
    expect(result.job.uid).not.toBe(active.uid);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("returns the raced active job after a unique constraint conflict", async () => {
    const raced = makeJob("queued", "raced-job");
    mockedGetActiveCacheRefreshJob.mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
    mockedCreateCacheRefreshJob.mockRejectedValue(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
        constraint: "cache_refresh_jobs_active_slot_uidx",
      }),
    );
    const { env, create } = createEnv();

    await expect(startCacheRefresh(env, {} as ExecutionContext, 7)).resolves.toEqual({
      job: raced,
      created: false,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails the cache refresh job when workflow creation fails", async () => {
    const { env, create } = createEnv();
    create.mockRejectedValue(new Error("workflow create failed"));

    await expect(startCacheRefresh(env, {} as ExecutionContext, 7)).rejects.toThrow("workflow create failed");
    const createdUid = mockedCreateCacheRefreshJob.mock.calls[0][1].uid;
    expect(mockedFailCacheRefreshJob).toHaveBeenCalledWith(expect.anything(), createdUid);
  });
});
