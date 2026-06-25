import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";

export type CacheCategory = "source" | "route" | "cache";

const CACHE_VERSION_PREFIX = "v";

export function cacheKey(category: CacheCategory, domain: string, version: number, query: string) {
  return `${category}::${domain}::${CACHE_VERSION_PREFIX}${version}::${query}`;
}

export function cacheQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return "all";
  }
  return entries.map(([key, value]) => `${key}=${String(value)}`).join("::");
}

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
 * Default KV expirationTtl (30 days).
 *
 * Layer-specific wrappers override this where their ownership model needs a
 * shorter retention window. Source snapshots intentionally keep a 30-day KV TTL
 * so warmup/cron failures do not immediately remove the last good value.
 */
export const DEFAULT_KV_EXPIRATION_TTL = 30 * 24 * 60 * 60;
export const SOURCE_CACHE_MAX_STALE_TTL = 10 * 24 * 60 * 60;
export const SOURCE_CACHE_EXPIRATION_TTL = 30 * 24 * 60 * 60;
export const ROUTE_CACHE_FRESH_TTL = 10 * 60;
export const ROUTE_CACHE_MAX_STALE_TTL = 24 * 60 * 60;
export const ROUTE_CACHE_EXPIRATION_TTL = 7 * 24 * 60 * 60;

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

type ParsedCacheValue<T> = {
  data: T;
  cachedAt: number;
};

type FetchCachedOptions<T> = {
  ctx?: ExecutionContext;
  expirationTtl?: number;
  maxStaleTtl?: number | ((data: T) => number);
  mode?: CacheCategory;
  swr?: boolean;
  warnOnRequestRefresh?: boolean;
};

type RouteCacheOptions<T> = {
  freshTtl?: number | ((data: T) => number);
  maxStaleTtl?: number | ((data: T) => number);
  expirationTtl?: number;
};

function isCacheEnvelope<T>(value: CacheEnvelope<T> | T): value is CacheEnvelope<T> {
  return typeof value === "object" && value !== null && "_ver" in value && value._ver === 2;
}

function resolveTtl<T>(ttl: number | ((data: T) => number), data: T): number {
  return typeof ttl === "function" ? ttl(data) : ttl;
}

