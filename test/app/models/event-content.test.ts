import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { print } from "graphql";
import { RunTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchLazySourceCached, fetchRouteCached, fetchSourceCached } from "~/lib/cache";
import { getAllTimelineContentsMeta, getTimelineContent, getTimelineContents } from "~/models/timeline-content.server";
import {
  getEventContentSchedule,
  getEventMetadata,
  getEventMinigameType,
  getEventShopContent,
  getShopAvailableEvents,
} from "../../../app/models/event-content";
import { getEventList } from "../../../app/views/events";

jest.mock("~/models/timeline-content.server", () => ({
  getAllTimelineContentsMeta: jest.fn(),
  getTimelineContent: jest.fn(),
  getTimelineContents: jest.fn(),
}));

jest.mock("~/lib/cache", () => ({
  cacheKey: (category: string, domain: string, version: number, query: string) =>
    `${category}::${domain}::v${version}::${query}`,
  cacheQuery: (params: Record<string, string | number | boolean | null | undefined>) =>
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("::") || "all",
  fetchLazySourceCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
  fetchSourceCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
  fetchRouteCached: jest.fn((_env: unknown, _ctx: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
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
const mockedFetchSourceCached = fetchSourceCached as jest.MockedFunction<typeof fetchSourceCached>;
const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;

const env = {} as Env;

type EventMetadata = Parameters<typeof getEventMinigameType>[1];

function createEventMetadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  return {
    name: "이벤트",
    contentType: "event",
    runType: "first",
    since: "2026-01-01T00:00:00.000Z",
    until: null,
    contentUid: "event-content",
    shopContentUid: "shop-content",
    recruitmentGroupUid: null,
    isSpoiler: false,
    shopAvailable: true,
    ...overrides,
  };
}

function queryResult(data: unknown, error?: unknown) {
  return {
    data,
    error,
    extensions: undefined,
    operation: {} as never,
    stale: false,
    hasNext: false,
  };
}

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

function createCardFlipSource(
  cardFlip: unknown,
  paymentResource: unknown = {
    type: "item",
    uid: "legacy-cost",
    name: "기존 비용",
  },
) {
  return queryResult({
    eventContent: {
      stages: [],
      shopResources: [],
      bonuses: [],
      minigameConfigs: [
        {
          minigameType: "card_flip",
          payment: { quantity: 5, resource: paymentResource },
          payments: [],
          rewardGroups: [],
          treasureHunt: null,
          cardFlip,
        },
      ],
    },
  }) as never;
}

async function loadCardFlipContent(cardFlip: unknown, paymentResource?: unknown) {
  mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
  mockedRunQuery.mockResolvedValue(createCardFlipSource(cardFlip, paymentResource));
  return getEventShopContent(env, "main-story-timeline");
}

function createCardFlipFixture(overrides: Record<string, unknown> = {}) {
  return {
    slotCount: 4,
    flipCosts: [200, 210, 220, 230].map((quantity, index) => ({
      flip: index + 1,
      payments: [{ quantity, resource: { type: "item", uid: "photo-card", name: "포토 카드" } }],
    })),
    drawRules: {
      model: "low_rarity_count_v1",
      initialGroup: 1,
      maxDrawCount: 4,
      advanceOnRarities: [1, 2],
      resetOnShuffle: true,
      withReplacement: true,
    },
    cards: [
      {
        uid: "card-1",
        cardGroupUid: null,
        name: null,
        rarity: 1,
        slots: [1, 2, 3, 4].map((slot) => ({ slot, weight: 1 })),
        rewards: [{ quantity: 4, resource: { type: "item", uid: "gift", name: "선물용 특산 계화과" } }],
      },
    ],
    ...overrides,
  };
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
      "route::events::v3::list",
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
      "route::events::v3::list",
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
      contentType: "main_story",
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
  it.each([
    [[{ uid: "student-1", name: " 학생 " }], [{ uid: "student-1", name: "학생" }]],
    [[], []],
  ])("preserves furniture interaction students from BAQL: %j", async (interactionStudents, expectedStudents) => {
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue(
      queryResult({
        eventContent: {
          stages: [],
          shopResources: [
            {
              uid: "furniture-offer",
              resourceAmount: 1,
              shopAmount: 1,
              resource: { type: "furniture", uid: "furniture-1", name: "가구", rarity: 4, interactionStudents },
              paymentResource: { type: "currency", uid: "4", name: "청휘석" },
              purchaseTiers: [],
            },
          ],
          bonuses: [],
          minigameConfigs: [],
        },
      }) as never,
    );

    await expect(getEventShopContent(env, "main-story-timeline")).resolves.toMatchObject({
      shopResources: [{ resource: { interactionStudents: expectedStudents } }],
    });
    expect(print(mockedRunQuery.mock.calls[0][0])).toContain("interactionStudents");
  });

  it("rejects furniture shop data that is missing interaction students", async () => {
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue(
      queryResult({
        eventContent: {
          stages: [],
          shopResources: [
            {
              uid: "furniture-offer",
              resourceAmount: 1,
              shopAmount: 1,
              resource: { type: "furniture", uid: "furniture-1", name: "가구", rarity: 4 },
              paymentResource: { type: "currency", uid: "4", name: "청휘석" },
              purchaseTiers: [],
            },
          ],
          bonuses: [],
          minigameConfigs: [],
        },
      }) as never,
    );

    await expect(getEventShopContent(env, "main-story-timeline")).rejects.toThrow(
      "BAQL shop furniture response is missing interaction students",
    );
  });

  it.each([
    ["an invalid loop round", { loopRound: 0, rounds: [] }, "Treasure hunt loop round is invalid."],
    ["a missing loop round number", { loopRound: undefined, rounds: [] }, "Treasure hunt loop round is invalid."],
    ["an empty round list", { loopRound: 1, rounds: [] }, "Treasure hunt round configuration is incomplete."],
    [
      "a missing loop round entry",
      { loopRound: 3, rounds: [{ round: 1 }, { round: 2 }] },
      "Treasure hunt round configuration is incomplete.",
    ],
    [
      "a missing intermediate round",
      { loopRound: 3, rounds: [{ round: 1 }, { round: 1 }, { round: 3 }] },
      "Treasure hunt round 2 is missing its configuration.",
    ],
  ])("rejects treasure hunt data with %s", async (_description, treasureHunt, message) => {
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          stages: [],
          shopResources: [],
          bonuses: [],
          minigameConfigs: [
            {
              minigameType: "treasure_hunt",
              payment: { quantity: 1, resource: { type: "currency", uid: "payment", name: "칸 비용" } },
              payments: [],
              rewardGroups: [],
              treasureHunt,
            },
          ],
        },
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    } as never);

    await expect(getEventShopContent(env, "main-story-timeline")).rejects.toThrow(message);
  });

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
      "source::event-shop::v4::contentUid=linked-event::runType=permanent",
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
      "source::event-shop::v4::contentUid=linked-event::runType=permanent",
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

  it("preserves BAQL localized emblem URLs for shop resources and payment resources", async () => {
    const emblemImageUrl = "https://assets.baql.net/images/resources/emblems/3000845/background/ko.webp";
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          stages: [],
          shopResources: [
            {
              uid: "emblem-offer",
              resourceAmount: 1,
              shopAmount: 1,
              resource: {
                type: "emblem",
                uid: "3000845",
                name: "이벤트 문양",
                rarity: 1,
                imageUrl: emblemImageUrl,
              },
              paymentResource: {
                type: "emblem",
                uid: "3000845",
                name: "이벤트 문양",
                imageUrl: emblemImageUrl,
              },
              purchaseTiers: [
                {
                  tierIndex: 0,
                  startQuantity: 1,
                  quantity: 1,
                  unitPrice: 1,
                  paymentResource: {
                    type: "emblem",
                    uid: "3000845",
                    name: "이벤트 문양",
                    imageUrl: emblemImageUrl,
                  },
                },
              ],
            },
          ],
          bonuses: [],
          minigameConfigs: [
            {
              minigameType: "prize_exchange",
              payment: {
                quantity: 1,
                resource: {
                  type: "emblem",
                  uid: "3000845",
                  name: "이벤트 문양",
                  imageUrl: emblemImageUrl,
                },
              },
              payments: [
                {
                  quantity: 2,
                  resource: {
                    type: "emblem",
                    uid: "3000845",
                    name: "이벤트 문양",
                    imageUrl: emblemImageUrl,
                  },
                },
              ],
              rewardGroups: [],
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

    await expect(getEventShopContent(env, "main-story-timeline")).resolves.toMatchObject({
      shopResources: [
        {
          resource: { type: "emblem", uid: "3000845", imageUrl: emblemImageUrl },
          paymentResource: { type: "emblem", uid: "3000845", imageUrl: emblemImageUrl },
          purchaseTiers: [{ paymentResource: { type: "emblem", uid: "3000845", imageUrl: emblemImageUrl } }],
        },
      ],
      minigameConfig: {
        payment: { resourceType: "emblem", resourceUid: "3000845", imageUrl: emblemImageUrl },
        payments: [{ resourceType: "emblem", resourceUid: "3000845", imageUrl: emblemImageUrl }],
      },
    });
  });

  it("normalizes per-flip costs, draw rules, card slots and rewards", async () => {
    const cardUids = Array.from({ length: 10 }, (_, index) => `card-${index + 1}`);
    const shopContent = await loadCardFlipContent(
      createCardFlipFixture({
        flipCosts: [200, 210, 220, 230].map((quantity, index) => ({
          flip: index + 1,
          payments: [
            {
              quantity,
              resource: { type: "item", uid: "photo-card", name: "즉석 기념 포토 카드 컬렉션" },
            },
          ],
        })),
        cards: cardUids.map((uid, index) => ({
          uid,
          cardGroupUid: null,
          name: null,
          rarity: (index % 4) + 1,
          slots: [{ slot: 1, weight: index + 1 }],
          rewards: [{ quantity: 4, resource: { type: "item", uid: "gift", name: "선물용 특산 계화과" } }],
        })),
      }),
    );

    const cardFlip = shopContent?.minigameConfig?.cardFlip;
    expect(cardFlip?.status).toBe("available");
    if (cardFlip?.status !== "available") throw new Error("Expected card-flip data to be available");
    expect(cardFlip.slotCount).toBe(4);
    expect(cardFlip.flipCosts.map(({ flip, payments }) => [flip, payments[0]?.quantity])).toEqual([
      [1, 200],
      [2, 210],
      [3, 220],
      [4, 230],
    ]);
    expect(cardFlip.flipCosts[0]?.payments[0]).toMatchObject({
      resourceUid: "photo-card",
      resourceName: "즉석 기념 포토 카드 컬렉션",
    });
    expect(cardFlip.drawRules).toEqual({ initialGroup: 1, maxDrawCount: 4, advanceOnRarities: [1, 2] });
    expect(cardFlip.cards).toHaveLength(10);
    expect(cardFlip.cards.map(({ uid }) => uid)).toEqual(cardUids);
    expect(cardFlip.cards[0]).toMatchObject({
      slots: [{ slot: 1, weight: 1 }],
      rewards: [{ resourceUid: "gift", quantity: 4 }],
    });
    expect(shopContent?.minigameConfig).toMatchObject({
      payment: { resourceUid: "photo-card", quantity: 200 },
      payments: [{ resourceUid: "photo-card", quantity: 200 }],
    });
  });

  it("normalizes card reward identity fields and rejects a card with unknown rarity", async () => {
    const giftImageUrl = "https://assets.baql.net/images/resources/items/gift.webp";
    const shopContent = await loadCardFlipContent(
      createCardFlipFixture({
        cards: [
          {
            uid: "card-1",
            cardGroupUid: "group/1",
            name: "  축제의 추억  ",
            rarity: 4,
            slots: [{ slot: 1, weight: 1 }],
            rewards: [
              {
                quantity: 2,
                resource: {
                  type: "item",
                  uid: "gift",
                  name: "선물용 특산 계화과",
                  rarity: 2,
                  imageUrl: giftImageUrl,
                },
              },
            ],
          },
        ],
      }),
    );

    expect(shopContent?.minigameConfig).toMatchObject({
      minigameType: "card_flip",
      payment: { resourceUid: "photo-card", resourceName: "포토 카드", quantity: 200 },
      payments: [{ resourceUid: "photo-card", quantity: 200 }],
      cardFlip: {
        status: "available",
        cards: [
          {
            uid: "card-1",
            name: "축제의 추억",
            rarity: 4,
            slots: [{ slot: 1, weight: 1 }],
            imageUrl: "https://assets.baql.net/images/events/cards/group%2F1.webp",
            rewards: [
              {
                resourceUid: "gift",
                resourceName: "선물용 특산 계화과",
                quantity: 2,
                rarity: 2,
                imageUrl: giftImageUrl,
              },
            ],
          },
        ],
      },
    });
    expect(print(mockedRunQuery.mock.calls[0]?.[0] as never)).toContain("slots");

    await expect(
      loadCardFlipContent(createCardFlipFixture({ cards: [{ ...createCardFlipFixture().cards[0], rarity: null }] })),
    ).resolves.toMatchObject({ minigameConfig: { cardFlip: { status: "invalid" } } });
  });

  it("keeps the generic payment when card-flip data is unavailable or invalid", async () => {
    await expect(loadCardFlipContent(null)).resolves.toMatchObject({
      minigameConfig: {
        minigameType: "card_flip",
        payment: { resourceUid: "legacy-cost", quantity: 5 },
        cardFlip: { status: "unavailable" },
      },
    });

    await expect(
      loadCardFlipContent(
        createCardFlipFixture({
          cards: [{ ...createCardFlipFixture().cards[0], rewards: [{ quantity: 1, resource: null }] }],
        }),
      ),
    ).resolves.toMatchObject({
      minigameConfig: {
        payment: { resourceUid: "legacy-cost", quantity: 5 },
        cardFlip: { status: "invalid" },
      },
    });
  });

  it.each([
    ["null flip costs", { flipCosts: null }],
    ["null draw rules", { drawRules: null }],
    ["an unsupported draw model", { drawRules: { ...createCardFlipFixture().drawRules, model: "unknown" } }],
    ["shuffle without reset", { drawRules: { ...createCardFlipFixture().drawRules, resetOnShuffle: false } }],
    ["draws without replacement", { drawRules: { ...createCardFlipFixture().drawRules, withReplacement: false } }],
    ["nonsequential flip costs", { flipCosts: [{ ...createCardFlipFixture().flipCosts[0], flip: 2 }] }],
    [
      "multiple payments for a flip",
      {
        flipCosts: [
          {
            ...createCardFlipFixture().flipCosts[0],
            payments: [
              createCardFlipFixture().flipCosts[0].payments[0],
              createCardFlipFixture().flipCosts[0].payments[0],
            ],
          },
        ],
      },
    ],
    [
      "different payment resources",
      {
        flipCosts: createCardFlipFixture().flipCosts.map((cost, index) =>
          index === 1
            ? {
                ...cost,
                payments: [{ ...cost.payments[0], resource: { type: "item", uid: "other", name: "다른 재화" } }],
              }
            : cost,
        ),
      },
    ],
    ["an initial group outside the slots", { drawRules: { ...createCardFlipFixture().drawRules, initialGroup: 5 } }],
    ["invalid card slots", { cards: [{ ...createCardFlipFixture().cards[0], slots: [{ slot: 5, weight: 1 }] }] }],
    ["cards with no rewards", { cards: [{ ...createCardFlipFixture().cards[0], rewards: [] }] }],
  ])("marks %s as invalid without throwing", async (_description, overrides) => {
    await expect(loadCardFlipContent(createCardFlipFixture(overrides))).resolves.toMatchObject({
      minigameConfig: { cardFlip: { status: "invalid" } },
    });
  });

  it("preserves Emblem resource type and image URL from stage rewards", async () => {
    const emblemImageUrl = "https://assets.baql.net/images/resources/emblems/3000845/background/ko.webp";
    mockedGetTimelineContent.mockResolvedValue(createTimelineContent());
    mockedRunQuery.mockResolvedValue({
      data: {
        eventContent: {
          stages: [
            {
              uid: "event-stage-1",
              stageNumber: "1",
              stageIndex: 0,
              stageType: "stage",
              enterCostAmount: 10,
              rewards: [
                {
                  amount: 1,
                  probability: "1.0",
                  tag: "Default",
                  resource: {
                    __typename: "Emblem",
                    uid: "3000845",
                    name: "이벤트 문양",
                    rarity: 1,
                    imageUrl: emblemImageUrl,
                  },
                },
                {
                  amount: 1_000,
                  probability: "1.0",
                  tag: "Default",
                  resource: {
                    __typename: "Item",
                    uid: "100000",
                    name: "크레딧",
                    rarity: 1,
                    category: "coin",
                  },
                },
              ],
            },
          ],
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

    await expect(getEventShopContent(env, "main-story-timeline")).resolves.toMatchObject({
      stages: [
        {
          uid: "event-stage-1",
          rewards: [
            {
              item: {
                uid: "3000845",
                resourceType: "emblem",
                imageUrl: emblemImageUrl,
              },
            },
            {
              item: {
                uid: "100000",
                resourceType: "item",
                category: "coin",
              },
            },
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

describe("getEventMinigameType", () => {
  it("uses a focused query, its own source key, and the first run-specific config", async () => {
    mockedRunQuery.mockResolvedValue(
      queryResult({
        eventContent: {
          minigameConfigs: [{ minigameType: "dice" }, { minigameType: "treasure_hunt" }],
        },
      }) as never,
    );

    await expect(
      getEventMinigameType(
        env,
        createEventMetadata({ runType: "rerun", contentUid: "timeline-content", shopContentUid: "shop-content" }),
        true,
      ),
    ).resolves.toBe("dice");

    expect(mockedFetchLazySourceCached).toHaveBeenCalledWith(
      env,
      "source::event-minigame-type::v1::contentUid=shop-content::runType=rerun",
      expect.any(Function),
      7 * 24 * 60 * 60,
      true,
    );
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.anything(), {
      eventUid: "shop-content",
      runType: RunTypeEnum.Rerun,
    });
    const queryCall = mockedRunQuery.mock.calls[0];
    if (!queryCall) throw new Error("Expected the focused minigame type query to run.");
    const queryText = print(queryCall[0]);
    expect(queryText).toContain("minigameConfigs(runType: $runType)");
    expect(queryText).toContain("minigameType");
    expect(queryText).not.toContain("shopResources");
    expect(queryText).not.toContain("stages(");
    expect(queryText).not.toContain("bonuses(");
  });

  it("falls back to contentUid and caches successful absence by run type", async () => {
    mockedRunQuery.mockResolvedValue(queryResult({ eventContent: { minigameConfigs: [] } }) as never);

    await expect(
      getEventMinigameType(
        env,
        createEventMetadata({ contentUid: "base-content", shopContentUid: null, runType: "permanent" }),
      ),
    ).resolves.toBeNull();

    expect(mockedFetchLazySourceCached).toHaveBeenCalledWith(
      env,
      "source::event-minigame-type::v1::contentUid=base-content::runType=permanent",
      expect.any(Function),
      7 * 24 * 60 * 60,
      false,
    );
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.anything(), {
      eventUid: "base-content",
      runType: RunTypeEnum.Permanent,
    });
  });

  it("returns null when BAQL successfully reports no event content", async () => {
    mockedRunQuery.mockResolvedValue(queryResult({ eventContent: null }) as never);

    await expect(getEventMinigameType(env, createEventMetadata())).resolves.toBeNull();
  });

  it("preserves GraphQL and transport failures instead of converting them to absence", async () => {
    const graphQLError = new Error("upstream GraphQL failure");
    mockedRunQuery.mockResolvedValue(queryResult(null, graphQLError) as never);
    await expect(getEventMinigameType(env, createEventMetadata())).rejects.toBe(graphQLError);

    const transportError = new Error("upstream transport failure");
    mockedRunQuery.mockRejectedValue(transportError);
    await expect(getEventMinigameType(env, createEventMetadata())).rejects.toBe(transportError);
  });

  it("does not query or cache when neither content UID is available", async () => {
    await expect(
      getEventMinigameType(env, createEventMetadata({ contentUid: null, shopContentUid: null })),
    ).resolves.toBeNull();

    expect(mockedFetchLazySourceCached).not.toHaveBeenCalled();
    expect(mockedRunQuery).not.toHaveBeenCalled();
  });
});
