import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fetchRouteCached } from "~/lib/cache";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { getAllCoupons } from "~/models/coupon";
import { getNavigationMenuBadges } from "~/models/navigation-menu-badges";
import { getPersonalNavigationState } from "~/models/personal-navigation";
import { getLatestPostTime } from "~/models/post";
import { getAllRaidSchedules } from "~/models/raid";
import { getTimelineContentsByContentTypes } from "~/models/timeline-content.server";
import { getNavigationBarContents } from "~/views/navigation";

jest.mock("~/lib/cache", () => ({
  cacheKey: jest.fn((...parts: unknown[]) => parts.join("::")),
  fetchRouteCached: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({
  captureServerError: jest.fn(),
  getLogger: jest.fn(),
}));
jest.mock("~/models/coupon", () => ({ getAllCoupons: jest.fn() }));
jest.mock("~/models/personal-navigation", () => ({ getPersonalNavigationState: jest.fn() }));
jest.mock("~/models/post", () => ({ getLatestPostTime: jest.fn() }));
jest.mock("~/models/raid", () => ({ getAllRaidSchedules: jest.fn() }));
jest.mock("~/models/navigation-menu-badges", () => ({ getNavigationMenuBadges: jest.fn() }));
jest.mock("~/models/timeline-content.server", () => ({ getTimelineContentsByContentTypes: jest.fn() }));

const env = {} as Env;
const ctx = {} as ExecutionContext;
const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;
const mockedGetPersonalNavigationState = getPersonalNavigationState as jest.MockedFunction<
  typeof getPersonalNavigationState
>;
const mockedGetNavigationMenuBadges = getNavigationMenuBadges as jest.MockedFunction<typeof getNavigationMenuBadges>;
const mockedGetLatestPostTime = getLatestPostTime as jest.MockedFunction<typeof getLatestPostTime>;
const mockedGetAllRaidSchedules = getAllRaidSchedules as jest.MockedFunction<typeof getAllRaidSchedules>;
const mockedGetAllCoupons = getAllCoupons as jest.MockedFunction<typeof getAllCoupons>;
const mockedGetTimelineContents = getTimelineContentsByContentTypes as jest.MockedFunction<
  typeof getTimelineContentsByContentTypes
>;
const mockedCaptureServerError = captureServerError as jest.MockedFunction<typeof captureServerError>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetLogger.mockReturnValue(logger);
  mockedFetchRouteCached.mockImplementation(async (_env, _ctx, _key, loader) => loader());
  mockedGetPersonalNavigationState.mockImplementation(async (_env, userId) =>
    userId === 1
      ? { hasUnconsumedCoupons: true, hasUnreadFeedbackReplies: false, unreadNotificationCount: 2 }
      : { hasUnconsumedCoupons: false, hasUnreadFeedbackReplies: true, unreadNotificationCount: 7 },
  );
  mockedGetNavigationMenuBadges.mockResolvedValue([]);
  mockedGetLatestPostTime.mockResolvedValue(null);
  mockedGetAllRaidSchedules.mockResolvedValue([]);
  mockedGetAllCoupons.mockResolvedValue([]);
  mockedGetTimelineContents.mockResolvedValue([]);
});