function isFresh<T>(cachedAt: number, ttl: number | ((data: T) => number) | undefined, data: T) {
  return ttl !== undefined ? Date.now() - cachedAt < resolveTtl(ttl, data) * 1000 : true;
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

function toParsedCacheValue<T>(raw: string): ParsedCacheValue<T> | null {
  const parsed = parseCacheValue<T>(raw);
  if (isCacheEnvelope(parsed)) {
    return {
      data: parsed.data,
      cachedAt: parsed.cachedAt,
    };
  }

  return {
    data: parsed,
    cachedAt: 0,
  };
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
  return dataKey.startsWith("cache::community-feed::");
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
  options: FetchCachedOptions<T> = {},
): Promise<T> {
  const cacheKey = dataKey;
  const expirationTtl = options.expirationTtl ?? DEFAULT_KV_EXPIRATION_TTL;
  let cached: ParsedCacheValue<T> | null = null;
  if (!shouldSkipKv(env, "kv.get", dataKey)) {
    try {
      const raw = await watchIo("kv.get", withTimeout(env.KV_CACHE.get(cacheKey), KV_TIMEOUT_MS, "kv.get"), {
        dataKey,
      });
      cached = raw ? toParsedCacheValue<T>(raw) : null;
    } catch (error) {
      // KV read timed out or failed — fall through to a fresh fetch (treat as a miss).
      warnIoFailure("kv.get", dataKey, error, KV_TIMEOUT_MS);
      if (isTimeoutError(error)) {
        tripKvCircuit(env, "kv.get");
      }
      cached = null;
    }
  }

  if (cached && !forceRefresh && isFresh(cached.cachedAt, ttl, cached.data)) {
    return cached.data;
  }

  if (
    cached &&
    !forceRefresh &&
    options.swr &&
    options.maxStaleTtl !== undefined &&
    isFresh(cached.cachedAt, options.maxStaleTtl, cached.data)
  ) {
    scheduleBackgroundRefresh(env, cacheKey, fn, expirationTtl, options);
    return cached.data;
  }

  if (!forceRefresh && options.warnOnRequestRefresh) {
    // Source snapshots should be warmed by scheduled jobs or __manage. Reaching
    // this branch on user traffic means warmup failed or the new key is missing.
    console.error(
      "[cache] source_request_refresh",
      getIoWatchdogContext({
        label: "cache.source_request_refresh",
        cacheKey,
        mode: options.mode,
      }),
    );
  }

  try {
    const data = await refreshCacheValue(env, cacheKey, fn, expirationTtl);
    return data;
  } catch (error) {
    if (isTimeoutError(error)) {
      warnIoFailure("cache.fn", dataKey, error, CACHE_FN_TIMEOUT_MS);
    }

    if (cached) {
      return cached.data;
    }

    throw error;
  }
}

async function refreshCacheValue<T>(
  env: Env,
  cacheKey: string,
  fn: () => Promise<T>,
  expirationTtl: number,
): Promise<T> {
  const data = await watchIo("cache.fn", withTimeout(fn(), CACHE_FN_TIMEOUT_MS, "cache.fn"), { dataKey: cacheKey });
  const envelope: CacheEnvelope<T> = {
    _ver: 2,
    data,
    cachedAt: Date.now(),
  };

  if (!shouldSkipKv(env, "kv.put", cacheKey)) {
    try {
      await watchIo(
        "kv.put",
        withTimeout(
          env.KV_CACHE.put(cacheKey, serializeCacheValue(envelope), { expirationTtl }),
          KV_TIMEOUT_MS,
          "kv.put",
        ),
        { dataKey: cacheKey },
      );
    } catch (error) {
      // Cache write timed out or failed — still return the fresh data we just fetched.
      warnIoFailure("kv.put", cacheKey, error, KV_TIMEOUT_MS);
      if (isTimeoutError(error)) {
        tripKvCircuit(env, "kv.put");
      }
    }
  }
  return data;
}

function scheduleBackgroundRefresh<T>(
  env: Env,
  cacheKey: string,
  fn: () => Promise<T>,
  expirationTtl: number,
  options: FetchCachedOptions<T>,
) {
  let namespaceInflightRequests = inflightCacheRequests.get(env.KV_CACHE);
  if (!namespaceInflightRequests) {
    namespaceInflightRequests = new Map<string, InflightCacheRequest>();
    inflightCacheRequests.set(env.KV_CACHE, namespaceInflightRequests);
  }

  if (namespaceInflightRequests.has(cacheKey)) {
    return;
  }

  const inflightMap = namespaceInflightRequests;
  const request = refreshCacheValue(env, cacheKey, fn, expirationTtl)
    .catch((error) => {
      console.error(
        "[cache] swr_refresh_failed",
        getIoWatchdogContext({
          label: "cache.swr_refresh_failed",
          cacheKey,
          errorName: error instanceof Error ? error.name : undefined,
          errorMessage: error instanceof Error ? error.message : String(error),
          mode: options.mode,
        }),
      );
    })
    .finally(() => {
      if (inflightMap.get(cacheKey) === entry) {
        inflightMap.delete(cacheKey);
      }
      logInflightLifecycle("settled", entry);
    });

  const entry: InflightCacheRequest = {
    promise: request,
    dataKey: cacheKey,
    startedAt: Date.now(),
    forceRefresh: true,
  };
  logInflightLifecycle("start", entry);
  inflightMap.set(cacheKey, entry);
  if (options.ctx) {
    options.ctx.waitUntil(request);
    return;
  }

  void request;
}

export async function fetchSourceCached<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  forceRefresh = false,
): Promise<T> {
  return fetchCached(env, dataKey, fn, SOURCE_CACHE_MAX_STALE_TTL, forceRefresh, {
    expirationTtl: SOURCE_CACHE_EXPIRATION_TTL,
    maxStaleTtl: SOURCE_CACHE_MAX_STALE_TTL,
    mode: "source",
    warnOnRequestRefresh: true,
  });
}

export async function fetchRouteCached<T>(
  env: Env,
  ctx: ExecutionContext | undefined,
  dataKey: string,
  fn: () => Promise<T>,
  forceRefresh = false,
  options: RouteCacheOptions<T> = {},
): Promise<T> {
  return fetchCached(env, dataKey, fn, options.freshTtl ?? ROUTE_CACHE_FRESH_TTL, forceRefresh, {
    ctx,
    expirationTtl: options.expirationTtl ?? ROUTE_CACHE_EXPIRATION_TTL,
    maxStaleTtl: options.maxStaleTtl ?? ROUTE_CACHE_MAX_STALE_TTL,
    mode: "route",
    swr: true,
  });
}

export async function fetchCached<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  ttl?: number | ((data: T) => number),
  forceRefresh = false,
  options: FetchCachedOptions<T> = {},
): Promise<T> {
  if (isCacheDisabled(env)) {
    return fn();
  }

  const cacheKey = dataKey;
  let namespaceInflightRequests = inflightCacheRequests.get(env.KV_CACHE);
  if (!namespaceInflightRequests) {
    namespaceInflightRequests = new Map<string, InflightCacheRequest>();
    inflightCacheRequests.set(env.KV_CACHE, namespaceInflightRequests);
  }

  // A forceRefresh caller must start its own request instead of piggybacking on an in-flight one.
  // Non-force callers can freely piggyback on any in-flight request regardless of force status.
  if (!forceRefresh && !options.swr) {
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
  const request = fetchCachedInternal(env, dataKey, fn, ttl, forceRefresh, options).finally(() => {
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

export function isUniqueConstraintError(err: Error): { table: string; column: string } | null {
  const match = err.message.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
  if (match) {
    return { table: match[1], column: match[2] };
  }

  return null;
}
