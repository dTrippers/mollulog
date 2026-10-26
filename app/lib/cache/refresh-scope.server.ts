import { AsyncLocalStorage } from "node:async_hooks";
import { type CacheRefreshScope, setCacheRefreshScopeReader } from "./refresh-scope";

const cacheRefreshScopeStorage = new AsyncLocalStorage<CacheRefreshScope>();
setCacheRefreshScopeReader(() => cacheRefreshScopeStorage.getStore());

export function runInCacheRefreshScope<T>(scope: CacheRefreshScope, fn: () => Promise<T>): Promise<T> {
  return cacheRefreshScopeStorage.run(scope, fn);
}
