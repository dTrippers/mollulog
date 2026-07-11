import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  DEFAULT_KV_EXPIRATION_TTL,
  fetchCached,
  fetchLazySourceCachedBatch,
  fetchRouteCached,
  SOURCE_CACHE_EXPIRATION_TTL,
} from "../../../app/lib/cache";

type CacheEnv = Parameters<typeof fetchCached>[0];

function createEnv(raw: string | null, disableCache?: string) {
  const kv = {
    get: jest.fn(async (_key: string) => raw),
    put: jest.fn(async (_key: string, _value: string, _opts?: { expirationTtl?: number }) => undefined),
    delete: jest.fn(async (_key: string) => undefined),
    list: jest.fn(async (_opts?: { prefix?: string; cursor?: string }) => ({ keys: [], list_complete: true })),
  };

  return {
    env: {
      KV_CACHE: kv,
      DISABLE_CACHE: disableCache,
    } as unknown as CacheEnv,
    kv,
  };
}

function createKeyedEnv(rawByKey: Map<string, string | null>, disableCache?: string) {
  const kv = {
    get: jest.fn(async (key: string) => rawByKey.get(key) ?? null),
    put: jest.fn(async (_key: string, _value: string, _opts?: { expirationTtl?: number }) => undefined),
    delete: jest.fn(async (_key: string) => undefined),
    list: jest.fn(async (_opts?: { prefix?: string; cursor?: string }) => ({ keys: [], list_complete: true })),
  };

  return {
    env: {
      KV_CACHE: kv,
      DISABLE_CACHE: disableCache,
    } as unknown as CacheEnv,
    kv,
  };
}

async function flushPromises() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

