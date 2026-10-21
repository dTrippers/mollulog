import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLoaderData, useNavigate } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getNestedContentComments } from "~/models/content.server";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { getPostByTimelineContentUid } from "~/models/post";
import { getEventMinigameType } from "~/models/event-content";
import {
  getRecruitmentGroupByUidStrict,
  getRecruitmentPoolStudents,
  normalizeRecruitmentGroupPeriod,
} from "~/models/recruitment";
import { getHideRecruitmentOpinions } from "~/models/sensei";
import { getTimelineContent, getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import { getEventShopPortalData } from "~/routes/events.$uid._components/event-shop-availability";
import { createFutureDetailNavigationState } from "~/routes/futures._components/futures-navigation";
import { useVerifiedFutureDetailReturn } from "~/routes/futures._components/use-futures-navigation";
import EventIndex, { loader } from "~/routes/events.$uid._index";

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    Link: ({ children, to, state, className }: { children: ReactNode; to: string; state?: unknown; className?: string }) =>
      createElement(
        "a",
        { href: to, className, "data-link-state": state === undefined ? undefined : JSON.stringify(state) },
        children,
      ),
    useLoaderData: jest.fn(),
    useNavigate: jest.fn(),
    useFetcher: jest.fn(() => ({ submit: jest.fn() })),
    useRevalidator: jest.fn(() => ({ revalidate: jest.fn() })),
  };
});

jest.mock("~/routes/futures._components/use-futures-navigation", () => ({
  useVerifiedFutureDetailReturn: jest.fn(),
}));

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/components/v2/layout", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const actual = jest.requireActual<typeof import("~/components/v2/layout")>("~/components/v2/layout");
  return { ...actual, PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children) };
});
jest.mock("~/components/v2/features/events/EventHero", () => ({ EventHero: () => null }));
jest.mock("~/components/v2/features/students/RecruitmentStudentCard", () => ({ RecruitmentStudentCard: () => null }));
jest.mock("~/components/v2/features/resources/ResourceThumb", () => ({ ResourceThumb: () => null }));
jest.mock("~/contexts/TimeZoneProvider", () => ({ useDisplayTimeZone: () => "UTC" }));
jest.mock("../../../app/routes/events.$uid._components/EventOpinions", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return { EventOpinions: () => createElement("div", { "data-testid": "comments" }, "comments") };
});
jest.mock("~/models/event-content", () => {
  const actual = jest.requireActual<typeof import("~/models/event-content")>("~/models/event-content");
  return { ...actual, getEventMinigameType: jest.fn<typeof getEventMinigameType>().mockResolvedValue(null) };
});
jest.mock("../../../app/routes/events.$uid._components/event-shop-availability", () => ({
  getEventShopPortalData: jest.fn<typeof getEventShopPortalData>().mockResolvedValue({
    status: "ready",
    since: "2030-01-10T00:00:00.000Z",
    until: "2030-01-20T00:00:00.000Z",
    currencies: [],
  }),
}));

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
  getRecruitmentPoolStudents: jest.fn(),
  normalizeRecruitmentGroupPeriod: jest.fn(),
}));

jest.mock("~/models/sensei", () => ({
  getHideRecruitmentOpinions: jest.fn(),
}));

jest.mock("~/models/timeline-content.server", () => ({
  getTimelineContent: jest.fn(),
  getTimelineContentsByRecruitmentGroupUids: jest.fn(),
}));

const env = {} as Env;
const ctx = {} as ExecutionContext;
const mockedUseLoaderData = useLoaderData as jest.MockedFunction<typeof useLoaderData>;
const mockedUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockedUseVerifiedFutureDetailReturn = jest.mocked(useVerifiedFutureDetailReturn);
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
const mockedGetRecruitmentPoolStudents = getRecruitmentPoolStudents as jest.MockedFunction<typeof getRecruitmentPoolStudents>;
const mockedNormalizeRecruitmentGroupPeriod = normalizeRecruitmentGroupPeriod as jest.MockedFunction<
  typeof normalizeRecruitmentGroupPeriod
>;
const mockedGetHideRecruitmentOpinions = getHideRecruitmentOpinions as jest.MockedFunction<
  typeof getHideRecruitmentOpinions
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
  imageBlurhash: null,
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
  featuredUntil: null,
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
    url: new URL("https://mollulog.net/events/future-event"),
    pattern: "/events/:uid",
  } satisfies import("react-router").LoaderFunctionArgs;
}

type EventIndexLoaderData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;

