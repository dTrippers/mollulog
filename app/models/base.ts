
const cachePrefix = "cache::";

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
 * Uses the `env.KV_USERDATA` object reference as the key. This relies on the
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

async function fetchCachedInternal<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  ttl?: number | ((data: T) => number),
  forceRefresh = false,
): Promise<T> {
  const cacheKey = `${cachePrefix}${dataKey}`;
  const raw = await env.KV_USERDATA.get(cacheKey);

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
    const data = await fn();
    const envelope: CacheEnvelope<T> = {
      _ver: 2,
      data,
      cachedAt: Date.now(),
    };

    await env.KV_USERDATA.put(cacheKey, serializeCacheValue(envelope), { expirationTtl: DEFAULT_KV_EXPIRATION_TTL });
    return data;
  } catch (error) {
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
  let namespaceInflightRequests = inflightCacheRequests.get(env.KV_USERDATA);
  if (!namespaceInflightRequests) {
    namespaceInflightRequests = new Map<string, Promise<unknown>>();
    inflightCacheRequests.set(env.KV_USERDATA, namespaceInflightRequests);
  }

  // A forceRefresh caller must start its own request instead of piggybacking on an in-flight one.
  // Non-force callers can freely piggyback on any in-flight request regardless of force status.
  if (!forceRefresh) {
    const inflight = namespaceInflightRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
  }

  const request = fetchCachedInternal(env, dataKey, fn, ttl, forceRefresh).finally(() => {
    if (namespaceInflightRequests.get(cacheKey) === request) {
      namespaceInflightRequests.delete(cacheKey);
    }
  });
  namespaceInflightRequests.set(cacheKey, request);
  return request;
}

export async function deleteCache(env: Env, ...dataKeys: string[]) {
  await Promise.all(dataKeys.map((key) => {
    const cacheKey = `${cachePrefix}${key}`;
    return env.KV_USERDATA.delete(cacheKey);
  }));
}

export async function flushCacheAll(env: Env) {
  let cursor: string | undefined;
  do {
    const caches = await env.KV_USERDATA.list({ prefix: cachePrefix, cursor });
    await Promise.all(caches.keys.map((key) => env.KV_USERDATA.delete(key.name)));
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
