import { describe, expect, it } from "@jest/globals";
import { CACHE_REFRESH_TASK_NAMES, createPendingCacheRefreshTaskResults } from "~/domain/cache-refresh";
import { parseCacheRefreshTaskResults } from "~/models/cache-refresh-job";

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
});