async function loadEventData(): Promise<EventIndexLoaderData> {
  const result = await loader(loaderArgs());
  if (result instanceof Response) {
    throw new Error(`Expected event data, received response ${result.status}`);
  }
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetActiveSensei.mockResolvedValue(null);
  mockedGetHideRecruitmentOpinions.mockResolvedValue(true);
  mockedGetNestedContentComments.mockResolvedValue([] as never);
  mockedGetFavoritedCounts.mockResolvedValue([]);
  mockedGetUserFavoritedStudents.mockResolvedValue([]);
  mockedGetPostByTimelineContentUid.mockResolvedValue(null);
  mockedGetTimelineContent.mockResolvedValue(timelineContent as never);
  mockedGetRecruitmentGroupByUidStrict.mockResolvedValue(recruitmentGroup as never);
  mockedGetRecruitmentPoolStudents.mockResolvedValue([]);
  mockedNormalizeRecruitmentGroupPeriod.mockReturnValue(recruitmentPeriod);
  mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([] as never);
  mockedUseNavigate.mockReturnValue((() => undefined) as ReturnType<typeof useNavigate>);
  mockedUseVerifiedFutureDetailReturn.mockReturnValue({ navigationState: null, verifiedFutureReturn: false });
});

describe("event recruitment period notice loader", () => {
  it("includes the normalized recruitment period and hides results from a guest", async () => {
    const result = await loadEventData();

    expect(result.eventContent).toMatchObject({
      recruitmentGroupUid: "group-a",
      recruitmentPeriod,
      recruitments: [],
    });
    expect(mockedGetRecruitmentGroupByUidStrict).toHaveBeenCalledWith(env, "group-a");
    expect(mockedNormalizeRecruitmentGroupPeriod).toHaveBeenCalledWith(recruitmentGroup as never);
    expect(result).toMatchObject({
      hideRecruitmentOpinions: true,
      canFilterRecruitmentOpinions: true,
    });
    expect(mockedGetHideRecruitmentOpinions).toHaveBeenCalledWith(env, null, { ctx });
    expect(mockedGetNestedContentComments).toHaveBeenCalledWith(env, "future-event", null, {
      hideRecruitmentOpinions: true,
      ctx,
    });
  });

  it("shows results to a signed-in viewer whose stored setting is off", async () => {
    mockedGetActiveSensei.mockResolvedValue({ id: 7, username: "sensei" } as never);
    mockedGetHideRecruitmentOpinions.mockResolvedValue(false);

    const result = await loadEventData();

    expect(result.hideRecruitmentOpinions).toBe(false);
  });

  it("passes the stored setting, not the session copy, to the event comment read", async () => {
    const currentUser = { id: 7, username: "sensei", hideRecruitmentOpinions: false };
    mockedGetActiveSensei.mockResolvedValue(currentUser as never);

    const result = await loadEventData();

    expect(result).toMatchObject({
      hideRecruitmentOpinions: true,
      canFilterRecruitmentOpinions: true,
    });
    expect(mockedGetNestedContentComments).toHaveBeenCalledWith(env, "future-event", currentUser, {
      hideRecruitmentOpinions: true,
      ctx,
    });
  });

  it("returns the genuine comment query failure state without exposing classifier state", async () => {
    mockedGetNestedContentComments.mockRejectedValue(new Error("database unavailable"));

    const result = await loadEventData();

    expect(result.commentsUnavailable).toBe(true);
    expect(result.allComments).toEqual([]);
  });

  it("redirects live events to their dedicated route", async () => {
    mockedGetTimelineContent.mockResolvedValue({
      ...timelineContent,
      contentType: "live",
      recruitmentGroupUid: null,
    } as never);

    const response = await loader(loaderArgs());

    if (!(response instanceof Response)) throw new Error("Expected a permanent redirect response");
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/lives/future-event");
    expect(mockedGetNestedContentComments).not.toHaveBeenCalled();
  });

  it("returns the explicit unavailable state when the strict recruitment lookup fails", async () => {
    const error = new Error("BAQL unavailable");
    mockedGetRecruitmentGroupByUidStrict.mockRejectedValue(error);

    const result = await loadEventData();

    expect(result.recruitmentUnavailable).toBe(true);
    expect(result.canFilterRecruitmentOpinions).toBe(false);
    expect(result.eventContent.recruitments).toEqual([]);
  });

  it("does not make overview recruitment availability depend on recruitment pool students", async () => {
    mockedGetRecruitmentPoolStudents.mockRejectedValue(new Error("unused recruitment pool failure"));

    const result = await loadEventData();

    expect(result.recruitmentUnavailable).toBe(false);
    expect(result.eventContent.recruitments).toEqual([]);
    expect(mockedGetRecruitmentPoolStudents).not.toHaveBeenCalled();
  });
});

