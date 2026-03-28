
const cachePrefix = "cache::";

type CacheEnvelope<T> = {
  _ver: 2;
  data: T;
  cachedAt: number;
};

function isCacheEnvelope<T>(value: CacheEnvelope<T> | T): value is CacheEnvelope<T> {
  return typeof value === "object" && value !== null && "_ver" in value && value._ver === 2;
}

export async function fetchCached<T>(env: Env, dataKey: string, fn: () => Promise<T>, ttl?: number, forceRefresh = false): Promise<T> {
  // biome-ignore lint/complexity/noExtraBooleanCast: keep the explicit env-flag check requested in review.
  if (Boolean(env.DISABLE_CACHE)) {
    return fn();
  }

  const cacheKey = `${cachePrefix}${dataKey}`;
  const raw = await env.KV_USERDATA.get(cacheKey);

  let cachedData: T | undefined;
  let cachedAt = 0;
  if (raw) {
    const parsed = JSON.parse(raw) as CacheEnvelope<T> | T;
    if (isCacheEnvelope(parsed)) {
      cachedData = parsed.data;
      cachedAt = parsed.cachedAt;
    } else {
      cachedData = parsed;
    }
  }

  if (cachedData !== undefined && !forceRefresh && (ttl ? Date.now() - cachedAt < ttl * 1000 : true)) {
    return cachedData;
  }

  try {
    const data = await fn();
    const envelope: CacheEnvelope<T> = {
      _ver: 2,
      data,
      cachedAt: Date.now(),
    };

    await env.KV_USERDATA.put(cacheKey, JSON.stringify(envelope));
    return data;
  } catch (error) {
    if (cachedData !== undefined) {
      return cachedData;
    }

    throw error;
  }
}

export async function deleteCache(env: Env, ...dataKeys: string[]) {
  await Promise.all(dataKeys.map((key) => {
    const cacheKey = `${cachePrefix}${key}`;
    return env.KV_USERDATA.delete(cacheKey);
  }));
}

export async function flushCacheAll(env: Env) {
  const caches = await env.KV_USERDATA.list({ prefix: cachePrefix });
  await Promise.all(caches.keys.map((key) => env.KV_USERDATA.delete(key.name)));
}

export function isUniqueConstraintError(err: Error): { table: string, column: string } | null {
  const match = err.message.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
  if (match) {
    return { table: match[1], column: match[2] };
  }

  return null;
}
