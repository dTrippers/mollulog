import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  CACHE_REFRESH_TASK_NAMES,
  createPendingCacheRefreshTaskResults,
  ROUTE_CACHE_REFRESH_TASK_NAMES,
  SOURCE_CACHE_REFRESH_TASK_NAMES,
} from "~/domain/cache-refresh";
import { runCacheRefreshTask } from "~/jobs/cache-refresh";
import {
  completeCacheRefreshJob,
  markCacheRefreshJobRunning,
  markCacheRefreshTaskRunning,
  recordCacheRefreshTaskResult,
  recordSkippedCacheRefreshTasks,
} from "~/models/cache-refresh-job";

jest.mock("~/jobs/cache-refresh", () => ({
  runCacheRefreshTask: jest.fn(),
}));

jest.mock("~/models/cache-refresh-job", () => ({
  completeCacheRefreshJob: jest.fn(),
  markCacheRefreshJobRunning: jest.fn(),
  markCacheRefreshTaskRunning: jest.fn(),
  recordCacheRefreshTaskResult: jest.fn(),
  recordSkippedCacheRefreshTasks: jest.fn(),
}));

import { runCacheRefreshWorkflow, SOURCE_CACHE_REFRESH_TASK_PHASES } from "~/jobs/cache-refresh-workflow.server";

const mockedRunCacheRefreshTask = runCacheRefreshTask as jest.MockedFunction<typeof runCacheRefreshTask>;
const mockedCompleteCacheRefreshJob = completeCacheRefreshJob as jest.MockedFunction<typeof completeCacheRefreshJob>;
const mockedMarkCacheRefreshJobRunning = markCacheRefreshJobRunning as jest.MockedFunction<
  typeof markCacheRefreshJobRunning
>;
const mockedMarkCacheRefreshTaskRunning = markCacheRefreshTaskRunning as jest.MockedFunction<
  typeof markCacheRefreshTaskRunning
>;
const mockedRecordCacheRefreshTaskResult = recordCacheRefreshTaskResult as jest.MockedFunction<
  typeof recordCacheRefreshTaskResult
>;
const mockedRecordSkippedCacheRefreshTasks = recordSkippedCacheRefreshTasks as jest.MockedFunction<
  typeof recordSkippedCacheRefreshTasks
>;

function createStep(): WorkflowStep {
  return {
    do: jest.fn(async (...args: unknown[]) => {
      const callback = (typeof args[1] === "function" ? args[1] : args[2]) as () => Promise<unknown>;
      return callback();
    }),
  } as unknown as WorkflowStep;
}

function calledTaskNames() {
  return mockedRunCacheRefreshTask.mock.calls.map((call) => call[3]);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createEvent(): WorkflowEvent<{ requestedBy: number }> {
  return {
    payload: { requestedBy: 1 },
    timestamp: new Date("2026-07-23T00:00:00Z"),
    instanceId: "job-uid",
    workflowName: "mollulog-cache-refresh-local",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRunCacheRefreshTask.mockResolvedValue({ status: "succeeded", durationMs: 10, error: null });
  mockedMarkCacheRefreshJobRunning.mockResolvedValue();
  mockedMarkCacheRefreshTaskRunning.mockResolvedValue();
  mockedRecordCacheRefreshTaskResult.mockResolvedValue(createPendingCacheRefreshTaskResults());
  mockedRecordSkippedCacheRefreshTasks.mockResolvedValue(createPendingCacheRefreshTaskResults());
  mockedCompleteCacheRefreshJob.mockResolvedValue();
});

describe("cache refresh workflow", () => {
  it("runs all source and route cache tasks and records completion", async () => {
    const output = await runCacheRefreshWorkflow({} as Env, {} as ExecutionContext, createEvent(), createStep());

    expect([...calledTaskNames()].sort()).toEqual([...CACHE_REFRESH_TASK_NAMES].sort());
    expect(mockedMarkCacheRefreshTaskRunning).toHaveBeenCalledTimes(CACHE_REFRESH_TASK_NAMES.length);
    expect(mockedRecordCacheRefreshTaskResult).toHaveBeenCalledTimes(CACHE_REFRESH_TASK_NAMES.length);
    expect(mockedCompleteCacheRefreshJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-uid",
      "completed",
      expect.anything(),
    );
    expect(output.status).toBe("completed");
  });

  it("finishes source tasks, skips route tasks, and reports partial failure", async () => {
    mockedRunCacheRefreshTask.mockImplementation(async (_env, _ctx, _jobUid, taskName) =>
      taskName === "warmRaidCache"
        ? { status: "failed", durationMs: 20, error: "safe error" }
        : { status: "succeeded", durationMs: 10, error: null },
    );

    const output = await runCacheRefreshWorkflow({} as Env, {} as ExecutionContext, createEvent(), createStep());

    expect([...calledTaskNames()].sort()).toEqual([...SOURCE_CACHE_REFRESH_TASK_NAMES].sort());
    expect(mockedRecordSkippedCacheRefreshTasks).toHaveBeenCalledWith(
      expect.anything(),
      "job-uid",
      ROUTE_CACHE_REFRESH_TASK_NAMES,
    );
    for (const taskName of ROUTE_CACHE_REFRESH_TASK_NAMES) {
      expect(output.taskResults[taskName].status).toBe("skipped");
    }
    expect(output.status).toBe("partial_failure");
  });

  it("continues cache work when a progress update fails", async () => {
    mockedMarkCacheRefreshTaskRunning.mockRejectedValue(new Error("PostgreSQL unavailable"));

    const output = await runCacheRefreshWorkflow({} as Env, {} as ExecutionContext, createEvent(), createStep());

    expect(mockedRunCacheRefreshTask).toHaveBeenCalledTimes(CACHE_REFRESH_TASK_NAMES.length);
    expect(output.status).toBe("completed");
  });

  it("groups every source task into exactly one phase", () => {
    expect(SOURCE_CACHE_REFRESH_TASK_PHASES.flat().sort()).toEqual([...SOURCE_CACHE_REFRESH_TASK_NAMES].sort());
  });

  it("runs up to four tasks at once and starts a phase only after the previous one settles", async () => {
    const [firstPhase = [], secondPhase = []] = SOURCE_CACHE_REFRESH_TASK_PHASES;
    const gate = deferred();
    let running = 0;
    let maxRunning = 0;
    mockedRunCacheRefreshTask.mockImplementation(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await gate.promise;
      running -= 1;
      return { status: "succeeded", durationMs: 10, error: null };
    });

    const workflow = runCacheRefreshWorkflow({} as Env, {} as ExecutionContext, createEvent(), createStep());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calledTaskNames()).toHaveLength(4);

    gate.resolve();
    await workflow;

    const names = calledTaskNames();
    const lastFirstPhaseCall = Math.max(...firstPhase.map((name) => names.indexOf(name)));
    for (const name of secondPhase) {
      expect(names.indexOf(name)).toBeGreaterThan(lastFirstPhaseCall);
    }
    expect(maxRunning).toBe(4);
    expect(names).toHaveLength(CACHE_REFRESH_TASK_NAMES.length);
  });

  it("shares one cache refresh scope across every task of a run", async () => {
    await runCacheRefreshWorkflow({} as Env, {} as ExecutionContext, createEvent(), createStep());

    const scopes = new Set(mockedRunCacheRefreshTask.mock.calls.map((call) => call[4]));
    expect(scopes.size).toBe(1);
  });
});