describe("event recruitment period notice presentation", () => {
  it("renders the recruitment-period warning and sibling guidance", () => {
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
      hideRecruitmentOpinions: false,
      canFilterRecruitmentOpinions: true,
      allComments: [],
      commentsUnavailable: false,
      eventUid: "future-event",
      siblingEvents: [{ uid: "sibling-event", name: "동시 개최 이벤트" }],
      shopPortal: { status: "ready", since: "2030-01-10T00:00:00.000Z", until: "2030-01-20T00:00:00.000Z", currencies: [] },
      recruitmentUnavailable: false,
      minigameType: null,
      minigameUnavailable: false,
    } as never);

    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EventIndex)));
    const noticeIndex = markup.indexOf("모집 기간이 달라요 · 01/11 ~ 01/21");
    const siblingIndex = markup.indexOf("모집 동시 개최");

    expect(noticeIndex).toBeGreaterThanOrEqual(0);
    expect(siblingIndex).toBeGreaterThan(noticeIndex);
    expect(markup).toContain("role=\"status\"");
    expect(markup).not.toContain('role="alert"');
  });

  it("shows a disabled shop reason only once", () => {
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
        recruitmentGroupUid: null,
        recruitmentPeriod: null,
        recruitments: [],
      },
      signedIn: false,
      hideRecruitmentOpinions: false,
      canFilterRecruitmentOpinions: false,
      allComments: [],
      commentsUnavailable: false,
      eventUid: "future-event",
      siblingEvents: [],
      shopPortal: { status: "no-data", since: "2030-01-10T00:00:00.000Z", until: "2030-01-20T00:00:00.000Z", currencies: [] },
      recruitmentUnavailable: false,
      minigameType: null,
      minigameUnavailable: false,
    } as never);

    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EventIndex)));

    expect(markup.match(/상점이 없거나 정보를 준비 중이에요/g)).toHaveLength(1);
  });

  it("renders overview tool links with AsideLinks and no description lines", () => {
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
        recruitmentPeriod: null,
        recruitments: [],
      },
      signedIn: false,
      hideRecruitmentOpinions: false,
      canFilterRecruitmentOpinions: true,
      allComments: [],
      commentsUnavailable: false,
      eventUid: "future-event",
      siblingEvents: [],
      shopPortal: { status: "ready", since: "2030-01-10T00:00:00.000Z", until: "2030-01-20T00:00:00.000Z", currencies: [] },
      recruitmentUnavailable: false,
      minigameType: "card_flip",
      minigameUnavailable: false,
    } as never);

    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EventIndex)));
    const toolLinks = [...markup.matchAll(/<a\b[^>]*href="\/events\/future-event\/(?:shop|recruitment-simulator|shop\/card-flip)"[^>]*>[\s\S]*?<\/a>/g)].map(
      ([link]) => link,
    );

    expect(markup).toContain('aria-label="이벤트 도구"');
    expect(markup).toContain("rounded-lg bg-v2-surface p-2");
    expect(toolLinks).toHaveLength(3);
    expect(toolLinks.every((link) => link.includes("min-h-v2-row-min"))).toBe(true);
    expect(toolLinks.every((link) => !link.includes("text-xs"))).toBe(true);
    expect(markup).not.toContain("★3 학생 3명");
    expect(markup).not.toContain("01/10 ~ 01/20");
  });

  it("passes a verified future return state through overview tool links", () => {
    const entryKey = "future-overview-entry";
    const navigationState = createFutureDetailNavigationState(entryKey, "future-event");
    mockedUseVerifiedFutureDetailReturn.mockReturnValue({
      navigationState: navigationState.__mllg,
      verifiedFutureReturn: true,
    });
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
        recruitmentPeriod: null,
        recruitments: [],
      },
      signedIn: false,
      hideRecruitmentOpinions: false,
      canFilterRecruitmentOpinions: true,
      allComments: [],
      commentsUnavailable: false,
      eventUid: "future-event",
      siblingEvents: [],
      shopPortal: { status: "ready", since: "2030-01-10T00:00:00.000Z", until: "2030-01-20T00:00:00.000Z", currencies: [] },
      recruitmentUnavailable: false,
      minigameType: "card_flip",
      minigameUnavailable: false,
    } as never);

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [{ pathname: "/events/future-event", state: navigationState }] },
        createElement(EventIndex),
      ),
    );
    const toolLinks = [
      ...markup.matchAll(
        /<a\b[^>]*href="\/events\/future-event\/(?:shop|recruitment-simulator|shop\/card-flip)"[^>]*>[\s\S]*?<\/a>/g,
      ),
    ].map(([link]) => link);

    expect(toolLinks).toHaveLength(3);
    expect(toolLinks.every((link) => link.includes('data-link-state="'))).toBe(true);
    expect(toolLinks.every((link) => link.includes("future-event") && link.includes(entryKey))).toBe(true);
  });
});
