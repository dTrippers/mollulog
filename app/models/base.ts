
const cachePrefix = "cache::";

type CacheEnvelope<T> = {
  _ver: 2;
  data: T;
  cachedAt: number;
};

function isCacheEnvelope<T>(value: CacheEnvelope<T> | T): value is CacheEnvelope<T> {
  return typeof value === "object" && value !== null && "_ver" in value && value._ver === 2;
}

function resolveTtl<T>(ttl: number | ((data: T) => number), data: T): number {
  return typeof ttl === "function" ? ttl(data) : ttl;
}

export async function fetchCached<T>(
  env: Env,
  dataKey: string,
  fn: () => Promise<T>,
  ttl?: number | ((data: T) => number),
  forceRefresh = false,
): Promise<T> {
  if (env.DISABLE_CACHE === "true") {
    return fn();
  }

  const cacheKey = `${cachePrefix}${dataKey}`;
  const raw = await env.KV_USERDATA.get(cacheKey);

  let cachedData: T | undefined;
  let cachedAt = 0;
  if (raw) {
    const parsed = JSON.parse(raw, (_, value) => {
      if (value !== null && typeof value === "object" && "$date" in value && typeof value.$date === "string") {
        return new Date(value.$date);
      }
      return value;
    }) as CacheEnvelope<T> | T;
    if (isCacheEnvelope(parsed)) {
      cachedData = parsed.data;
      cachedAt = parsed.cachedAt;
    } else {
      cachedData = parsed;
    }
  }

  if (cachedData !== undefined && !forceRefresh && (ttl !== undefined ? Date.now() - cachedAt < resolveTtl(ttl, cachedData) * 1000 : true)) {
    return cachedData;
  }

  try {
    const data = await fn();
    const envelope: CacheEnvelope<T> = {
      _ver: 2,
      data,
      cachedAt: Date.now(),
    };

    await env.KV_USERDATA.put(cacheKey, JSON.stringify(envelope, (_, value) =>
      value instanceof Date ? { $date: value.toISOString() } : value
    ));
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
