import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fetchRouteCached } from "~/lib/cache";
import { getRecruitmentGroupsByUidsStrict, normalizeRecruitmentGroupPeriod } from "~/models/recruitment";
import { getTimelineContents } from "~/models/timeline-content.server";
import { getFutureContents } from "~/views/futures";
import { getUpcomingRaidContents } from "~/views/raid-content";

jest.mock("~/lib/cache", () => ({
  cacheKey: jest.fn(
    (category: string, domain: string, version: number, query: string) =>
      `${category}::${domain}::v${version}::${query}`,
  ),
  fetchRouteCached: jest.fn(),
}));

jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupByUid: jest.fn(),
  getRecruitmentGroupsByUidsStrict: jest.fn(),
  normalizeRecruitmentGroupPeriod: jest.fn(),
}));

jest.mock("~/models/timeline-content.server", () => ({
  getTimelineContents: jest.fn(),
}));

jest.mock("~/views/raid-content", () => ({
  getUpcomingRaidContents: jest.fn(),
}));

const env = {} as Env;
const mockedFetchRouteCached = fetchRouteCached as jest.MockedFunction<typeof fetchRouteCached>;
const mockedGetRecruitmentGroupsByUidsStrict = getRecruitmentGroupsByUidsStrict as jest.MockedFunction<
  typeof getRecruitmentGroupsByUidsStrict
>;
const mockedNormalizeRecruitmentGroupPeriod = normalizeRecruitmentGroupPeriod as jest.MockedFunction<
  typeof normalizeRecruitmentGroupPeriod
>;
const mockedGetTimelineContents = getTimelineContents as jest.MockedFunction<typeof getTimelineContents>;
const mockedGetUpcomingRaidContents = getUpcomingRaidContents as jest.MockedFunction<typeof getUpcomingRaidContents>;

const recruitmentPeriod = {
  startAt: "2030-01-11T00:00:00.000Z",
  endAt: "2030-01-21T00:00:00.000Z",
};

const timelineContent = {
  uid: "future-event",
  name: "미래 이벤트",
  nameI18n: {},
  startAt: "2030-01-10T00:00:00.000Z",
  endAt: "2030-01-20T00:00:00.000Z",
  endless: false,
  imageUrl: null,
  videos: [],
  contentType: "event",
  runType: "first",
  occurrence: null,
  contentUid: "event-1",
  shopContentUid: null,
  recruitmentGroupUid: "group-a",
  recruitmentStudentUids: null,
  confirmed: true,
  isSpoiler: false,
  tags: [],
  earnablePyroxene: null,
  syncedAt: "2029-12-01T00:00:00.000Z",
};

const recruitmentGroup = {
  uid: "group-a",
  startAt: "2030-01-11T00:00:00.000Z",
  endAt: "2030-01-21T00:00:00.000Z",
  recruitments: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetTimelineContents.mockResolvedValue([timelineContent] as never);
  mockedGetUpcomingRaidContents.mockResolvedValue([] as never);
  mockedGetRecruitmentGroupsByUidsStrict.mockResolvedValue([recruitmentGroup] as never);
  mockedNormalizeRecruitmentGroupPeriod.mockReturnValue(recruitmentPeriod);
  mockedFetchRouteCached.mockImplementation(async (_env, _ctx, _key, fn) => fn());
});

describe("getFutureContents recruitment periods", () => {
  it("caches normalized recruitment periods and uses the versioned futures key", async () => {
    const result = await getFutureContents(env);

    expect(result).toHaveLength(1);
    expect(result[0].recruitmentPeriod).toEqual(recruitmentPeriod);
    expect(mockedFetchRouteCached).toHaveBeenCalledWith(
      env,
      undefined,
      "route::futures::v3::all",
      expect.any(Function),
      false,
    );
    expect(mockedGetRecruitmentGroupsByUidsStrict).toHaveBeenCalledWith(env, ["group-a"], false);

    const routeProducer = mockedFetchRouteCached.mock.calls[0][3];
    const cachedShape = (await routeProducer()) as Array<{
      recruitmentPeriod: typeof recruitmentPeriod;
      recruitmentPeriodNotice?: unknown;
    }>;
    expect(cachedShape).toEqual([expect.objectContaining({ recruitmentPeriod })]);
    expect(cachedShape[0]).not.toHaveProperty("recruitmentPeriodNotice");
  });

  it("propagates strict recruitment lookup failures instead of returning an empty result", async () => {
    const error = new Error("BAQL unavailable");
    mockedGetRecruitmentGroupsByUidsStrict.mockRejectedValue(error);

    await expect(getFutureContents(env)).rejects.toBe(error);
  });
});
