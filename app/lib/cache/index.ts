import { mapWithConcurrencyLimit } from "~/lib/concurrency";
import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { isTimeoutError, withTimeout } from "~/lib/with-timeout";

/**
 * Cache ownership tiers:
 * - source: cron/manual-warmed upstream reference data
 * - route: route-loader views that can refresh with stale-while-revalidate
 * - cache: short-term generic/runtime caches
 */
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
// Cron can request hundreds of source keys at once. Keep enough parallelism for
// throughput without fanning every KV operation out in the same event-loop turn.
const LAZY_SOURCE_KV_CONCURRENCY = 32;

type KvCircuitState = {
  disabledUntil: number;
  reason: string;
  skippedOperations: number;
};

const kvCircuitStates = new WeakMap<object, KvCircuitState>();

/**
 * Deadline for regenerating a cached value.
 *
 * This is intentionally longer than KV, but still well below CloudFront's
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
/**
 * Freshness window for BAQL-sourced snapshots that the scheduled cron job keeps
 * warm (student roster, main stories, farming stages, item catalog, recruitment
 * groups, raid schedules, event contents). This upstream data changes at most a
 * few times a day, so an hourly refresh cadence is enough — cron passes
 * `forceRefresh: false` and relies on this TTL instead of forcing a refetch on
 * every 10-minute tick.
 */
export const SOURCE_CRON_REFRESH_TTL = 60 * 60;
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

type LazySourceBatchEntry<K extends string> = {
  key: K;
  dataKey: string;
};

type FetchCachedOptions<T> = {
  ctx?: ExecutionContext;
  expirationTtl?: number;
  maxStaleTtl?: number | ((data: T) => number);
  mode?: CacheCategory;
  swr?: boolean;
  warnOnRequestRefresh?: boolean;
};

type CacheDecision = "fresh_hit" | "stale_swr" | "miss_regenerate";

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

async function readKvCacheValue<T>(env: Env, dataKey: string): Promise<ParsedCacheValue<T> | null> {
  if (shouldSkipKv(env)) {
    return null;
  }

  try {
    const raw = await watchIo("kv.get", withTimeout(env.KV_CACHE.get(dataKey), KV_TIMEOUT_MS, "kv.get"), {
      dataKey,
    });
    return raw ? toParsedCacheValue<T>(raw) : null;
  } catch (error) {
    warnIoFailure("kv.get", dataKey, error, KV_TIMEOUT_MS);
    if (isTimeoutError(error)) {
      tripKvCircuit(env, "kv.get");
    }
    return null;
  }
}

