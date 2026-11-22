import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";

/**
 * Cache policy for one admin cache refresh job.
 *
 * No user waits on the job, so a regeneration inside the scope gets a longer
 * deadline, and a forced refresh that fails rejects instead of answering with
 * the stale value. That way a task reports success only when its caches were
 * actually regenerated.
 *
 * Later tasks of the same job force-refresh many of the same keys (route views
 * re-force the raid/recruitment/event sources that earlier tasks just
 * refreshed). A key regenerated once in the scope is shared with every later
 * forced request instead of being fetched again.
 */
export type CacheRefreshScope = {
  generateTimeoutMs: number;
  forcedRefreshes: Map<string, Promise<unknown>>;
};

// The scope lives in AsyncLocalStorage, which only the Worker runtime has. Client bundles reach this module through
// models, so the storage stays in refresh-scope.server.ts and installs its reader here when it loads.
let readCacheRefreshScope: () => CacheRefreshScope | undefined = () => undefined;

export function setCacheRefreshScopeReader(reader: () => CacheRefreshScope | undefined) {
  readCacheRefreshScope = reader;
}

export function createCacheRefreshScope(): CacheRefreshScope {
  return {
    generateTimeoutMs: RUNTIME_TIMEOUTS.cache.jobGenerate,
    forcedRefreshes: new Map(),
  };
}

export function getCacheRefreshScope(): CacheRefreshScope | undefined {
  return readCacheRefreshScope();
}

/** Shares one successful forced refresh per key across the scope; a failed one is retried by the next caller. */
export function shareScopedForcedRefresh<T>(
  scope: CacheRefreshScope,
  dataKey: string,
  refresh: () => Promise<T>,
): Promise<T> {
  const existing = scope.forcedRefreshes.get(dataKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const request = refresh();
  scope.forcedRefreshes.set(dataKey, request);
  request.catch(() => {
    if (scope.forcedRefreshes.get(dataKey) === request) {
      scope.forcedRefreshes.delete(dataKey);
    }
  });
  return request;
}
