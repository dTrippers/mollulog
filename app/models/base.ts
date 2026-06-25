import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";

const cachePrefix = "cache::";

/**
 * Per-operation timeout for KV reads/writes.
 *
 * KV occasionally stops responding without ever rejecting. Bounding each call
 * turns a 30s isolate hang into a fast cache-miss (read) or a skipped write,
 * which also prevents a never-settling promise from poisoning the in-flight map
 * below. Mirrors the 2s D1 deadline.
 */
const KV_TIMEOUT_MS = 2000;

/**
 * Deadline for regenerating a cached value.
 *
 * This is intentionally longer than KV/D1, but still well below CloudFront's
 * 30s origin timeout. When stale data exists, this turns a hung refresh into a
 * stale fallback instead of holding the SSR response open.
 */
const CACHE_FN_TIMEOUT_MS = 5000;

/**
 * Safety deadline for the in-flight dedup entry. Even if a generation never
 * settles (e.g. a hung BAQL/ranks fetch inside `fn`), the entry is dropped after
 * this so it cannot poison every later same-key request in a long-lived isolate.
 */
const INFLIGHT_MAX_MS = 10000;

/**
 * Default KV expirationTtl (90 days).
 *
 * If a cache entry is not read for a long time, KV expires it naturally and
 * regenerates it with a cold fetch on the next access. 90 days is a compromise
 * that provides quarterly cleanup while avoiding cold-miss spikes from short
 * expirations.
 */
export const DEFAULT_KV_EXPIRATION_TTL = 90 * 24 * 60 * 60;

type CacheEnvelope<T> = {
  _ver: 2;
  data: T;
  cachedAt: number;
};

/**
 * In-flight map for sharing concurrent fetches for the same key inside one isolate.
 *
 * Uses the `env.KV_CACHE` object reference as the key. This relies on the
 * Cloudflare Workers runtime keeping the KV binding object reference stable for
 * the lifetime of an isolate. When the isolate is recreated, the WeakMap is also
 * discarded, so this does not leak memory.
 */
const inflightCacheRequests = new WeakMap<object, Map<string, Promise<unknown>>>();

function isCacheEnvelope<T>(value: CacheEnvelope<T> | T): value is CacheEnvelope<T> {
  return typeof value === "object" && value !== null && "_ver" in value && value._ver === 2;
}

function resolveTtl<T>(ttl: number | ((data: T) => number), data: T): number {
  return typeof ttl === "function" ? ttl(data) : ttl;
}

function isCacheDisabled(env: Env): boolean {
  return env.DISABLE_CACHE === "true" || env.DISABLE_CACHE === "1";
}

function serializeCacheValue(value: unknown): string {
  return JSON.stringify(value);
}

function parseCacheValue<T>(raw: string): CacheEnvelope<T> | T {
  return JSON.parse(raw) as CacheEnvelope<T> | T;
}

function warnIoFailure(label: string, dataKey: string, error: unknown, timeoutMs: number) {
  const details: Record<string, unknown> = { label, dataKey };
  if (isTimeoutError(error)) {
    details.timeoutMs = timeoutMs;
    console.warn("[io-watchdog] timeout", getIoWatchdogContext(details));
    return;
  }

  if (error instanceof Error) {
    details.errorName = error.name;
    details.errorMessage = error.message;
  } else {
    details.error = error;
  }
  console.warn("[io-watchdog] failed", getIoWatchdogContext(details));
}