describe("navigation view composition", () => {
  it("keeps user-specific status outside the shared navigation cache", async () => {
    const [userA, userB] = await Promise.all([
      getNavigationBarContents(env, false, 1, ctx),
      getNavigationBarContents(env, false, 2, ctx),
    ]);

    expect(userA).toMatchObject({
      hasUnconsumedCoupons: true,
      hasUnreadFeedbackReplies: false,
      unreadNotificationCount: 2,
    });
    expect(userB).toMatchObject({
      hasUnconsumedCoupons: false,
      hasUnreadFeedbackReplies: true,
      unreadNotificationCount: 7,
    });
    expect(mockedGetPersonalNavigationState).toHaveBeenNthCalledWith(1, env, 1, { ctx });
    expect(mockedGetPersonalNavigationState).toHaveBeenNthCalledWith(2, env, 2, { ctx });
  });

  it("does not query or reuse personal state for a signed-out viewer", async () => {
    const guest = await getNavigationBarContents(env, false, undefined, ctx);

    expect(guest).toMatchObject({
      hasUnconsumedCoupons: false,
      hasUnreadFeedbackReplies: false,
      unreadNotificationCount: 0,
    });
    expect(mockedGetPersonalNavigationState).not.toHaveBeenCalled();
  });

  it("uses automatic menu states and reports badge lookup failures without exposing the error", async () => {
    const error = new Error("badge table unavailable");
    mockedFetchRouteCached.mockImplementation(async (_env, _ctx, key, loader) => {
      if (key === "route::navigation-menu-badges::1::all") throw error;
      return loader();
    });

    const contents = await getNavigationBarContents(env, false, 1, ctx);

    expect(contents.menuBadgeOverrides).toEqual({});
    expect(contents.hasUnconsumedCoupons).toBe(true);
    expect(contents.unreadNotificationCount).toBe(2);
    expect(logger.error).toHaveBeenCalledWith("Failed to load navigation menu badges", error, {
      operation: "list",
    });
    expect(mockedCaptureServerError).toHaveBeenCalledWith(error, {
      view: "navigation_menu_badges",
      operation: "list",
    });
  });

  it("drops an over-length stored label, keeps the dot override, and logs a warning", async () => {
    mockedGetNavigationMenuBadges.mockResolvedValue([
      {
        menuId: "raids",
        labelMode: "custom",
        label: "열두글자라벨테스트문자예!",
        redDotMode: "show",
        startsAt: null,
        endsAt: null,
      },
    ]);

    const contents = await getNavigationBarContents(env, false, 1, ctx);

    expect(contents.menuBadgeOverrides.raids).toMatchObject({
      labelMode: "auto",
      label: null,
      redDotMode: "show",
    });
    expect(logger.warn).toHaveBeenCalledWith("Ignored invalid navigation menu badge data", {
      operation: "resolve",
      menuId: "raids",
      reason: "invalid-label",
    });
  });

  it("logs invalid badge fields and uses automatic values without applying unsafe settings", async () => {
    mockedGetNavigationMenuBadges.mockResolvedValue([
      {
        menuId: "raids",
        labelMode: "hidden",
        label: "stale label",
        redDotMode: "show",
        startsAt: null,
        endsAt: null,
      },
      {
        menuId: "students",
        labelMode: "custom",
        label: "정상 라벨",
        redDotMode: "future-mode" as "auto",
        startsAt: "2026-10-01T00:00:00.000Z",
        endsAt: null,
      },
    ]);
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-09-27T00:00:00.000Z"));
      const contents = await getNavigationBarContents(env, false, 1, ctx);

      expect(contents.menuBadgeOverrides.raids).toMatchObject({
        labelMode: "auto",
        label: null,
        redDotMode: "show",
      });
      expect(contents.menuBadgeOverrides.students).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith("Ignored invalid navigation menu badge data", {
        operation: "resolve",
        menuId: "raids",
        reason: "invalid-label",
      });
      expect(logger.warn).toHaveBeenCalledWith("Ignored invalid navigation menu badge data", {
        operation: "resolve",
        menuId: "students",
        reason: "invalid-mode",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("reevaluates a cached badge against the current time after its end", async () => {
    const cachedBadge = {
      menuId: "raids",
      labelMode: "custom" as const,
      label: "새 시즌",
      redDotMode: "show" as const,
      startsAt: null,
      endsAt: "2026-09-28T00:00:00.000Z",
    };
    mockedFetchRouteCached.mockImplementation(async (_env, _ctx, key, loader) => {
      if (key === "route::navigation-menu-badges::1::all") {
        return [cachedBadge] as Awaited<ReturnType<typeof loader>>;
      }
      return loader();
    });
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-09-27T23:59:59.999Z"));
      const beforeEnd = await getNavigationBarContents(env, false, 1, ctx);
      jest.setSystemTime(new Date("2026-09-28T00:00:00.000Z"));
      const afterEnd = await getNavigationBarContents(env, false, 1, ctx);

      expect(beforeEnd.menuBadgeOverrides.raids).toMatchObject({ labelMode: "custom", label: "새 시즌" });
      expect(afterEnd.menuBadgeOverrides).toEqual({});
    } finally {
      jest.useRealTimers();
    }
  });
});
