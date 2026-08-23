import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  CACHE_REFRESH_TASK_NAMES,
  type CacheRefreshTaskResults,
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
  markCacheRefreshJobRunning,
  markCacheRefreshTaskRunning,
  parseCacheRefreshTaskResults,
  recordCacheRefreshTaskResult,
  recordSkippedCacheRefreshTasks,
} from "~/models/cache-refresh-job";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

type QueryConfig = {
  text: string;
  values?: unknown[];
};

type QueryResult = {
  rows: unknown[][];
  rowCount: number;
};

function createClient(results: QueryResult[]) {
  const query = jest.fn(async (_config: QueryConfig, _values?: unknown[]): Promise<QueryResult> => {
    return results.shift() ?? { rows: [], rowCount: 0 };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, query };
}

function queryConfig(query: ReturnType<typeof createClient>["query"], index: number) {
  const call = query.mock.calls[index];
  if (!call) throw new Error(`Missing PostgreSQL query call ${index}`);
  const [config, values] = call;
  return { text: config.text, values: config.values ?? values ?? [] };
}

function taskResults(overrides: Partial<CacheRefreshTaskResults> = {}): CacheRefreshTaskResults {
  return { ...createPendingCacheRefreshTaskResults(), ...overrides };
}

function cacheRefreshRow({
  uid = "job-uid",
  requestedBy = 7,
  status = "running",
  activeSlot = 1,
  currentTask = "warmRaidCache",
  completedCount = 3,
  totalCount = CACHE_REFRESH_TASK_NAMES.length,
  results = taskResults(),
  startedAt = new Date("2026-07-23T00:10:00.000Z"),
  finishedAt = null,
  createdAt = new Date("2026-07-23T00:00:00.000Z"),
  updatedAt = new Date("2026-07-23T00:30:00.000Z"),
}: {
  uid?: string;
  requestedBy?: number;
  status?: string;
  activeSlot?: number | null;
  currentTask?: string | null;
  completedCount?: number;
  totalCount?: number;
  results?: CacheRefreshTaskResults;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
} = {}): unknown[] {
  return [
    1,
    uid,
    requestedBy,
    status,
    activeSlot,
    currentTask,
    completedCount,
    totalCount,
    results,
    startedAt,
    finishedAt,
    createdAt,
    updatedAt,
  ];
}

function options(client: Client) {
  return { createClient: () => client };
}

describe("cache refresh PostgreSQL model", () => {
  it("maps PostgreSQL rows to the existing job contract with UTC ISO timestamps", async () => {
    const { client, query } = createClient([{ rows: [cacheRefreshRow()], rowCount: 1 }]);

    await expect(getCacheRefreshJob(env, "job-uid", options(client))).resolves.toEqual({
      uid: "job-uid",
      requestedBy: 7,
      status: "running",
      currentTask: "warmRaidCache",
      completedCount: 3,
      totalCount: CACHE_REFRESH_TASK_NAMES.length,
      taskResults: taskResults(),
      startedAt: "2026-07-23T00:10:00.000Z",
      finishedAt: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:30:00.000Z",
    });

    const config = queryConfig(query, 0);
    expect(config.text).toContain('from "cache_refresh_jobs"');
    expect(config.values).toEqual(["job-uid", 1]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("validates every required task result field from JSONB rows", async () => {
    const invalid = taskResults({
      syncRawStudents: { status: "succeeded", durationMs: null } as never,
    });
    const { client } = createClient([{ rows: [cacheRefreshRow({ results: invalid })], rowCount: 1 }]);

    await expect(getCacheRefreshJob(env, "job-uid", options(client))).rejects.toThrow(
      "Invalid cache refresh task error: syncRawStudents",
    );
    expect(() => parseCacheRefreshTaskResults(JSON.stringify(invalid))).toThrow(
      "Invalid cache refresh task error: syncRawStudents",
    );
  });

  it("creates a queued job with JSONB task results and maps the returned row", async () => {
    const { client, query } = createClient([
      { rows: [cacheRefreshRow({ status: "queued", currentTask: null, completedCount: 0 })], rowCount: 1 },
    ]);

    await expect(
      createCacheRefreshJob(env, { uid: "job-uid", requestedBy: 7 }, options(client)),
    ).resolves.toMatchObject({
      uid: "job-uid",
      status: "queued",
      currentTask: null,
      completedCount: 0,
    });

    const config = queryConfig(query, 0);
    expect(config.text).toContain('insert into "cache_refresh_jobs"');
    expect(config.text).toContain('"task_results"');
    expect(config.values).toEqual([
      "job-uid",
      7,
      "queued",
      1,
      CACHE_REFRESH_TASK_NAMES.length,
      JSON.stringify(createPendingCacheRefreshTaskResults()),
    ]);
  });

  it("uses PostgreSQL active and latest queries", async () => {
    const activeClient = createClient([{ rows: [cacheRefreshRow()], rowCount: 1 }]);
    await expect(getActiveCacheRefreshJob(env, options(activeClient.client))).resolves.toMatchObject({
      uid: "job-uid",
    });
    expect(queryConfig(activeClient.query, 0).text).toContain('"active_slot" = $1');

    const latestClient = createClient([{ rows: [cacheRefreshRow()], rowCount: 1 }]);
    await expect(getLatestCacheRefreshJob(env, options(latestClient.client))).resolves.toMatchObject({
      uid: "job-uid",
    });
    expect(queryConfig(latestClient.query, 0).text).toContain('order by "cache_refresh_jobs"."created_at" desc');
  });

  it("records task progress on the same operation-scoped PostgreSQL client", async () => {
    const result = { status: "succeeded" as const, durationMs: 42, error: null };
    const { client, query } = createClient([
      { rows: [cacheRefreshRow()], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);

    await expect(
      recordCacheRefreshTaskResult(env, "job-uid", "warmRaidCache", result, options(client)),
    ).resolves.toEqual(taskResults({ warmRaidCache: result }));
    expect(query).toHaveBeenCalledTimes(2);
    expect(queryConfig(query, 1).text).toContain('update "cache_refresh_jobs"');
    expect(queryConfig(query, 1).values).toContain(JSON.stringify(taskResults({ warmRaidCache: result })));
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("records skipped tasks and clears active state on completion/failure", async () => {
    const skipped = createClient([
      { rows: [cacheRefreshRow()], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    await expect(
      recordSkippedCacheRefreshTasks(env, "job-uid", ["getEventList"], options(skipped.client)),
    ).resolves.toEqual(taskResults({ getEventList: { status: "skipped", durationMs: null, error: null } }));
    expect(queryConfig(skipped.query, 1).values).toContain(
      JSON.stringify(taskResults({ getEventList: { status: "skipped", durationMs: null, error: null } })),
    );

    const completed = createClient([{ rows: [], rowCount: 1 }]);
    await completeCacheRefreshJob(env, "job-uid", "completed", taskResults(), options(completed.client));
    expect(completed.query.mock.calls[0]?.[0].text).toContain('"active_slot" = $2');

    const failed = createClient([{ rows: [], rowCount: 1 }]);
    await failCacheRefreshJob(env, "job-uid", options(failed.client));
    expect(failed.query.mock.calls[0]?.[0].text).toContain('"status" = $1');
  });

  it("marks job and task progress through PostgreSQL updates", async () => {
    const jobClient = createClient([{ rows: [], rowCount: 1 }]);
    await markCacheRefreshJobRunning(env, "job-uid", options(jobClient.client));
    expect(queryConfig(jobClient.query, 0).text).toContain("coalesce");
    expect(queryConfig(jobClient.query, 0).text).toContain("now()");

    const taskClient = createClient([{ rows: [], rowCount: 1 }]);
    await markCacheRefreshTaskRunning(env, "job-uid", "warmRaidCache", options(taskClient.client));
    expect(queryConfig(taskClient.query, 0).values).toEqual(["warmRaidCache", "job-uid"]);
  });

  it("releases stale jobs with one atomic PostgreSQL conditional update", async () => {
    const { client, query } = createClient([{ rows: [], rowCount: 1 }]);

    await expect(failStaleCacheRefreshJob(env, "job-uid", 24, options(client))).resolves.toBe(true);

    const config = queryConfig(query, 0);
    expect(config.text).toContain("updated_at <= now() - ($2::double precision * INTERVAL '1 hour')");
    expect(config.text).toContain("active_slot = 1");
    expect(config.text).not.toContain("datetime('now'");
    expect(config.values).toEqual(["job-uid", 24]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("returns false when the stale conditional update affects no row", async () => {
    const { client } = createClient([{ rows: [], rowCount: 0 }]);
    await expect(failStaleCacheRefreshJob(env, "job-uid", 24, options(client))).resolves.toBe(false);
  });
});
