import { describe, expect, it, jest } from "@jest/globals";
import { CACHE_REFRESH_TASK_NAMES, createPendingCacheRefreshTaskResults } from "~/domain/cache-refresh";
import { failStaleCacheRefreshJob, parseCacheRefreshTaskResults } from "~/models/cache-refresh-job";

describe("cache refresh job model", () => {
  it("parses a complete task result payload", () => {
    const results = createPendingCacheRefreshTaskResults();
    results.syncRawStudents = { status: "succeeded", durationMs: 1200, error: null };

    expect(parseCacheRefreshTaskResults(JSON.stringify(results))).toEqual(results);
  });

  it("rejects payloads that omit a known task", () => {
    const results = createPendingCacheRefreshTaskResults() as Record<string, unknown>;
    delete results[CACHE_REFRESH_TASK_NAMES[0]];

    expect(() => parseCacheRefreshTaskResults(JSON.stringify(results))).toThrow("Invalid cache refresh task result");
  });

  it("releases only jobs older than the stale threshold", async () => {
    const run = jest.fn(async () => ({ meta: { changes: 1 } }));
    const bind = jest.fn((_uid: string, _staleAge: string) => ({ run }));
    const prepare = jest.fn((_query: string) => ({ bind }));
    const env = { DB: { prepare } } as unknown as Pick<Env, "DB">;

    await expect(failStaleCacheRefreshJob(env, "job-uid", 24)).resolves.toBe(true);
    expect(bind).toHaveBeenCalledWith("job-uid", "-24 hours");
  });
});