function createTracingContext() {
  const spans: Array<{ name: string; attributes: Record<string, unknown> }> = [];
  const waitUntil = jest.fn();
  const enterSpan = jest.fn(
    (name: string, callback: (span: { setAttribute: (key: string, value: unknown) => void }) => unknown) => {
      const attributes: Record<string, unknown> = {};
      spans.push({ name, attributes });
      return callback({
        setAttribute(key, value) {
          attributes[key] = value;
        },
      });
    },
  );

  return {
    ctx: {
      waitUntil,
      tracing: { enterSpan },
    } as unknown as ExecutionContext,
    enterSpan,
    spans,
    waitUntil,
  };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("fetchCached", () => {
  it("bypasses KV when DISABLE_CACHE is set", async () => {
    const freshData = ["fresh-video"];
    const { env, kv } = createEnv(JSON.stringify(["cached-video"]), "true");
    const fn = jest.fn(async () => freshData);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(freshData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("returns fresh cached data without calling fn", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const cachedData = ["cached-video"];
    const { env, kv } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: cachedData,
        cachedAt: now - 1_000,
      }),
    );
    const fn = jest.fn(async () => ["new-video"]);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(cachedData);

    expect(fn).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("refreshes stale cache and writes a new envelope when fn succeeds", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: ["stale-video"],
        cachedAt: now - 1_900_000,
      }),
    );
    const newData = ["fresh-video"];
    const fn = jest.fn(async () => newData);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(newData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "youtube",
      JSON.stringify({
        _ver: 2,
        data: newData,
        cachedAt: now,
      }),
      { expirationTtl: DEFAULT_KV_EXPIRATION_TTL },
    );
  });

  it("refreshes cachedAt and expiration when stale cached data is unchanged", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const data = [{ publishedAt: "2026-05-01T00:00:00.000Z" }];
    const { env, kv } = createEnv(
      JSON.stringify({
        _ver: 2,
        data,
        cachedAt: now - 1_900_000,
      }),
    );
    const fn = jest.fn(async () => data);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(data);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "youtube",
      JSON.stringify({
        _ver: 2,
        data,
        cachedAt: now,
      }),
      { expirationTtl: DEFAULT_KV_EXPIRATION_TTL },
    );
  });

  it("ignores corrupted cache JSON and replaces it with fresh data", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createEnv("{not-json");
    const data = ["fresh-video"];
    const fn = jest.fn(async () => data);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(data);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "youtube",
      JSON.stringify({
        _ver: 2,
        data,
        cachedAt: now,
      }),
      { expirationTtl: DEFAULT_KV_EXPIRATION_TTL },
    );
  });

  it("returns stale cached data when refresh fails", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const staleData = ["stale-video"];
    const { env, kv } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: staleData,
        cachedAt: now - 1_900_000,
      }),
    );
    const fn = jest.fn(async () => {
      throw new Error("refresh failed");
    });

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(staleData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("returns stale cached data when refresh times out", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const staleData = ["stale-video"];
    const { env, kv } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: staleData,
        cachedAt: now - 1_900_000,
      }),
    );
    const fn = jest.fn(
      () =>
        new Promise<string[]>(() => {
          // Never settles; fetchCached should stop awaiting it and serve stale data.
        }),
    );

    const result = fetchCached(env, "youtube", fn, 60 * 30);
    await flushPromises();
    expect(fn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toEqual(staleData);
    expect(kv.put).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[io-watchdog] timeout",
      expect.objectContaining({
        label: "cache.fn",
        dataKey: "youtube",
        timeoutMs: 5_000,
      }),
    );
  });

  it("treats a KV read timeout as a cache miss", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createEnv(null);
    kv.get.mockImplementation(
      () =>
        new Promise<string | null>(() => {
          // Never settles; fetchCached should stop awaiting it and refresh.
        }),
    );
    const freshData = ["fresh-video"];
    const fn = jest.fn(async () => freshData);

    const result = fetchCached(env, "youtube", fn, 60 * 30);
    await flushPromises();
    expect(fn).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2_000);
    await flushPromises();

    await expect(result).resolves.toEqual(freshData);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[io-watchdog] timeout",
      expect.objectContaining({
        label: "kv.get",
        dataKey: "youtube",
        timeoutMs: 2_000,
      }),
    );
    expect(console.error).toHaveBeenCalledWith(
      "[cache] kv.circuit_open",
      expect.objectContaining({
        label: "kv.circuit",
        reason: "kv.get",
      }),
    );
  });

  it("skips later KV operations during the timeout cooldown", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createEnv(null);
    kv.get.mockImplementation(
      () =>
        new Promise<string | null>(() => {
          // Never settles; this trips the KV cooldown.
        }),
    );

    const firstData = ["fresh-video"];
    const first = fetchCached(
      env,
      "youtube",
      jest.fn(async () => firstData),
      60 * 30,
    );
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).resolves.toEqual(firstData);

    kv.get.mockClear();
    kv.put.mockClear();
    const secondData = ["fresh-students"];
    const secondFn = jest.fn(async () => secondData);

    await expect(fetchCached(env, "students", secondFn, 60 * 30)).resolves.toEqual(secondData);

    expect(secondFn).toHaveBeenCalledTimes(1);
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();

    // The circuit announces itself once when it opens, not once per skipped
    // operation — this request skipped both a get and a put and added no logs.
    const circuitOpenLogs = (console.error as jest.Mock).mock.calls.filter(
      ([message]) => message === "[cache] kv.circuit_open",
    );
    expect(circuitOpenLogs).toHaveLength(1);
  });

  it("returns fresh data when a KV write times out", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createEnv(null);
    kv.put.mockImplementation(
      () =>
        new Promise<undefined>(() => {
          // Never settles; fetchCached should return fresh data anyway.
        }),
    );
    const freshData = ["fresh-video"];
    const fn = jest.fn(async () => freshData);

    const result = fetchCached(env, "youtube", fn, 60 * 30);
    await flushPromises();
    expect(fn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toEqual(freshData);
    expect(console.error).toHaveBeenCalledWith(
      "[io-watchdog] timeout",
      expect.objectContaining({
        label: "kv.put",
        dataKey: "youtube",
        timeoutMs: 2_000,
      }),
    );
  });

  it("propagates the error when there is no cache to fall back to", async () => {
    const { env, kv } = createEnv(null);
    const fn = jest.fn(async () => {
      throw new Error("refresh failed");
    });

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).rejects.toThrow("refresh failed");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("upgrades old-format cache after a successful refresh", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const oldData = ["old-video"];
    const newData = ["fresh-video"];
    const { env, kv } = createEnv(JSON.stringify(oldData));
    const fn = jest.fn(async () => newData);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(newData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "youtube",
      JSON.stringify({
        _ver: 2,
        data: newData,
        cachedAt: now,
      }),
      { expirationTtl: DEFAULT_KV_EXPIRATION_TTL },
    );
  });

  it("returns old-format cache when refresh fails", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const oldData = ["old-video"];
    const { env, kv } = createEnv(JSON.stringify(oldData));
    const fn = jest.fn(async () => {
      throw new Error("refresh failed");
    });

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(oldData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent same-key refreshes in one isolate", async () => {
    let resolveRefresh!: (value: string[]) => void;
    const { env, kv } = createEnv(null);
    const fn = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = fetchCached(env, "youtube", fn, 60 * 30);
    const second = fetchCached(env, "youtube", fn, 60 * 30);
    await flushPromises();

    expect(kv.get).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);

    resolveRefresh(["fresh-video"]);

    await expect(Promise.all([first, second])).resolves.toEqual([["fresh-video"], ["fresh-video"]]);
  });

  it("evicts stale in-flight refreshes before piggybacking", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createEnv(null);
    const firstFn = jest.fn(
      () =>
        new Promise<string[]>(() => {
          // Never settles; a later request must not keep piggybacking on it.
        }),
    );

    const first = fetchCached(env, "youtube", firstFn, 60 * 30);
    await flushPromises();

    expect(kv.get).toHaveBeenCalledTimes(1);
    expect(firstFn).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, "now").mockReturnValue(now + 10_001);
    kv.get.mockClear();
    kv.put.mockClear();

    const secondData = ["fresh-video"];
    const secondFn = jest.fn(async () => secondData);
    await expect(fetchCached(env, "youtube", secondFn, 60 * 30)).resolves.toEqual(secondData);

    expect(secondFn).toHaveBeenCalledTimes(1);
    expect(kv.get).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      "[io-watchdog] cache.inflight",
      expect.objectContaining({
        phase: "evicted",
        dataKey: "youtube",
        inflightAgeMs: 10_001,
      }),
    );

    await expect(Promise.race([first, Promise.resolve("still-pending")])).resolves.toBe("still-pending");
  });

  it("does not let a forceRefresh caller piggyback on an inflight non-force request", async () => {
    // Guard against force callers receiving stale data by piggybacking on an in-flight
    // non-force caller. Force must always issue its own BAQL request.
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const cachedRaw = JSON.stringify({
      _ver: 2,
      data: ["cached-video"],
      cachedAt: now - 1_000, // Cache is fresh (inside TTL).
    });
    const { env } = createEnv(cachedRaw);
    const fn = jest.fn(async () => ["fresh-video"]);

    const nonForce = fetchCached(env, "youtube", fn, 60 * 30);
    const forced = fetchCached(env, "youtube", fn, 60 * 30, true);

    await expect(nonForce).resolves.toEqual(["cached-video"]);
    await expect(forced).resolves.toEqual(["fresh-video"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("fetchRouteCached", () => {
  it("returns stale data immediately and schedules one background refresh", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const staleData = ["stale-route"];
    const freshData = ["fresh-route"];
    const { env, kv } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: staleData,
        cachedAt: now - 61_000,
      }),
    );
    const waitUntil = jest.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const fn = jest.fn(async () => freshData);

    await expect(
      fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 }),
    ).resolves.toEqual(staleData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await expect(waitUntil.mock.calls[0][0]).resolves.toEqual(freshData);
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "route::home::v1::all",
      JSON.stringify({
        _ver: 2,
        data: freshData,
        cachedAt: now,
      }),
      { expirationTtl: 7 * 24 * 60 * 60 },
    );
  });

  it("returns fresh route data without refreshing", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const cachedData = ["cached-route"];
    const { env, kv } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: cachedData,
        cachedAt: now - 1_000,
      }),
    );
    const waitUntil = jest.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const fn = jest.fn(async () => ["fresh-route"]);

    await expect(
      fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 }),
    ).resolves.toEqual(cachedData);

    expect(fn).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("records a fresh hit decision span when route cache is fresh", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const cachedData = ["cached-route"];
    const { env } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: cachedData,
        cachedAt: now - 1_000,
      }),
    );
    const { ctx, spans } = createTracingContext();
    const fn = jest.fn(async () => ["fresh-route"]);

    await expect(
      fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 }),
    ).resolves.toEqual(cachedData);

    expect(fn).not.toHaveBeenCalled();
    expect(spans).toEqual([
      {
        name: "cache.decision",
        attributes: {
          "cache.key": "route::home::v1::all",
          "cache.result": "fresh_hit",
        },
      },
    ]);
  });

  it("records a stale SWR decision span while preserving background refresh", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const staleData = ["stale-route"];
    const freshData = ["fresh-route"];
    const { env } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: staleData,
        cachedAt: now - 61_000,
      }),
    );
    const { ctx, spans, waitUntil } = createTracingContext();
    const fn = jest.fn(async () => freshData);

    await expect(
      fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 }),
    ).resolves.toEqual(staleData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toEqual(freshData);
    expect(spans).toEqual([
      {
        name: "cache.decision",
        attributes: {
          "cache.key": "route::home::v1::all",
          "cache.result": "stale_swr",
        },
      },
    ]);
  });

  it("records a miss decision span while preserving synchronous regeneration", async () => {
    const { env, kv } = createEnv(null);
    const { ctx, spans, waitUntil } = createTracingContext();
    const fn = jest.fn(async () => ["fresh-route"]);

    await expect(fetchRouteCached(env, ctx, "route::home::v1::all", fn)).resolves.toEqual(["fresh-route"]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(spans).toEqual([
      {
        name: "cache.decision",
        attributes: {
          "cache.key": "route::home::v1::all",
          "cache.result": "miss_regenerate",
        },
      },
    ]);
  });

  it("deduplicates concurrent background refreshes for stale route data", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: ["stale-route"],
        cachedAt: now - 61_000,
      }),
    );
    const waitUntil = jest.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    let resolveRefresh!: (value: string[]) => void;
    const fn = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, {
      freshTtl: 60,
      maxStaleTtl: 120,
    });
    const second = fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, {
      freshTtl: 60,
      maxStaleTtl: 120,
    });

    await expect(Promise.all([first, second])).resolves.toEqual([["stale-route"], ["stale-route"]]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);

    resolveRefresh(["fresh-route"]);
    await expect(waitUntil.mock.calls[0][0]).resolves.toEqual(["fresh-route"]);
  });

  it("refreshes synchronously on a cold route miss", async () => {
    const { env } = createEnv(null);
    const waitUntil = jest.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const fn = jest.fn(async () => ["fresh-route"]);

    await expect(fetchRouteCached(env, ctx, "route::home::v1::all", fn)).resolves.toEqual(["fresh-route"]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("refreshes synchronously when route data is beyond max stale", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: ["too-stale-route"],
        cachedAt: now - 121_000,
      }),
    );
    const waitUntil = jest.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const fn = jest.fn(async () => ["fresh-route"]);

    await expect(
      fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 }),
    ).resolves.toEqual(["fresh-route"]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("logs background refresh failures without throwing to the stale caller", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: ["stale-route"],
        cachedAt: now - 61_000,
      }),
    );
    const waitUntil = jest.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const fn = jest.fn(async () => {
      throw new Error("refresh failed");
    });

    await expect(
      fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 }),
    ).resolves.toEqual(["stale-route"]);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      "[cache] swr_refresh_failed",
      expect.objectContaining({
        label: "cache.swr_refresh_failed",
        cacheKey: "route::home::v1::all",
        errorMessage: "refresh failed",
      }),
    );
  });

  it("deduplicates concurrent cold route misses", async () => {
    const { env, kv } = createEnv(null);
    const ctx = { waitUntil: jest.fn() } as unknown as ExecutionContext;
    let resolveRefresh!: (value: string[]) => void;
    const fn = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 });
    const second = fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 });
    await flushPromises();

    // Both cold-miss callers share one regeneration instead of each calling fn.
    expect(fn).toHaveBeenCalledTimes(1);

    resolveRefresh(["fresh-route"]);
    await expect(Promise.all([first, second])).resolves.toEqual([["fresh-route"], ["fresh-route"]]);
    expect(kv.put).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent refreshes beyond max stale", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env } = createEnv(
      JSON.stringify({
        _ver: 2,
        data: ["too-stale-route"],
        cachedAt: now - 121_000,
      }),
    );
    const ctx = { waitUntil: jest.fn() } as unknown as ExecutionContext;
    let resolveRefresh!: (value: string[]) => void;
    const fn = jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 });
    const second = fetchRouteCached(env, ctx, "route::home::v1::all", fn, false, { freshTtl: 60, maxStaleTtl: 120 });
    await flushPromises();

    expect(fn).toHaveBeenCalledTimes(1);

    resolveRefresh(["fresh-route"]);
    await expect(Promise.all([first, second])).resolves.toEqual([["fresh-route"], ["fresh-route"]]);
  });

  it("frees a concurrent cold-miss caller instead of hanging it when the shared refresh stalls", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env } = createEnv(null);
    const ctx = { waitUntil: jest.fn() } as unknown as ExecutionContext;
    const stalledFn = jest.fn(
      () =>
        new Promise<string[]>(() => {
          // Never settles; the cache.fn timeout must cut it loose.
        }),
    );
    const recoveredFn = jest.fn(async () => ["recovered-route"]);

    const first = fetchRouteCached(env, ctx, "route::home::v1::all", stalledFn, false, {
      freshTtl: 60,
      maxStaleTtl: 120,
    });
    // Cold miss + a stalled fn eventually rejects with no stale fallback; swallow it.
    first.catch(() => undefined);
    await flushPromises();
    expect(stalledFn).toHaveBeenCalledTimes(1);

    const second = fetchRouteCached(env, ctx, "route::home::v1::all", recoveredFn, false, {
      freshTtl: 60,
      maxStaleTtl: 120,
    });
    await flushPromises();
    // The second caller piggybacked on the stalled shared refresh and has not run its own fn yet.
    expect(recoveredFn).not.toHaveBeenCalled();

    // The shared regeneration is cut by the cache.fn timeout, freeing the piggybacking
    // caller to run its own refresh rather than hanging on the dead shared promise.
    await jest.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    await expect(second).resolves.toEqual(["recovered-route"]);
    expect(recoveredFn).toHaveBeenCalledTimes(1);
  });
});

