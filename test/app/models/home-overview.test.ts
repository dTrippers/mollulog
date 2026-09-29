import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { fetchLazySourceCached, ROUTE_CACHE_FRESH_TTL } from "~/lib/cache";
import { getHomeCampaigns, getHomeJointFiringDrills } from "~/models/home-overview";

jest.mock("~/lib/cache", () => ({
  cacheKey: (category: string, domain: string, version: number, query: string) =>
    `${category}::${domain}::v${version}::${query}`,
  ROUTE_CACHE_FRESH_TTL: 10 * 60,
  fetchLazySourceCached: jest.fn((_env: unknown, _key: string, loader: () => Promise<unknown>) => loader()),
}));

jest.mock("~/lib/baql", () => ({ runQuery: jest.fn() }));

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;
const mockedFetchLazySourceCached = fetchLazySourceCached as jest.MockedFunction<typeof fetchLazySourceCached>;
const env = {} as Env;

afterEach(() => {
  jest.clearAllMocks();
});

describe("home BAQL source models", () => {
  it("loads GL campaigns and normalizes their schedule timestamps", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        campaigns: [
          {
            uid: "campaign-1",
            category: ["schedule", "scrimmage"],
            multiplier: 2,
            startAt: "2026-09-25T00:00:00+00:00",
            endAt: "2026-09-29T00:00:00+00:00",
          },
        ],
      },
      error: undefined,
    } as never);

    await expect(getHomeCampaigns(env)).resolves.toEqual([
      {
        uid: "campaign-1",
        category: ["schedule", "scrimmage"],
        multiplier: 2,
        startAt: "2026-09-25T00:00:00.000Z",
        endAt: "2026-09-29T00:00:00.000Z",
      },
    ]);
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.anything(), {
      region: "gl",
      endAfter: expect.any(Date),
    });
    expect(mockedFetchLazySourceCached).toHaveBeenCalledWith(
      env,
      "source::home-campaigns::v2::region=gl",
      expect.any(Function),
      ROUTE_CACHE_FRESH_TTL,
      false,
    );
  });

  it("loads only the GL schedule fields needed for joint firing drill status", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        jointFiringDrills: [
          {
            uid: "52",
            season: 52,
            drillType: "shooting",
            schedules: [
              { region: "gl", startAt: "2026-09-29T00:00:00Z", endAt: "2026-10-06T00:00:00Z" },
              { region: "jp", startAt: "2026-08-01T00:00:00Z", endAt: "2026-08-08T00:00:00Z" },
            ],
          },
        ],
      },
      error: undefined,
    } as never);

    await expect(getHomeJointFiringDrills(env)).resolves.toEqual([
      {
        season: 52,
        drillType: "shooting",
        schedules: [
          { region: "gl", startAt: "2026-09-29T00:00:00.000Z", endAt: "2026-10-06T00:00:00.000Z" },
          { region: "jp", startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-08T00:00:00.000Z" },
        ],
      },
    ]);
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.anything(), {
      endAfter: expect.any(Date),
      startBefore: null,
    });
    expect(mockedFetchLazySourceCached).toHaveBeenCalledWith(
      env,
      "source::home-joint-firing-drills::v2::region=gl",
      expect.any(Function),
      ROUTE_CACHE_FRESH_TTL,
      false,
    );
  });

  it("throws on a BAQL error instead of returning an empty successful source", async () => {
    const error = new Error("BAQL unavailable");
    mockedRunQuery.mockResolvedValue({ data: undefined, error } as never);

    await expect(getHomeCampaigns(env)).rejects.toBe(error);
    expect(mockedFetchLazySourceCached).toHaveBeenCalledTimes(1);
  });
});
