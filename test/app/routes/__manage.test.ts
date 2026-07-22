import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { CACHE_REFRESH_TASK_NAMES, createPendingCacheRefreshTaskResults } from "~/domain/cache-refresh";
import { getCacheRefreshStatus, startCacheRefresh } from "~/jobs/cache-refresh-control.server";
import type { Sensei } from "~/models/sensei";

function makeSensei(overrides: Partial<Sensei>): Sensei {
  return {
    id: 0,
    uid: "test-uid",
    username: "tester",
    friendCode: null,
    profileStudentId: null,
    bio: null,
    active: true,
    role: "guest",
    ...overrides,
  };
}

function makeJob(status: "queued" | "running" | "completed" = "queued") {
  return {
    uid: "job-uid",
    requestedBy: 1,
    status,
    currentTask: null,
    completedCount: status === "completed" ? CACHE_REFRESH_TASK_NAMES.length : 0,
    totalCount: CACHE_REFRESH_TASK_NAMES.length,
    taskResults: createPendingCacheRefreshTaskResults(),
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-07-23 00:00:00",
    updatedAt: "2026-07-23 00:00:00",
  } as const;
}

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/jobs/cache-refresh-control.server", () => ({
  getCacheRefreshStatus: jest.fn(),
  startCacheRefresh: jest.fn(),
}));

import { action, loader } from "../../../app/routes/[__manage]";

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetCacheRefreshStatus = getCacheRefreshStatus as jest.MockedFunction<typeof getCacheRefreshStatus>;
const mockedStartCacheRefresh = startCacheRefresh as jest.MockedFunction<typeof startCacheRefresh>;

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type DataResult<T> = {
  type: "DataWithResponseInit";
  data: T;
  init: ResponseInit | null;
};

function createLoaderArgs(url = "https://mollulog.net/__manage"): LoaderArgs {
  return {
    request: new Request(url, { method: "GET" }),
    context: { cloudflare: { env: {} as Env, ctx: {} as ExecutionContext } },
    params: {},
  } as unknown as LoaderArgs;
}

function createActionArgs(intent = "cache.refresh"): ActionArgs {
  return {
    request: new Request("https://mollulog.net/__manage", {
      method: "POST",
      body: new URLSearchParams({ intent }),
    }),
    context: { cloudflare: { env: {} as Env, ctx: {} as ExecutionContext } },
    params: {},
  } as unknown as ActionArgs;
}

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function dataStatus(result: DataResult<unknown>): number {
  return result.init?.status ?? 200;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCacheRefreshStatus.mockResolvedValue(null);
});

describe("__manage route", () => {
  it("loads the latest cache refresh job for admins", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));
    const job = makeJob("running");
    mockedGetCacheRefreshStatus.mockResolvedValue(job);

    const response = expectDataResult<{ job: typeof job; error: null }>(
      await loader(createLoaderArgs("https://mollulog.net/__manage?jobId=job-uid")),
    );

    expect(dataStatus(response)).toBe(200);
    expect(response.data).toEqual({ job, error: null });
    expect(mockedGetCacheRefreshStatus).toHaveBeenCalledWith(expect.anything(), expect.anything(), "job-uid");
  });

  it("starts a workflow and responds before the refresh completes", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));
    const job = makeJob();
    mockedStartCacheRefresh.mockResolvedValue({ job, created: true });

    const response = expectDataResult<{ intent: "cache.refresh"; job: typeof job; created: true }>(
      await action(createActionArgs()),
    );

    expect(dataStatus(response)).toBe(202);
    expect(response.data).toEqual({ intent: "cache.refresh", job, created: true });
    expect(mockedStartCacheRefresh).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1);
  });

  it("returns the active workflow instead of starting a duplicate", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));
    const job = makeJob("running");
    mockedStartCacheRefresh.mockResolvedValue({ job, created: false });

    const response = expectDataResult<{ intent: "cache.refresh"; job: typeof job; created: false }>(
      await action(createActionArgs()),
    );

    expect(dataStatus(response)).toBe(200);
    expect(response.data).toEqual({ intent: "cache.refresh", job, created: false });
  });

  it("returns a safe error when starting the workflow fails", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));
    mockedStartCacheRefresh.mockRejectedValue(new Error("internal workflow failure"));

    const response = expectDataResult<{ error: string }>(await action(createActionArgs()));

    expect(dataStatus(response)).toBe(503);
    expect(response.data.error).not.toContain("internal workflow failure");
  });

  it("rejects non-admin and anonymous users", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 2, role: "guest" }));
    await expect(loader(createLoaderArgs())).resolves.toHaveProperty("status", 403);
    await expect(action(createActionArgs())).resolves.toHaveProperty("status", 403);

    mockedGetActiveSensei.mockResolvedValue(null);
    await expect(loader(createLoaderArgs())).resolves.toMatchObject({ status: 302 });
    await expect(action(createActionArgs())).resolves.toMatchObject({ status: 302 });
  });

  it("returns 400 for unknown intents", async () => {
    mockedGetActiveSensei.mockResolvedValue(makeSensei({ id: 1, role: "admin" }));

    const response = expectDataResult(await action(createActionArgs("unknown")));

    expect(dataStatus(response)).toBe(400);
    expect(response.data).toEqual({ intent: "unknown", error: "Unsupported intent: unknown" });
  });
});