describe("fetchLazySourceCachedBatch", () => {
  const entries = [
    { key: "a", dataKey: "source::thing::v1::uid=a" },
    { key: "b", dataKey: "source::thing::v1::uid=b" },
  ];

  it("returns a full fresh hit without loading missing keys", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createKeyedEnv(
      new Map([
        ["source::thing::v1::uid=a", JSON.stringify({ _ver: 2, data: "cached-a", cachedAt: now - 1_000 })],
        ["source::thing::v1::uid=b", JSON.stringify({ _ver: 2, data: "cached-b", cachedAt: now - 1_000 })],
      ]),
    );
    const loadMissing = jest.fn(async () => new Map<string, string>());

    await expect(fetchLazySourceCachedBatch(env, entries, loadMissing, 60)).resolves.toEqual(
      new Map([
        ["a", "cached-a"],
        ["b", "cached-b"],
      ]),
    );

    expect(loadMissing).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("limits concurrent KV reads to 32 entries", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const manyEntries = Array.from({ length: 40 }, (_, index) => ({
      key: `key-${index}`,
      dataKey: `source::thing::v1::uid=key-${index}`,
    }));
    let activeReads = 0;
    let maxActiveReads = 0;
    const pendingReads: Array<() => void> = [];
    const kv = {
      get: jest.fn(
        (key: string) =>
          new Promise<string>((resolve) => {
            activeReads += 1;
            maxActiveReads = Math.max(maxActiveReads, activeReads);
            pendingReads.push(() => {
              activeReads -= 1;
              resolve(JSON.stringify({ _ver: 2, data: key, cachedAt: now }));
            });
          }),
      ),
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ keys: [], list_complete: true })),
    };
    const env = { KV_CACHE: kv } as unknown as CacheEnv;
    const loadMissing = jest.fn(async () => new Map<string, string>());

    const result = fetchLazySourceCachedBatch(env, manyEntries, loadMissing, 60);
    await flushPromises();

    expect(maxActiveReads).toBe(32);
    while (pendingReads.length > 0) {
      pendingReads.splice(0).forEach((resolve) => {
        resolve();
      });
      await flushPromises();
    }

    expect((await result).size).toBe(40);
    expect(loadMissing).not.toHaveBeenCalled();
  });

  it("loads and writes only missing batch keys", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createKeyedEnv(
      new Map([["source::thing::v1::uid=a", JSON.stringify({ _ver: 2, data: "cached-a", cachedAt: now - 1_000 })]]),
    );
    const loadMissing = jest.fn(async (missingKeys: string[]) => new Map(missingKeys.map((key) => [key, "loaded-b"])));

    await expect(fetchLazySourceCachedBatch(env, entries, loadMissing, 60)).resolves.toEqual(
      new Map([
        ["a", "cached-a"],
        ["b", "loaded-b"],
      ]),
    );

    expect(loadMissing).toHaveBeenCalledWith(["b"]);
    expect(kv.put).toHaveBeenCalledWith(
      "source::thing::v1::uid=b",
      JSON.stringify({ _ver: 2, data: "loaded-b", cachedAt: now }),
      { expirationTtl: SOURCE_CACHE_EXPIRATION_TTL },
    );
  });

  it("preserves loaded null values when another batch key is a cache hit", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env } = createKeyedEnv(
      new Map([["source::thing::v1::uid=a", JSON.stringify({ _ver: 2, data: "cached-a", cachedAt: now - 1_000 })]]),
    );
    const loadMissing = jest.fn(async (_missingKeys: string[]) => new Map<string, string | null>([["b", null]]));

    await expect(fetchLazySourceCachedBatch(env, entries, loadMissing, 60)).resolves.toEqual(
      new Map([
        ["a", "cached-a"],
        ["b", null],
      ]),
    );

    expect(loadMissing).toHaveBeenCalledWith(["b"]);
  });

  it("loads every key when all batch keys miss", async () => {
    const { env } = createKeyedEnv(new Map());
    const loadMissing = jest.fn(async (missingKeys: string[]) => new Map(missingKeys.map((key) => [key, key])));

    await expect(fetchLazySourceCachedBatch(env, entries, loadMissing, 60)).resolves.toEqual(
      new Map([
        ["a", "a"],
        ["b", "b"],
      ]),
    );

    expect(loadMissing).toHaveBeenCalledWith(["a", "b"]);
  });

  it("treats a per-key KV get timeout as a miss", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const kv = {
      get: jest.fn((key: string) =>
        key.endsWith("uid=a")
          ? new Promise<string | null>(() => undefined)
          : Promise.resolve(JSON.stringify({ _ver: 2, data: "cached-b", cachedAt: Date.now() })),
      ),
      put: jest.fn(async (_key: string, _value: string, _opts?: { expirationTtl?: number }) => undefined),
      delete: jest.fn(async (_key: string) => undefined),
      list: jest.fn(async (_opts?: { prefix?: string; cursor?: string }) => ({ keys: [], list_complete: true })),
    };
    const env = { KV_CACHE: kv } as unknown as CacheEnv;
    const loadMissing = jest.fn(async (_missingKeys: string[]) => new Map([["a", "loaded-a"]]));

    const result = fetchLazySourceCachedBatch(env, entries, loadMissing, 60);
    await flushPromises();
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toEqual(
      new Map([
        ["a", "loaded-a"],
        ["b", "cached-b"],
      ]),
    );
    expect(loadMissing).toHaveBeenCalledWith(["a"]);
    expect(console.error).toHaveBeenCalledWith(
      "[io-watchdog] timeout",
      expect.objectContaining({
        label: "kv.get",
        dataKey: "source::thing::v1::uid=a",
      }),
    );
  });

  it("falls back to stale values when loading missing keys fails", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createKeyedEnv(
      new Map([["source::thing::v1::uid=a", JSON.stringify({ _ver: 2, data: "stale-a", cachedAt: now - 120_000 })]]),
    );
    const loadMissing = jest.fn(async () => {
      throw new Error("loader failed");
    });

    await expect(fetchLazySourceCachedBatch(env, [entries[0]], loadMissing, 60)).resolves.toEqual(
      new Map([["a", "stale-a"]]),
    );

    expect(kv.put).not.toHaveBeenCalled();
  });

  it("preserves stale null values when loading missing keys fails", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createKeyedEnv(
      new Map([["source::thing::v1::uid=a", JSON.stringify({ _ver: 2, data: null, cachedAt: now - 120_000 })]]),
    );
    const loadMissing = jest.fn(async () => {
      throw new Error("loader failed");
    });

    await expect(fetchLazySourceCachedBatch(env, [entries[0]], loadMissing, 60)).resolves.toEqual(
      new Map([["a", null]]),
    );

    expect(kv.put).not.toHaveBeenCalled();
  });

  it("throws load failures when a missing key has no stale fallback", async () => {
    const { env } = createKeyedEnv(new Map());
    const loadMissing = jest.fn(async () => {
      throw new Error("loader failed");
    });

    await expect(fetchLazySourceCachedBatch(env, [entries[0]], loadMissing, 60)).rejects.toThrow("loader failed");
  });

  it("bypasses KV when DISABLE_CACHE is set", async () => {
    const { env, kv } = createKeyedEnv(new Map(), "true");
    const loadMissing = jest.fn(async (missingKeys: string[]) => new Map(missingKeys.map((key) => [key, key])));

    await expect(fetchLazySourceCachedBatch(env, entries, loadMissing, 60)).resolves.toEqual(
      new Map([
        ["a", "a"],
        ["b", "b"],
      ]),
    );

    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect(loadMissing).toHaveBeenCalledWith(["a", "b"]);
  });
});
