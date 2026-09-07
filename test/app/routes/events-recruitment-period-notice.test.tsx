import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLoaderData, useNavigate } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getNestedContentComments } from "~/models/content.server";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { getPostByTimelineContentUid } from "~/models/post";
import { getRecruitmentGroupByUidStrict, normalizeRecruitmentGroupPeriod } from "~/models/recruitment";
import { getTimelineContent, getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import EventIndex, { loader } from "~/routes/events.$uid._index";

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: jest.fn(),
    useNavigate: jest.fn(),
  };
});

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/components/features/events", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    EventHeader: () => createElement("div", { "data-testid": "event-header" }, "event header"),
    EventInfoCard: ({ title }: { title: string }) => createElement("div", { "data-testid": "sibling" }, title),
    Recruitments: () => createElement("div", { "data-testid": "recruitments" }, "recruitments"),
  };
});

jest.mock("~/models/content.server", () => ({
  getNestedContentComments: jest.fn(),
}));

jest.mock("~/models/favorite-students", () => ({
  getFavoritedCounts: jest.fn(),
  getUserFavoritedStudents: jest.fn(),
  favoriteStudent: jest.fn(),
  unfavoriteStudent: jest.fn(),
}));

jest.mock("~/models/post", () => ({
  getPostByTimelineContentUid: jest.fn(),
}));

jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupByUidStrict: jest.fn(),
  normalizeRecruitmentGroupPeriod: jest.fn(),
}));

jest.mock("~/models/timeline-content.server", () => ({
  getTimelineContent: jest.fn(),
  getTimelineContentsByRecruitmentGroupUids: jest.fn(),
}));

jest.mock("../../../app/routes/events.$uid._components/EventComment", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return function MockEventComment() {
    return createElement("div", { "data-testid": "comments" }, "comments");
  };
});

const env = {} as Env;
const ctx = {} as ExecutionContext;
const mockedUseLoaderData = useLoaderData as jest.MockedFunction<typeof useLoaderData>;
const mockedUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetNestedContentComments = getNestedContentComments as jest.MockedFunction<typeof getNestedContentComments>;
const mockedGetFavoritedCounts = getFavoritedCounts as jest.MockedFunction<typeof getFavoritedCounts>;
const mockedGetUserFavoritedStudents = getUserFavoritedStudents as jest.MockedFunction<typeof getUserFavoritedStudents>;
const mockedGetPostByTimelineContentUid = getPostByTimelineContentUid as jest.MockedFunction<
  typeof getPostByTimelineContentUid
>;
const mockedGetRecruitmentGroupByUidStrict = getRecruitmentGroupByUidStrict as jest.MockedFunction<
  typeof getRecruitmentGroupByUidStrict
>;
const mockedNormalizeRecruitmentGroupPeriod = normalizeRecruitmentGroupPeriod as jest.MockedFunction<
  typeof normalizeRecruitmentGroupPeriod
>;
const mockedGetTimelineContent = getTimelineContent as jest.MockedFunction<typeof getTimelineContent>;
const mockedGetTimelineContentsByRecruitmentGroupUids =
  getTimelineContentsByRecruitmentGroupUids as jest.MockedFunction<typeof getTimelineContentsByRecruitmentGroupUids>;

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

function loaderArgs() {
  return {
    params: { uid: "future-event" },
    request: new Request("https://mollulog.net/events/future-event"),
    context: { cloudflare: { env, ctx } },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetActiveSensei.mockResolvedValue(null);
  mockedGetNestedContentComments.mockResolvedValue([] as never);
  mockedGetFavoritedCounts.mockResolvedValue([]);
  mockedGetUserFavoritedStudents.mockResolvedValue([]);
  mockedGetPostByTimelineContentUid.mockResolvedValue(null);
  mockedGetTimelineContent.mockResolvedValue(timelineContent as never);
  mockedGetRecruitmentGroupByUidStrict.mockResolvedValue(recruitmentGroup as never);
  mockedNormalizeRecruitmentGroupPeriod.mockReturnValue(recruitmentPeriod);
  mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([] as never);
  mockedUseNavigate.mockReturnValue((() => undefined) as ReturnType<typeof useNavigate>);
});

describe("event recruitment period notice loader", () => {
  it("includes the normalized recruitment period while preserving the filtered recruitment data", async () => {
    const result = await loader(loaderArgs());

    expect(result.eventContent).toMatchObject({
      recruitmentGroupUid: "group-a",
      recruitmentPeriod,
      recruitments: [],
    });
    expect(mockedGetRecruitmentGroupByUidStrict).toHaveBeenCalledWith(env, "group-a");
    expect(mockedNormalizeRecruitmentGroupPeriod).toHaveBeenCalledWith(recruitmentGroup as never);
  });

  it("propagates a strict recruitment lookup failure", async () => {
    const error = new Error("BAQL unavailable");
    mockedGetRecruitmentGroupByUidStrict.mockRejectedValue(error);

    await expect(loader(loaderArgs())).rejects.toBe(error);
  });
});

describe("event recruitment period notice presentation", () => {
  it("renders the warning directly after EventHeader and before sibling guidance", () => {
    mockedUseLoaderData.mockReturnValue({
      eventContent: {
        name: "미래 이벤트",
        since: "2030-01-10T00:00:00.000Z",
        until: "2030-01-20T00:00:00.000Z",
        imageUrl: null,
        type: "event",
        runType: "first",
        endless: false,
        videos: [],
        recruitmentGroupUid: "group-a",
        recruitmentPeriod,
        recruitments: [],
      },
      signedIn: false,
      allComments: [],
      me: null,
      eventUid: "future-event",
      siblingEvents: [{ uid: "sibling-event", name: "동시 개최 이벤트" }],
      livePost: null,
    } as never);

    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EventIndex)));
    const headerIndex = markup.indexOf('data-testid="event-header"');
    const noticeIndex = markup.indexOf("이벤트 기간과 모집 개최 기간이 달라요");
    const siblingIndex = markup.indexOf("모집 동시 개최");

    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(noticeIndex).toBeGreaterThan(headerIndex);
    expect(siblingIndex).toBeGreaterThan(noticeIndex);
    expect(markup).toContain("bg-amber-500/10");
    expect(markup).not.toContain('role="alert"');
  });
});
