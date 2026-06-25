import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";

const cachePrefix = "cache::";

/**
 * Per-operation timeout for KV reads/writes.
 *
 * KV occasionally stops responding without ever rejecting. Bounding each call
 * turns a 30s isolate hang into a fast cache-miss (read) or a skipped write,
 * which also prevents a never-settling promise from poisoning the in-flight map
 * below. Keep this short because cache reads/writes have route-level fallbacks.
 */
const KV_TIMEOUT_MS = RUNTIME_TIMEOUTS.kv.operation;
const KV_COOLDOWN_AFTER_TIMEOUT_MS = RUNTIME_TIMEOUTS.kv.cooldownAfterTimeout;

type KvCircuitState = {
  disabledUntil: number;
  reason: string;
};

const kvCircuitStates = new WeakMap<object, KvCircuitState>();

/**
 * Deadline for regenerating a cached value.
 *
 * This is intentionally longer than KV/D1, but still well below CloudFront's
 * 30s origin timeout. When stale data exists, this turns a hung refresh into a
 * stale fallback instead of holding the SSR response open.
 */
const CACHE_FN_TIMEOUT_MS = RUNTIME_TIMEOUTS.cache.generate;

/**
 * Safety deadline for the in-flight dedup entry. Even if a generation never
 * settles (e.g. a hung BAQL/ranks fetch inside `fn`), the entry is dropped after
 * this so it cannot poison every later same-key request in a long-lived isolate.
 */
const INFLIGHT_MAX_MS = RUNTIME_TIMEOUTS.cache.inflightMax;

/**
 * Per-caller deadline when piggybacking on an in-flight cached fetch.
 *
 * The in-flight map eviction above prevents future requests from reusing a
 * poisoned promise, but callers that already received that promise can still be
 * stuck on it. Bound each piggyback wait and start an independent regeneration
 * if the shared promise does not settle.
 */
const INFLIGHT_WAIT_TIMEOUT_MS = RUNTIME_TIMEOUTS.cache.inflightWait;

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

type InflightCacheRequest = {
  promise: Promise<unknown>;
  dataKey: string;
  startedAt: number;
  forceRefresh: boolean;
};

/**
 * In-flight map for sharing concurrent fetches for the same key inside one isolate.
 *
 * Uses the `env.KV_CACHE` object reference as the key. This relies on the
 * Cloudflare Workers runtime keeping the KV binding object reference stable for
 * the lifetime of an isolate. When the isolate is recreated, the WeakMap is also
 * discarded, so this does not leak memory.
 */
const inflightCacheRequests = new WeakMap<object, Map<string, InflightCacheRequest>>();

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
    console.error("[io-watchdog] timeout", getIoWatchdogContext(details));
    return;
  }

  if (error instanceof Error) {
    details.errorName = error.name;
    details.errorMessage = error.message;
  } else {
    details.error = error;
  }
  console.error("[io-watchdog] failed", getIoWatchdogContext(details));
}

function getKvCooldownRemainingMs(env: Env) {
  const state = kvCircuitStates.get(env.KV_CACHE);
  if (!state) {
    return 0;
  }

  const remainingMs = state.disabledUntil - Date.now();
  if (remainingMs <= 0) {
    kvCircuitStates.delete(env.KV_CACHE);
    return 0;
  }

  return remainingMs;
}

function tripKvCircuit(env: Env, reason: string) {
  kvCircuitStates.set(env.KV_CACHE, {
    disabledUntil: Date.now() + KV_COOLDOWN_AFTER_TIMEOUT_MS,
    reason,
  });
}

function shouldSkipKv(env: Env, operation: "kv.get" | "kv.put", dataKey: string) {
  const remainingMs = getKvCooldownRemainingMs(env);
  if (remainingMs <= 0) {
    return false;
  }

  const state = kvCircuitStates.get(env.KV_CACHE);
  console.warn(
    "[io-watchdog] kv.skipped",
    getIoWatchdogContext({
      label: operation,
      dataKey,
      cooldownRemainingMs: remainingMs,
      reason: state?.reason,
    }),
  );
  return true;
}

function shouldTraceInflightStart(dataKey: string) {
  return dataKey.startsWith("community::feed::");
}

