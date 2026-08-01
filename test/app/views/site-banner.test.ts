import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getPostgresActiveSiteBanner } from "~/db/postgres/site-banners";
import type { SiteBanner } from "~/domain/site-banner";
import { fetchRouteCached } from "~/lib/cache";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { getSiteBanner } from "~/views/site-banner";

jest.mock("~/db/postgres/site-banners", () => ({
  getPostgresActiveSiteBanner: jest.fn(),
}));

jest.mock("~/lib/cache", () => ({
  cacheKey: jest.fn(() => "route::site-banner::v1::active"),
  fetchRouteCached: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  captureServerError: jest.fn(),
  getLogger: jest.fn(),
}));

const mockedGetPostgresActiveSiteBanner = getPostgresActiveSiteBanner as jest.MockedFunction<
  typeof getPostgresActiveSiteBanner
>;
const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;
const mockedCaptureServerError = captureServerError as jest.MockedFunction<typeof captureServerError>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const env = {} as Env;
const ctx = {} as ExecutionContext;
const now = new Date("2026-08-01T00:30:00.000Z");

function banner(overrides: Partial<SiteBanner> = {}): SiteBanner {
  return {
    uid: "banner-1",
    message: "점검 안내",
    colorPreset: "red",
    link: "/posts/notice",
    screens: ["desktop_navigation"],
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-01T01:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("site banner view", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetLogger.mockReturnValue(logger);
    mockedFetchRouteCached.mockImplementation(async (_env, _ctx, _key, fn) => fn());
  });

  it("uses a bounded route cache for the active banner", async () => {
    const activeBanner = banner();
    mockedGetPostgresActiveSiteBanner.mockResolvedValue(activeBanner);

    await expect(getSiteBanner(env, now, ctx)).resolves.toEqual(activeBanner);

    expect(mockedFetchRouteCached).toHaveBeenCalledWith(
      env,
      ctx,
      "route::site-banner::v1::active",
      expect.any(Function),
      false,
      {
        freshTtl: 30,
        maxStaleTtl: 300,
        expirationTtl: 600,
      },
    );
    expect(mockedGetPostgresActiveSiteBanner).toHaveBeenCalledWith(env, now, { ctx });
  });

  it("does not render an expired banner returned from stale cache", async () => {
    mockedFetchRouteCached.mockResolvedValue(banner({ endsAt: "2026-08-01T00:30:00.000Z" }));

    await expect(getSiteBanner(env, now, ctx)).resolves.toBeNull();
  });

  it("fails open and reports the error when the banner cannot be loaded", async () => {
    const error = new Error("postgres unavailable");
    mockedFetchRouteCached.mockRejectedValue(error);

    await expect(getSiteBanner(env, now, ctx)).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Failed to load active site banner", error, {
      operation: "get_active",
    });
    expect(mockedCaptureServerError).toHaveBeenCalledWith(error, {
      view: "site_banner",
      operation: "get_active",
    });
  });
});
