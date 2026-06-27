import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { fetchLazySourceCached, fetchRouteCached, fetchSourceCached } from "~/models/base";
import { getAllTimelineContentsMeta, getTimelineContent, getTimelineContents } from "~/models/timeline-content";
import {
  getEventContentSchedule,
  getEventList,
  getEventMetadata,
  getEventShopContent,
  getShopAvailableEvents,
} from "../../../app/models/event-content";

jest.mock("~/models/timeline-content", () => ({
  getAllTimelineContentsMeta: jest.fn(),
  getTimelineContent: jest.fn(),
  getTimelineContents: jest.fn(),
}));

jest.mock("~/models/base", () => ({
  cacheKey: (category: string, domain: string, version: number, query: string) =>
    `${category}::${domain}::v${version}::${query}`,
  cacheQuery: (params: Record<string, string | number | boolean | null | undefined>) =>
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("::") || "all",
  fetchLazySourceCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
  fetchRouteCached: jest.fn((_env: unknown, _ctx: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
  fetchSourceCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedGetTimelineContent = getTimelineContent as jest.MockedFunction<typeof getTimelineContent>;
const mockedGetTimelineContents = getTimelineContents as jest.MockedFunction<typeof getTimelineContents>;
const mockedGetAllTimelineContentsMeta = getAllTimelineContentsMeta as jest.MockedFunction<
  typeof getAllTimelineContentsMeta
>;
const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;
const mockedFetchLazySourceCached = fetchLazySourceCached as jest.MockedFunction<typeof fetchLazySourceCached>;
const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;
const mockedFetchSourceCached = fetchSourceCached as jest.MockedFunction<typeof fetchSourceCached>;

const env = {} as Env;

function createTimelineContent(overrides: Partial<NonNullable<Awaited<ReturnType<typeof getTimelineContent>>>> = {}) {
  return {
    uid: "main-story-timeline",
    name: "메인 스토리",
    startAt: new Date("2026-04-24T02:00:00.000Z"),
    endAt: new Date("2026-05-08T02:00:00.000Z"),
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "main_story",
    runType: "permanent",
    occurrence: null,
    contentUid: "main-story-part",
    shopContentUid: "linked-event",
    recruitmentGroupUid: null,
    confirmed: true,
    isSpoiler: false,
    tags: ["shop"],
    earnablePyroxene: null,
    syncedAt: null,
    ...overrides,
  } as NonNullable<Awaited<ReturnType<typeof getTimelineContent>>>;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("getEventList", () => {
  it("builds GL event catalog rows and omits events without timeline detail pages", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContents: [
          {
            uid: "10",
            name: "열 번째 이벤트",
            schedules: [
              {
                region: "jp",
                runType: "first",
                startAt: "2024-01-01T02:00:00.000Z",
                endAt: "2024-01-15T01:59:59.000Z",
              },
              {
                region: "gl",
                runType: "first",
                startAt: "2025-01-01T02:00:00.000Z",
                endAt: "2025-01-15T01:59:59.000Z",
              },
              {
                region: "gl",
                runType: "rerun",
                startAt: "2026-06-10T02:00:00.000Z",
                endAt: "2026-06-20T01:59:59.000Z",
              },
              {
                region: "gl",
                runType: "permanent",
                startAt: "2026-07-01T02:00:00.000Z",
                endAt: null,
              },
            ],
          },
          {
            uid: "2",
            name: "두 번째 이벤트",
            schedules: [
              {
                region: "gl",
                runType: "first",
                startAt: "2024-01-01T02:00:00.000Z",
                endAt: "2024-01-15T01:59:59.000Z",
              },
            ],
          },
        ],
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });
    mockedGetAllTimelineContentsMeta.mockResolvedValue([
      createTimelineContent({
        uid: "event-10-first",
        name: "열 번째 이벤트",
        startAt: "2025-01-01T02:00:00.000Z",
        endAt: "2025-01-15T01:59:59.000Z",
        contentType: "event",
        runType: "first",
        contentUid: "10",
        imageUrl: "https://assets.example/events/10-first.webp",
      }),
      createTimelineContent({
        uid: "event-10-rerun",
        name: "열 번째 이벤트 복각",
        startAt: "2026-06-10T02:00:00.000Z",
        endAt: "2026-06-20T01:59:59.000Z",
        contentType: "event",
        runType: "rerun",
        contentUid: "10",
        imageUrl: "https://assets.example/events/10-rerun.webp",
      }),
      createTimelineContent({
        uid: "mini-event-10",
        name: "열 번째 이벤트 미니",
        startAt: "2026-08-01T02:00:00.000Z",
        endAt: "2026-08-10T01:59:59.000Z",
        contentType: "mini_event",
        runType: "first",
        contentUid: "10",
        imageUrl: "https://assets.example/events/10-mini.webp",
      }),
    ]);

    await expect(getEventList(env, "2026-06-13T00:00:00.000Z")).resolves.toEqual([
      {
        uid: "10",
        name: "열 번째 이벤트",
        imageUrl: "https://assets.baql.net/images/events/logo/10_kr.webp",
        fallbackImageUrl: "https://assets.baql.net/images/events/logo/10_jp.webp",
        latestTimelineUid: "event-10-rerun",
        schedules: {
          first: {
            runType: "first",
            since: "2025-01-01T02:00:00.000Z",
            until: "2025-01-15T01:59:59.000Z",
            status: "past",
          },
          rerun: {
            runType: "rerun",
            since: "2026-06-10T02:00:00.000Z",
            until: "2026-06-20T01:59:59.000Z",
            status: "current",
          },
          permanent: {
            runType: "permanent",
            since: "2026-07-01T02:00:00.000Z",
            until: null,
            status: "upcoming",
          },
        },
      },
    ]);
    expect(mockedFetchRouteCached).toHaveBeenCalledWith(
      env,
      undefined,
      "route::events::v1::list",
      expect.any(Function),
      false,
    );
    expect(mockedFetchSourceCached).toHaveBeenCalledWith(
      env,
      "source::event-content::v1::list",
      expect.any(Function),
      false,
    );
  });

  it("refreshes the full event list cache and recalculates schedule status per request", async () => {
    const cachedEvents = [
      {
        uid: "20",
        name: "스무 번째 이벤트",
        imageUrl: "https://assets.baql.net/images/events/logo/20_kr.webp",
        fallbackImageUrl: "https://assets.baql.net/images/events/logo/20_jp.webp",
        latestTimelineUid: "event-20",
        schedules: {
          first: {
            runType: "first",
            since: "2026-06-10T02:00:00.000Z",
            until: "2026-06-20T01:59:59.000Z",
          },
        },
      },
    ];
    mockedFetchRouteCached.mockImplementationOnce(async () => cachedEvents as never);

    await expect(getEventList(env, "2026-06-13T00:00:00.000Z", true)).resolves.toEqual([
      {
        uid: "20",
        name: "스무 번째 이벤트",
        imageUrl: "https://assets.baql.net/images/events/logo/20_kr.webp",
        fallbackImageUrl: "https://assets.baql.net/images/events/logo/20_jp.webp",
        latestTimelineUid: "event-20",
        schedules: {
          first: {
            runType: "first",
            since: "2026-06-10T02:00:00.000Z",
            until: "2026-06-20T01:59:59.000Z",
            status: "current",
          },
        },
      },
    ]);
    expect(mockedFetchRouteCached).toHaveBeenCalledWith(
      env,
      undefined,
      "route::events::v1::list",
      expect.any(Function),
      true,
    );
    expect(mockedRunQuery).not.toHaveBeenCalled();
  });
});

describe("getShopAvailableEvents", () => {
  it("keeps the timeline date for shared-shop events in the selector", async () => {
    mockedGetTimelineContents.mockResolvedValue([
      createTimelineContent({
        uid: "steel-continent-malkuth",
        name: "강철대륙 공략전 ~말쿠트전~",
        startAt: "2026-06-09T02:00:00.000Z",
        endAt: "2026-06-23T01:59:59.000Z",
        contentType: "raid",
        runType: "first",
        contentUid: "gl_allied_21",
        shopContentUid: "854",
      }),
    ]);
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          schedules: [
            {
              region: "gl",
              runType: "first",
              startAt: "2026-05-26T02:00:00.000Z",
              endAt: "2026-07-08T02:00:00.000Z",
            },
          ],
        },
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });

    await expect(getShopAvailableEvents(env)).resolves.toEqual([
      {
        uid: "steel-continent-malkuth",
        name: "강철대륙 공략전 ~말쿠트전~",
        since: "2026-06-09T02:00:00.000Z",
        until: "2026-06-23T01:59:59.000Z",
        isSpoiler: false,
      },
    ]);
    expect(mockedRunQuery).not.toHaveBeenCalled();
  });
});

