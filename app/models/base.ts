
const cachePrefix = "cache::";

export async function fetchCached<T>(env: Env, dataKey: string, fn: () => Promise<T>, ttl?: number, forceRefresh = false): Promise<T> {
  const cacheKey = `${cachePrefix}${dataKey}`;
  const cached = await env.KV_USERDATA.get(cacheKey);
  if (cached && !forceRefresh) {
    return JSON.parse(cached) as T;
  }

  const data = await fn();
  await env.KV_USERDATA.put(cacheKey, JSON.stringify(data), {
    expirationTtl: ttl ?? 60,
  });
  return data;
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
