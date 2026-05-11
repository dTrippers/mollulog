import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { DEFAULT_KV_EXPIRATION_TTL, fetchCached, flushCacheAll } from "../../../app/models/base";

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
      KV_USERDATA: kv,
      DISABLE_CACHE: disableCache,
    } as unknown as CacheEnv,
    kv,
  };
}

afterEach(() => {
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
    const { env, kv } = createEnv(JSON.stringify({
      _ver: 2,
      data: cachedData,
      cachedAt: now - 1_000,
    }));
    const fn = jest.fn(async () => ["new-video"]);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(cachedData);

    expect(fn).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("refreshes stale cache and writes a new envelope when fn succeeds", async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { env, kv } = createEnv(JSON.stringify({
      _ver: 2,
      data: ["stale-video"],
      cachedAt: now - 1_900_000,
    }));
    const newData = ["fresh-video"];
    const fn = jest.fn(async () => newData);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(newData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "cache::youtube",
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
    const { env, kv } = createEnv(JSON.stringify({
      _ver: 2,
      data,
      cachedAt: now - 1_900_000,
    }));
    const fn = jest.fn(async () => data);

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(data);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(
      "cache::youtube",
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
      "cache::youtube",
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
    const { env, kv } = createEnv(JSON.stringify({
      _ver: 2,
      data: staleData,
      cachedAt: now - 1_900_000,
    }));
    const fn = jest.fn(async () => {
      throw new Error("refresh failed");
    });

    await expect(fetchCached(env, "youtube", fn, 60 * 30)).resolves.toEqual(staleData);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.put).not.toHaveBeenCalled();
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
      "cache::youtube",
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
    await Promise.resolve();

    expect(kv.get).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);

    resolveRefresh(["fresh-video"]);

    await expect(Promise.all([first, second])).resolves.toEqual([["fresh-video"], ["fresh-video"]]);
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

describe("flushCacheAll", () => {
  it("deletes all cache keys across paginated KV lists", async () => {
    const { env, kv } = createEnv(null);
    const list = kv.list as jest.MockedFunction<
      (_opts?: { prefix?: string; cursor?: string }) => Promise<{
        keys: { name: string }[];
        cursor?: string;
        list_complete: boolean;
      }>
    >;
    list
      .mockResolvedValueOnce({
        keys: [{ name: "cache::a" }],
        cursor: "next-page",
        list_complete: false,
      })
      .mockResolvedValueOnce({
        keys: [{ name: "cache::b" }],
        list_complete: true,
      });

    await flushCacheAll(env);

    expect(kv.list).toHaveBeenCalledWith({ prefix: "cache::", cursor: undefined });
    expect(kv.list).toHaveBeenCalledWith({ prefix: "cache::", cursor: "next-page" });
    expect(kv.delete).toHaveBeenCalledWith("cache::a");
    expect(kv.delete).toHaveBeenCalledWith("cache::b");
  });
});