describe("getEventMetadata", () => {
  it("marks content with shopContentUid as shop-available regardless of run type", async () => {
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());

    await expect(getEventMetadata(env, "main-story-timeline")).resolves.toMatchObject({
      contentUid: "main-story-part",
      shopContentUid: "linked-event",
      shopAvailable: true,
      runType: "permanent",
    });
  });

  it("keeps the previous event-only shop availability fallback", async () => {
    mockedGetTimelineContent.mockResolvedValue(
      createTimelineContent({
        contentType: "event",
        runType: "permanent",
        contentUid: "event-content",
        shopContentUid: null,
      }),
    );

    await expect(getEventMetadata(env, "event-timeline")).resolves.toMatchObject({
      shopAvailable: false,
    });
  });
});

describe("getEventShopContent", () => {
  it("uses shopContentUid for the BAQL eventContent lookup when present", async () => {
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          stages: [],
          shopResources: [],
          bonuses: [],
          minigameConfigs: [],
        },
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });

    await getEventShopContent(env, "main-story-timeline");

    expect(mockedFetchLazySourceCached).toHaveBeenCalledWith(
      env,
      "source::event-shop::v1::contentUid=linked-event::runType=permanent",
      expect.any(Function),
      7 * 24 * 60 * 60,
      false,
    );
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.any(Object), {
      eventUid: "linked-event",
      runType: "permanent",
    });
  });

  it("passes force refresh through to the event shop source cache", async () => {
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          stages: [],
          shopResources: [],
          bonuses: [],
          minigameConfigs: [],
        },
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });

    await getEventShopContent(env, "main-story-timeline", true);

    expect(mockedFetchLazySourceCached).toHaveBeenCalledWith(
      env,
      "source::event-shop::v1::contentUid=linked-event::runType=permanent",
      expect.any(Function),
      7 * 24 * 60 * 60,
      true,
    );
  });

  it("maps shop purchase tiers from BAQL", async () => {
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          stages: [],
          shopResources: [
            {
              uid: "8540000",
              resourceAmount: 1,
              shopAmount: 60,
              resource: {
                type: "currency",
                uid: "19",
                name: "연합 작전 티켓",
                rarity: 1,
              },
              paymentResource: {
                type: "currency",
                uid: "4",
                name: "청휘석",
              },
              purchaseTiers: [
                {
                  tierIndex: 0,
                  startQuantity: 1,
                  quantity: 10,
                  unitPrice: 5,
                  paymentResource: {
                    type: "currency",
                    uid: "4",
                    name: "청휘석",
                  },
                },
                {
                  tierIndex: 1,
                  startQuantity: 11,
                  quantity: 10,
                  unitPrice: 10,
                  paymentResource: {
                    type: "currency",
                    uid: "4",
                    name: "청휘석",
                  },
                },
              ],
            },
          ],
          bonuses: [],
          minigameConfigs: [],
        },
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });

    await expect(getEventShopContent(env, "main-story-timeline")).resolves.toMatchObject({
      shopResources: [
        {
          uid: "8540000",
          purchaseTiers: [
            { startQuantity: 1, quantity: 10, unitPrice: 5 },
            { startQuantity: 11, quantity: 10, unitPrice: 10 },
          ],
        },
      ],
    });
  });
});

describe("getEventContentSchedule", () => {
  it("passes force refresh through to the event schedule source cache", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          schedules: [
            {
              region: "gl",
              runType: "rerun",
              startAt: "2026-06-10T02:00:00.000Z",
              endAt: "2026-06-20T01:59:59.000Z",
            },
          ],
        },
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    });

    await getEventContentSchedule(env, "10", "rerun", true);

    expect(mockedFetchLazySourceCached).toHaveBeenCalledWith(
      env,
      "source::event-content-schedule::v1::eventUid=10::region=gl::runType=rerun",
      expect.any(Function),
      7 * 24 * 60 * 60,
      true,
    );
  });
});