async function fetchCachedInternal<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  ttl?: number | ((data: T) => number),
  forceRefresh = false,
): Promise<T> {
  const cacheKey = `${cachePrefix}${dataKey}`;
  let raw: string | null = null;
  try {
    raw = await watchIo("kv.get", withTimeout(env.KV_CACHE.get(cacheKey), KV_TIMEOUT_MS, "kv.get"), { dataKey });
  } catch (error) {
    // KV read timed out or failed — fall through to a fresh fetch (treat as a miss).
    warnIoFailure("kv.get", dataKey, error, KV_TIMEOUT_MS);
    raw = null;
  }

  let cachedData: T | undefined;
  let cachedAt = 0;
  if (raw) {
    try {
      const parsed = parseCacheValue<T>(raw);
      if (isCacheEnvelope(parsed)) {
        cachedData = parsed.data;
        cachedAt = parsed.cachedAt;
      } else {
        cachedData = parsed;
      }
    } catch {
      cachedData = undefined;
    }
  }

  if (
    cachedData !== undefined &&
    !forceRefresh &&
    (ttl !== undefined ? Date.now() - cachedAt < resolveTtl(ttl, cachedData) * 1000 : true)
  ) {
    return cachedData;
  }

  try {
    const data = await watchIo("cache.fn", withTimeout(fn(), CACHE_FN_TIMEOUT_MS, "cache.fn"), { dataKey });
    const envelope: CacheEnvelope<T> = {
      _ver: 2,
      data,
      cachedAt: Date.now(),
    };

    try {
      await watchIo(
        "kv.put",
        withTimeout(
          env.KV_CACHE.put(cacheKey, serializeCacheValue(envelope), { expirationTtl: DEFAULT_KV_EXPIRATION_TTL }),
          KV_TIMEOUT_MS,
          "kv.put",
        ),
        { dataKey },
      );
    } catch (error) {
      // Cache write timed out or failed — still return the fresh data we just fetched.
      warnIoFailure("kv.put", dataKey, error, KV_TIMEOUT_MS);
    }
    return data;
  } catch (error) {
    if (isTimeoutError(error)) {
      warnIoFailure("cache.fn", dataKey, error, CACHE_FN_TIMEOUT_MS);
    }

    if (cachedData !== undefined) {
      return cachedData;
    }

    throw error;
  }
}

export async function fetchCached<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  ttl?: number | ((data: T) => number),
  forceRefresh = false,
): Promise<T> {
  if (isCacheDisabled(env)) {
    return fn();
  }

  const cacheKey = `${cachePrefix}${dataKey}`;
  let namespaceInflightRequests = inflightCacheRequests.get(env.KV_CACHE);
  if (!namespaceInflightRequests) {
    namespaceInflightRequests = new Map<string, Promise<unknown>>();
    inflightCacheRequests.set(env.KV_CACHE, namespaceInflightRequests);
  }

  // A forceRefresh caller must start its own request instead of piggybacking on an in-flight one.
  // Non-force callers can freely piggyback on any in-flight request regardless of force status.
  if (!forceRefresh) {
    const inflight = namespaceInflightRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
  }

  const inflightMap = namespaceInflightRequests;
  const request = fetchCachedInternal(env, dataKey, fn, ttl, forceRefresh).finally(() => {
    clearTimeout(evictTimer);
    if (inflightMap.get(cacheKey) === request) {
      inflightMap.delete(cacheKey);
    }
  });
  // Safety net: if `request` never settles (a hung KV/BAQL/ranks call), drop the
  // in-flight entry after a deadline so it cannot poison every later same-key
  // request sharing this long-lived isolate.
  const evictTimer = setTimeout(() => {
    if (inflightMap.get(cacheKey) === request) {
      inflightMap.delete(cacheKey);
    }
  }, INFLIGHT_MAX_MS);
  inflightMap.set(cacheKey, request);
  return request;
}

export async function deleteCache(env: Env, ...dataKeys: string[]) {
  await Promise.all(dataKeys.map((key) => {
    const cacheKey = `${cachePrefix}${key}`;
    return env.KV_CACHE.delete(cacheKey);
  }));
}

export async function flushCacheAll(env: Env) {
  let cursor: string | undefined;
  do {
    const caches = await env.KV_CACHE.list({ prefix: cachePrefix, cursor });
    await Promise.all(caches.keys.map((key) => env.KV_CACHE.delete(key.name)));
    cursor = caches.list_complete ? undefined : caches.cursor;
  } while (cursor);
}

export function isUniqueConstraintError(err: Error): { table: string, column: string } | null {
  const match = err.message.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
  if (match) {
    return { table: match[1], column: match[2] };
  }

  return null;
}
