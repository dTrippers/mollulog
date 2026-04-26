import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "~/models/base";
import { getTimelineContent } from "~/models/timeline-content";
import { getEventMetadata, getEventShopContent } from "../../../app/models/event-content";

jest.mock("~/models/timeline-content", () => ({
  getTimelineContent: jest.fn(),
}));

jest.mock("~/models/base", () => ({
  fetchCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedGetTimelineContent = getTimelineContent as jest.MockedFunction<typeof getTimelineContent>;
const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;
const mockedFetchCached = fetchCached as jest.MockedFunction<typeof fetchCached>;

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

    expect(mockedFetchCached).toHaveBeenCalledWith(
      env,
      "event-content::shop::v2::main-story-timeline",
      expect.any(Function),
      7 * 24 * 60 * 60,
    );
    expect(mockedRunQuery).toHaveBeenCalledWith(expect.any(Object), {
      eventUid: "linked-event",
      runType: "permanent",
    });
  });
});