function logInflightLifecycle(phase: "start" | "settled" | "evicted", entry: InflightCacheRequest) {
  const elapsedMs = Date.now() - entry.startedAt;
  if (phase === "start" && !shouldTraceInflightStart(entry.dataKey)) {
    return;
  }

  if (
    phase === "settled" &&
    elapsedMs < RUNTIME_TIMEOUTS.watchdogWarnMs.default &&
    !shouldTraceInflightStart(entry.dataKey)
  ) {
    return;
  }

  console.warn(
    "[io-watchdog] cache.inflight",
    getIoWatchdogContext({
      label: "cache.inflight",
      phase,
      dataKey: entry.dataKey,
      forceRefresh: entry.forceRefresh,
      inflightAgeMs: elapsedMs,
    }),
  );
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
  if (!shouldSkipKv(env, "kv.get", dataKey)) {
    try {
      raw = await watchIo("kv.get", withTimeout(env.KV_CACHE.get(cacheKey), KV_TIMEOUT_MS, "kv.get"), { dataKey });
    } catch (error) {
      // KV read timed out or failed — fall through to a fresh fetch (treat as a miss).
      warnIoFailure("kv.get", dataKey, error, KV_TIMEOUT_MS);
      if (isTimeoutError(error)) {
        tripKvCircuit(env, "kv.get");
      }
      raw = null;
    }
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

    if (!shouldSkipKv(env, "kv.put", dataKey)) {
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
        if (isTimeoutError(error)) {
          tripKvCircuit(env, "kv.put");
        }
      }
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
    namespaceInflightRequests = new Map<string, InflightCacheRequest>();
    inflightCacheRequests.set(env.KV_CACHE, namespaceInflightRequests);
  }

  // A forceRefresh caller must start its own request instead of piggybacking on an in-flight one.
  // Non-force callers can freely piggyback on any in-flight request regardless of force status.
  if (!forceRefresh) {
    const inflightEntry = namespaceInflightRequests.get(cacheKey);
    if (inflightEntry) {
      const inflightAgeMs = Date.now() - inflightEntry.startedAt;
      if (inflightAgeMs > INFLIGHT_MAX_MS) {
        if (namespaceInflightRequests.get(cacheKey) === inflightEntry) {
          namespaceInflightRequests.delete(cacheKey);
          logInflightLifecycle("evicted", inflightEntry);
        }
      } else {
        try {
          return await watchIo(
            "cache.inflight",
            withTimeout(inflightEntry.promise as Promise<T>, INFLIGHT_WAIT_TIMEOUT_MS, "cache.inflight"),
            {
              dataKey,
              inflightAgeMs,
              inflightForceRefresh: inflightEntry.forceRefresh,
            },
          );
        } catch (error) {
          if (!isTimeoutError(error)) {
            throw error;
          }

          warnIoFailure("cache.inflight", dataKey, error, INFLIGHT_WAIT_TIMEOUT_MS);
          if (namespaceInflightRequests.get(cacheKey) === inflightEntry) {
            namespaceInflightRequests.delete(cacheKey);
          }
        }
      }
    }
  }

  const inflightMap = namespaceInflightRequests;
  const inflightState: {
    entry?: InflightCacheRequest;
    evictTimer?: ReturnType<typeof setTimeout>;
  } = {};
  const request = fetchCachedInternal(env, dataKey, fn, ttl, forceRefresh).finally(() => {
    if (inflightState.evictTimer) {
      clearTimeout(inflightState.evictTimer);
    }
    if (!inflightState.entry) {
      return;
    }

    if (inflightMap.get(cacheKey) === inflightState.entry) {
      inflightMap.delete(cacheKey);
    }
    logInflightLifecycle("settled", inflightState.entry);
  });
  const entry: InflightCacheRequest = {
    promise: request,
    dataKey,
    startedAt: Date.now(),
    forceRefresh,
  };
  inflightState.entry = entry;
  logInflightLifecycle("start", entry);
  // Safety net: if `request` never settles (a hung KV/BAQL/ranks call), drop the
  // in-flight entry after a deadline so it cannot poison every later same-key
  // request sharing this long-lived isolate.
  inflightState.evictTimer = setTimeout(() => {
    if (!inflightState.entry) {
      return;
    }

    if (inflightMap.get(cacheKey) === inflightState.entry) {
      inflightMap.delete(cacheKey);
      logInflightLifecycle("evicted", inflightState.entry);
    }
  }, INFLIGHT_MAX_MS);
  inflightMap.set(cacheKey, entry);
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
