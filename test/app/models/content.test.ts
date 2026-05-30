import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fetchCached } from "~/models/base";
import { getAllCoupons } from "~/models/coupon";
import { getLatestPostTime } from "~/models/post";
import { getTimelineContentsByContentTypes } from "~/models/timeline-content";

jest.mock("~/models/base", () => ({
  // Bypass cache by executing fn() directly.
  fetchCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("~/models/coupon", () => ({
  getAllCoupons: jest.fn(),
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
jest.mock("~/repositories", () => ({
  RecruitmentRepository: jest.fn(),
  RaidRepository: jest.fn(),
}));

import { getNavigationBarContents } from "../../../app/models/content";

const mockedFetchCached = fetchCached as jest.MockedFunction<typeof fetchCached>;
const mockedGetAllCoupons = getAllCoupons as jest.MockedFunction<typeof getAllCoupons>;
const mockedGetLatestPostTime = getLatestPostTime as jest.MockedFunction<typeof getLatestPostTime>;
const mockedGetTimelineContentsByContentTypes = getTimelineContentsByContentTypes as jest.MockedFunction<
  typeof getTimelineContentsByContentTypes
>;

const env = {} as Env;

function event(uid: string, startAt: string, endAt: string | null, runType: "first" | "rerun" | "permanent" = "first") {
  return {
    uid,
    name: uid,
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
    // The module mock defines fetchCached as an fn() passthrough, so no separate
    // implementation is needed. clearAllMocks resets it, so reapply the mock behavior.
    mockedFetchCached.mockImplementation(<T>(_env: Env, _key: string, fn: () => Promise<T>) => fn());
    mockedGetLatestPostTime.mockResolvedValue(null);
    mockedGetAllCoupons.mockResolvedValue([]);
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
});
