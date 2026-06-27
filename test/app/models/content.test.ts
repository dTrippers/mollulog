import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fetchRouteCached } from "~/lib/cache";
import { getAllCoupons, hasUnregisteredActiveCoupons } from "~/models/coupon";
import { hasUnreadAdminFeedbackReplies } from "~/models/feedback";
import { getLatestPostTime } from "~/models/post";
import { getTimelineContentsByContentTypes } from "~/models/timeline-content";

jest.mock("~/lib/cache", () => ({
  cacheKey: (category: string, domain: string, version: number, query: string) =>
    `${category}::${domain}::v${version}::${query}`,
  cacheQuery: (params: Record<string, string | number | boolean | null | undefined>) =>
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("::") || "all",
  // Bypass cache by executing fn() directly.
  fetchRouteCached: jest.fn((_env: unknown, _ctx: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
  fetchSourceCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("~/models/coupon", () => ({
  getAllCoupons: jest.fn(),
  hasUnregisteredActiveCoupons: jest.fn(),
}));

jest.mock("~/models/feedback", () => ({
  hasUnreadAdminFeedbackReplies: jest.fn(),
}));

jest.mock("~/models/post", () => ({
  getLatestPostTime: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContentsByContentTypes: jest.fn(),
  // Empty stubs for other exports imported from the same module by content.ts.
  getFutureRaidContents: jest.fn(),
  getTimelineContents: jest.fn(),
}));

// Stub to block cascading imports; getNavigationBarContents itself does not use this.
jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));
jest.mock("~/models/recruitment", () => ({
  getAllRecruitmentGroups: jest.fn(),
  getRecruitmentGroupByUid: jest.fn(),
  getRecruitmentGroupsByUids: jest.fn(),
}));

import { getNavigationBarContents } from "../../../app/models/content";

const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;
const mockedGetAllCoupons = getAllCoupons as jest.MockedFunction<typeof getAllCoupons>;
const mockedHasUnregisteredActiveCoupons = hasUnregisteredActiveCoupons as jest.MockedFunction<
  typeof hasUnregisteredActiveCoupons
>;
const mockedHasUnreadAdminFeedbackReplies = hasUnreadAdminFeedbackReplies as jest.MockedFunction<
  typeof hasUnreadAdminFeedbackReplies
>;
const mockedGetLatestPostTime = getLatestPostTime as jest.MockedFunction<typeof getLatestPostTime>;
const mockedGetTimelineContentsByContentTypes = getTimelineContentsByContentTypes as jest.MockedFunction<
  typeof getTimelineContentsByContentTypes
>;

const env = {} as Env;

function event(uid: string, startAt: string, endAt: string | null, runType: "first" | "rerun" | "permanent" = "first") {
  return {
    uid,
    name: uid,
    nameI18n: {},
    startAt,
    endAt,
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "event" as const,
    runType,
    occurrence: null,
    contentUid: null,
    shopContentUid: null,
    recruitmentGroupUid: null,
    confirmed: true,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    syncedAt: null,
  };
}

describe("getNavigationBarContents (raw + request-time filter)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The module mock defines fetchRouteCached as an fn() passthrough, so no separate
    // implementation is needed. clearAllMocks resets it, so reapply the mock behavior.
    mockedFetchRouteCached.mockImplementation(
      <T>(_env: Env, _ctx: ExecutionContext | undefined, _key: string, fn: () => Promise<T>) => fn(),
    );
    mockedGetLatestPostTime.mockResolvedValue(null);
    mockedGetAllCoupons.mockResolvedValue([]);
    mockedHasUnregisteredActiveCoupons.mockResolvedValue(false);
    mockedHasUnreadAdminFeedbackReplies.mockResolvedValue(false);
  });

  it("picks the upcomingEvent against the request-time clock, not the cached snapshot time", async () => {
    mockedGetTimelineContentsByContentTypes.mockResolvedValue([
      event("event-a", "2026-05-11T10:00:00.000Z", "2026-05-11T11:00:00.000Z"),
      event("event-b", "2026-05-11T12:00:00.000Z", "2026-05-11T13:00:00.000Z"),
    ]);

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-05-11T10:30:00.000Z").getTime());
      let result = await getNavigationBarContents(env);
      expect(result.upcomingEvent?.uid).toBe("event-a");

      // Once event-a expires over time, event-b becomes the next upcoming event even with the same cache input.
      jest.setSystemTime(new Date("2026-05-11T11:30:00.000Z").getTime());
      result = await getNavigationBarContents(env);
      expect(result.upcomingEvent?.uid).toBe("event-b");
    } finally {
      jest.useRealTimers();
    }
  });

  it("computes hasRecentNews against the request-time threshold", async () => {
    mockedGetTimelineContentsByContentTypes.mockResolvedValue([]);
    mockedGetLatestPostTime.mockResolvedValue(new Date("2026-05-10T00:00:00.000Z"));

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-05-12T00:00:00.000Z").getTime()); // 2 days ago -> recent.
      let result = await getNavigationBarContents(env);
      expect(result.hasRecentNews).toBe(true);

      jest.setSystemTime(new Date("2026-05-14T00:00:00.000Z").getTime()); // 4 days ago -> old.
      result = await getNavigationBarContents(env);
      expect(result.hasRecentNews).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("treats coupons as inactive once their endAt has passed in real time", async () => {
    mockedGetTimelineContentsByContentTypes.mockResolvedValue([]);
    mockedGetAllCoupons.mockResolvedValue([
      {
        id: 1,
        uid: "coupon-a",
        name: "coupon-a",
        code: "CODE",
        imageUrl: null,
        rewards: [],
        linkUrl: null,
        linkLabel: null,
        expiresAt: "2026-05-11T12:00:00.000Z",
      },
    ]);

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-05-11T11:00:00.000Z").getTime());
      let result = await getNavigationBarContents(env);
      expect(result.hasActiveCoupons).toBe(true);

      jest.setSystemTime(new Date("2026-05-11T13:00:00.000Z").getTime());
      result = await getNavigationBarContents(env);
      expect(result.hasActiveCoupons).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("queries timeline_contents with a future window (no 5-year unbounded fetch)", async () => {
    mockedGetTimelineContentsByContentTypes.mockResolvedValue([]);

    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-05-11T00:00:00.000Z").getTime());
      await getNavigationBarContents(env);
      // Regression guard: this must not be called without the endAfter parameter.
      expect(mockedGetTimelineContentsByContentTypes).toHaveBeenCalledWith(env, ["event"], expect.any(String));
    } finally {
      jest.useRealTimers();
    }
  });

  it("adds personal red dots only for authenticated navigation requests", async () => {
    mockedGetTimelineContentsByContentTypes.mockResolvedValue([]);
    mockedHasUnregisteredActiveCoupons.mockResolvedValue(true);
    mockedHasUnreadAdminFeedbackReplies.mockResolvedValue(true);

    const anonymousResult = await getNavigationBarContents(env);
    expect(anonymousResult.hasUnconsumedCoupons).toBe(false);
    expect(anonymousResult.hasUnreadFeedbackReplies).toBe(false);
    expect(mockedHasUnregisteredActiveCoupons).not.toHaveBeenCalled();
    expect(mockedHasUnreadAdminFeedbackReplies).not.toHaveBeenCalled();

    const authenticatedResult = await getNavigationBarContents(env, false, 42);
    expect(authenticatedResult.hasUnconsumedCoupons).toBe(true);
    expect(authenticatedResult.hasUnreadFeedbackReplies).toBe(true);
    expect(mockedHasUnregisteredActiveCoupons).toHaveBeenCalledWith(env, 42);
    expect(mockedHasUnreadAdminFeedbackReplies).toHaveBeenCalledWith(env, 42);
  });
});
