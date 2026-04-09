import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fetchCached } from "../../../app/models/base";

type CacheEnv = Parameters<typeof fetchCached>[0];

function createEnv(raw: string | null, disableCache?: string) {
  const kv = {
    get: jest.fn(async (_key: string) => raw),
    put: jest.fn(async (_key: string, _value: string) => undefined),
    delete: jest.fn(async (_key: string) => undefined),
    list: jest.fn(async (_opts?: { prefix?: string }) => ({ keys: [] })),
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
});
