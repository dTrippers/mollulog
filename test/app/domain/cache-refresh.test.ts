import { describe, expect, it } from "@jest/globals";
import {
  CACHE_REFRESH_TASK_NAMES,
  countCompletedCacheRefreshTasks,
  createPendingCacheRefreshTaskResults,
} from "~/domain/cache-refresh";

describe("cache refresh domain", () => {
  it("creates a pending result for every refresh task", () => {
    const results = createPendingCacheRefreshTaskResults();

    expect(Object.keys(results)).toEqual(CACHE_REFRESH_TASK_NAMES);
    expect(countCompletedCacheRefreshTasks(results)).toBe(0);
  });

  it("counts succeeded, failed, and skipped tasks as completed", () => {
    const results = createPendingCacheRefreshTaskResults();
    results.syncYoutubeCommunityPosts = { status: "succeeded", durationMs: 10, error: null };
    results.syncRawStudents = { status: "failed", durationMs: 20, error: "failed" };
    results.warmRecruitmentCache = { status: "skipped", durationMs: null, error: null };

    expect(countCompletedCacheRefreshTasks(results)).toBe(3);
  });
});