async function writeKvCacheValue<T>(env: Env, dataKey: string, data: T, cachedAt: number, expirationTtl: number) {
  const envelope: CacheEnvelope<T> = {
    _ver: 2,
    data,
    cachedAt,
  };

  if (shouldSkipKv(env)) {
    return;
  }

  try {
    await watchIo(
      "kv.put",
      withTimeout(env.KV_CACHE.put(dataKey, serializeCacheValue(envelope), { expirationTtl }), KV_TIMEOUT_MS, "kv.put"),
      { dataKey },
    );
  } catch (error) {
    warnIoFailure("kv.put", dataKey, error, KV_TIMEOUT_MS);
    if (isTimeoutError(error)) {
      tripKvCircuit(env, "kv.put");
    }
  }
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

/**
 * The circuit logs on its two edges — opening and closing — rather than on every
 * skipped operation. A tripped circuit skips KV for the whole cooldown, so a
 * per-operation log emits hundreds of identical events that say nothing the
 * opening event did not already say. `skippedOperations` on the closing event
 * carries the blast radius instead.
 */
function getKvCooldownRemainingMs(env: Env) {
  const state = kvCircuitStates.get(env.KV_CACHE);
  if (!state) {
    return 0;
  }

  const remainingMs = state.disabledUntil - Date.now();
  if (remainingMs <= 0) {
    kvCircuitStates.delete(env.KV_CACHE);
    console.warn(
      "[cache] kv.circuit_closed",
      getIoWatchdogContext({
        label: "kv.circuit",
        reason: state.reason,
        skippedOperations: state.skippedOperations,
      }),
    );
    return 0;
  }

  return remainingMs;
}

function tripKvCircuit(env: Env, reason: string) {
  const disabledUntil = Date.now() + KV_COOLDOWN_AFTER_TIMEOUT_MS;
  const openState = getKvCooldownRemainingMs(env) > 0 ? kvCircuitStates.get(env.KV_CACHE) : undefined;

  // Re-tripping while open extends the cooldown but keeps the skip count, so the
  // closing event still reports the blast radius of the whole open period.
  if (openState) {
    openState.disabledUntil = disabledUntil;
    openState.reason = reason;
    return;
  }

  kvCircuitStates.set(env.KV_CACHE, { disabledUntil, reason, skippedOperations: 0 });
  console.error(
    "[cache] kv.circuit_open",
    getIoWatchdogContext({
      label: "kv.circuit",
      reason,
      cooldownMs: KV_COOLDOWN_AFTER_TIMEOUT_MS,
    }),
  );
}

function shouldSkipKv(env: Env) {
  const remainingMs = getKvCooldownRemainingMs(env);
  if (remainingMs <= 0) {
    return false;
  }

  const state = kvCircuitStates.get(env.KV_CACHE);
  if (state) {
    state.skippedOperations += 1;
  }
  return true;
}

function enterCacheDecisionSpan<T>(
  ctx: ExecutionContext | undefined,
  dataKey: string,
  decision: CacheDecision,
  fn: () => T,
): T {
  if (!ctx?.tracing) {
    return fn();
  }

  return ctx.tracing.enterSpan("cache.decision", (span) => {
    span.setAttribute("cache.key", dataKey);
    span.setAttribute("cache.result", decision);
    return fn();
  });
}

/**
 * A regeneration that starts and never settles surfaces as an `evicted` log once
 * it outlives `INFLIGHT_MAX_MS`, so the lifecycle needs no `start` log to detect
 * a hang. Only slow settles and evictions are worth an event.
 */
function logInflightLifecycle(phase: "settled" | "evicted", entry: InflightCacheRequest) {
  const elapsedMs = Date.now() - entry.startedAt;
  if (phase === "settled" && elapsedMs < RUNTIME_TIMEOUTS.watchdogWarnMs.default) {
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

function getNamespaceInflightRequests(env: Env): Map<string, InflightCacheRequest> {
  let namespaceInflightRequests = inflightCacheRequests.get(env.KV_CACHE);
  if (!namespaceInflightRequests) {
    namespaceInflightRequests = new Map<string, InflightCacheRequest>();
    inflightCacheRequests.set(env.KV_CACHE, namespaceInflightRequests);
  }
  return namespaceInflightRequests;
}

/**
 * Coalesces concurrent regenerations for one cache key onto a single in-flight
 * request inside this isolate, so a cold miss or a maxStale-exceeded burst calls
 * `produce()` once instead of once per request.
 *
 * Safety invariant: a registered entry's promise resolves to the regenerated
 * value (or rejects) — never to `undefined` — so any caller can piggyback on it.
 * Every wait is bounded, which is what keeps a stuck regeneration from poisoning
 * later same-key requests in a long-lived isolate:
 * - a piggybacking caller gives up after INFLIGHT_WAIT_TIMEOUT_MS and starts its
 *   own regeneration instead of waiting forever on a shared promise;
 * - an entry older than INFLIGHT_MAX_MS is evicted before any new piggyback;
 * - the registrant force-drops its own entry after INFLIGHT_MAX_MS even if
 *   `produce()` never settles.
 *
 * A non-timeout rejection from the shared regeneration is propagated to
 * piggybackers (rather than each retrying) so a true upstream failure does not
 * turn into a retry storm; callers with stale data fall back to it upstream.
 */
async function runWithInflightDedup<T>(
  inflightMap: Map<string, InflightCacheRequest>,
  cacheKey: string,
  forceRefresh: boolean,
  produce: () => Promise<T>,
): Promise<T> {
  // A forceRefresh caller must start its own request instead of piggybacking on
  // an in-flight one. Non-force callers can piggyback regardless of force status.
  if (!forceRefresh) {
    const inflightEntry = inflightMap.get(cacheKey);
    if (inflightEntry) {
      const inflightAgeMs = Date.now() - inflightEntry.startedAt;
      if (inflightAgeMs > INFLIGHT_MAX_MS) {
        if (inflightMap.get(cacheKey) === inflightEntry) {
          inflightMap.delete(cacheKey);
          logInflightLifecycle("evicted", inflightEntry);
        }
      } else {
        try {
          return await watchIo(
            "cache.inflight",
            withTimeout(inflightEntry.promise as Promise<T>, INFLIGHT_WAIT_TIMEOUT_MS, "cache.inflight"),
            {
              dataKey: cacheKey,
              inflightAgeMs,
              inflightForceRefresh: inflightEntry.forceRefresh,
            },
          );
        } catch (error) {
          if (!isTimeoutError(error)) {
            throw error;
          }

          warnIoFailure("cache.inflight", cacheKey, error, INFLIGHT_WAIT_TIMEOUT_MS);
          if (inflightMap.get(cacheKey) === inflightEntry) {
            inflightMap.delete(cacheKey);
          }
        }
      }
    }
  }

  const inflightState: {
    entry?: InflightCacheRequest;
    evictTimer?: ReturnType<typeof setTimeout>;
  } = {};
  const request = produce().finally(() => {
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
    dataKey: cacheKey,
    startedAt: Date.now(),
    forceRefresh,
  };
  inflightState.entry = entry;
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

async function fetchCachedInternal<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  ttl?: number | ((data: T) => number),
  forceRefresh = false,
  options: FetchCachedOptions<T> = {},
  coalesceRefresh?: (produce: () => Promise<T>) => Promise<T>,
): Promise<T> {
  const cacheKey = dataKey;
  const expirationTtl = options.expirationTtl ?? DEFAULT_KV_EXPIRATION_TTL;
  const cached = await readKvCacheValue<T>(env, dataKey);

  if (cached && !forceRefresh && isFresh(cached.cachedAt, ttl, cached.data)) {
    return enterCacheDecisionSpan(options.ctx, cacheKey, "fresh_hit", () => cached.data);
  }

  if (
    cached &&
    !forceRefresh &&
    options.swr &&
    options.maxStaleTtl !== undefined &&
    isFresh(cached.cachedAt, options.maxStaleTtl, cached.data)
  ) {
    return enterCacheDecisionSpan(options.ctx, cacheKey, "stale_swr", () => {
      scheduleBackgroundRefresh(env, cacheKey, fn, expirationTtl, options);
      return cached.data;
    });
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

  return enterCacheDecisionSpan(options.ctx, cacheKey, "miss_regenerate", async () => {
    try {
      // Cold miss / maxStale-exceeded regeneration. `coalesceRefresh` (SWR routes)
      // shares one regeneration across concurrent callers; non-SWR callers are
      // already coalesced one level up in `fetchCached`.
      const runRefresh = () => refreshCacheValue(env, cacheKey, fn, expirationTtl);
      const data = coalesceRefresh ? await coalesceRefresh(runRefresh) : await runRefresh();
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
  });
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

  await writeKvCacheValue(env, cacheKey, envelope.data, envelope.cachedAt, expirationTtl);
  return data;
}

function scheduleBackgroundRefresh<T>(
  env: Env,
  cacheKey: string,
  fn: () => Promise<T>,
  expirationTtl: number,
  options: FetchCachedOptions<T>,
) {
  const inflightMap = getNamespaceInflightRequests(env);

  if (inflightMap.has(cacheKey)) {
    return;
  }

  // The entry stores the raw, value-bearing regeneration so a concurrent cold
  // miss / maxStale-exceeded caller that piggybacks on this background refresh
  // receives the regenerated value (or a rejection) — never the `undefined` that
  // the error-swallowing `guarded` chain resolves to. `guarded` attaches a
  // rejection handler, so storing the raw promise does not leak an unhandled
  // rejection even when nobody piggybacks.
  const request = refreshCacheValue(env, cacheKey, fn, expirationTtl);
  const guarded = request
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
  inflightMap.set(cacheKey, entry);
  if (options.ctx) {
    options.ctx.waitUntil(guarded);
    return;
  }

  void guarded;
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

export async function fetchLazySourceCached<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  freshTtl: number | ((data: T) => number),
  forceRefresh = false,
): Promise<T> {
  return fetchCached(env, dataKey, fn, freshTtl, forceRefresh, {
    expirationTtl: SOURCE_CACHE_EXPIRATION_TTL,
    maxStaleTtl: SOURCE_CACHE_MAX_STALE_TTL,
    mode: "source",
    warnOnRequestRefresh: false,
  });
}

/**
 * Returns whether a warm window marker written within `freshTtl` already exists,
 * i.e. the periodic warm can be skipped this run.
 *
 * Split from the marker write (see `markKvCacheWindow`) on purpose: the marker is
 * recorded only *after* a successful warm, so a failed/partial warm leaves no
 * fresh marker and the next scheduled run retries instead of skipping for the
 * whole window.
 */
export async function isKvCacheWindowFresh(env: Env, dataKey: string, freshTtl: number): Promise<boolean> {
  if (isCacheDisabled(env)) {
    return false;
  }

  const marker = await readKvCacheValue<true>(env, dataKey);
  return Boolean(marker && isFresh(marker.cachedAt, freshTtl, marker.data));
}

/** Records the warm window marker. Call only after the warm work has succeeded. */
export async function markKvCacheWindow(env: Env, dataKey: string): Promise<void> {
  if (isCacheDisabled(env)) {
    return;
  }

  await writeKvCacheValue(env, dataKey, true, Date.now(), SOURCE_CACHE_EXPIRATION_TTL);
}

function resolveBatchValue<K, T>(key: K, freshValues: Map<K, T>, staleValues: Map<K, T>): T {
  if (freshValues.has(key)) {
    return freshValues.get(key) as T;
  }

  if (staleValues.has(key)) {
    return staleValues.get(key) as T;
  }

  throw new Error(`Lazy source value missing for key: ${String(key)}`);
}

export async function fetchLazySourceCachedBatch<K extends string, T>(
  env: Env,
  entries: readonly LazySourceBatchEntry<K>[],
  loadMissing: (missingKeys: K[]) => Promise<Map<K, T>>,
  freshTtl: number | ((data: T) => number),
  forceRefresh = false,
): Promise<Map<K, T>> {
  const uniqueEntries = [...new Map(entries.map((entry) => [entry.key, entry])).values()];
  if (uniqueEntries.length === 0) {
    return new Map();
  }

  if (isCacheDisabled(env)) {
    return loadMissing(uniqueEntries.map((entry) => entry.key));
  }

  const freshValues = new Map<K, T>();
  const staleValues = new Map<K, T>();
  const missingEntries: Array<LazySourceBatchEntry<K>> = [];

  const cachedValues = await mapWithConcurrencyLimit(uniqueEntries, LAZY_SOURCE_KV_CONCURRENCY, async (entry) => ({
    entry,
    cached: await readKvCacheValue<T>(env, entry.dataKey),
  }));

  for (const { entry, cached } of cachedValues) {
    if (!cached) {
      missingEntries.push(entry);
      continue;
    }

    staleValues.set(entry.key, cached.data);
    if (!forceRefresh && isFresh(cached.cachedAt, freshTtl, cached.data)) {
      freshValues.set(entry.key, cached.data);
      continue;
    }

    missingEntries.push(entry);
  }

  if (missingEntries.length === 0) {
    return new Map(uniqueEntries.map((entry) => [entry.key, freshValues.get(entry.key) as T]));
  }

  const missingKeys = missingEntries.map((entry) => entry.key);
  let loadedValues: Map<K, T>;
  try {
    loadedValues = await watchIo("cache.fn", withTimeout(loadMissing(missingKeys), CACHE_FN_TIMEOUT_MS, "cache.fn"), {
      dataKey: missingEntries.map((entry) => entry.dataKey).join(","),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      warnIoFailure("cache.fn", missingKeys.join(","), error, CACHE_FN_TIMEOUT_MS);
    }

    const missingWithoutStale = missingKeys.filter((key) => !staleValues.has(key));
    if (missingWithoutStale.length > 0) {
      throw error;
    }

    return new Map(uniqueEntries.map((entry) => [entry.key, resolveBatchValue(entry.key, freshValues, staleValues)]));
  }

  const cachedAt = Date.now();
  const missingWithoutValue = missingEntries.filter(
    (entry) => !loadedValues.has(entry.key) && !staleValues.has(entry.key),
  );
  if (missingWithoutValue.length > 0) {
    throw new Error(
      `Lazy source loader did not return values for keys: ${missingWithoutValue.map((entry) => entry.key).join(", ")}`,
    );
  }

  await mapWithConcurrencyLimit(
    missingEntries.filter((entry) => loadedValues.has(entry.key)),
    LAZY_SOURCE_KV_CONCURRENCY,
    async (entry) => {
      const data = loadedValues.get(entry.key) as T;
      freshValues.set(entry.key, data);
      await writeKvCacheValue(env, entry.dataKey, data, cachedAt, SOURCE_CACHE_EXPIRATION_TTL);
    },
  );

  return new Map(uniqueEntries.map((entry) => [entry.key, resolveBatchValue(entry.key, freshValues, staleValues)]));
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
  const inflightMap = getNamespaceInflightRequests(env);

  // SWR returns usable stale data immediately and must not block on the shared
  // regeneration when it has stale to serve. So the dedup is pushed *inside*
  // `fetchCachedInternal`: it only coalesces the cold-miss / maxStale-exceeded
  // synchronous regeneration, after the stale-first decision has been made.
  if (options.swr) {
    return fetchCachedInternal(env, dataKey, fn, ttl, forceRefresh, options, (produce) =>
      runWithInflightDedup(inflightMap, cacheKey, forceRefresh, produce),
    );
  }

  // Non-SWR callers have no stale-first path, so the whole fetch (KV read +
  // regeneration) is coalesced as one in-flight request.
  return runWithInflightDedup(inflightMap, cacheKey, forceRefresh, () =>
    fetchCachedInternal(env, dataKey, fn, ttl, forceRefresh, options),
  );
}
