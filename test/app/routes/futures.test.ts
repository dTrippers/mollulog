import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { getContentsCommentSummaries } from "~/models/content.server";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result.server";
import { loader } from "~/routes/futures";
import { getFutureContents } from "~/views/futures";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/content.server", () => ({
  getContentsCommentSummaries: jest.fn(),
}));

jest.mock("~/lib/observability.server", () => ({
  captureServerError: jest.fn(),
  getLogger: jest.fn(),
}));

jest.mock("~/models/favorite-students", () => ({
  getFavoritedCounts: jest.fn(),
  getUserFavoritedStudents: jest.fn(),
}));

jest.mock("~/models/recruitment-result.server", () => ({
  getRecruitmentResultsByRecruitmentGroupUids: jest.fn(),
}));

jest.mock("~/views/futures", () => ({
  getFutureContents: jest.fn(),
}));

const env = {} as Env;

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedCaptureServerError = captureServerError as jest.MockedFunction<typeof captureServerError>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetContentsCommentSummaries = getContentsCommentSummaries as jest.MockedFunction<
  typeof getContentsCommentSummaries
>;
const mockedGetFavoritedCounts = getFavoritedCounts as jest.MockedFunction<typeof getFavoritedCounts>;
const mockedGetUserFavoritedStudents = getUserFavoritedStudents as jest.MockedFunction<typeof getUserFavoritedStudents>;
const mockedGetRecruitmentResults = getRecruitmentResultsByRecruitmentGroupUids as jest.MockedFunction<
  typeof getRecruitmentResultsByRecruitmentGroupUids
>;
const mockedGetFutureContents = getFutureContents as jest.MockedFunction<typeof getFutureContents>;
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const span = { setAttribute: jest.fn() };
const ctx = {
  tracing: {
    enterSpan: jest.fn(
      async (_name: string, fn: (currentSpan: { setAttribute(name: string, value: unknown): void }) => unknown) =>
        fn(span),
    ),
  },
} as unknown as ExecutionContext;

function createLoaderArgs() {
  return {
    request: new Request("https://mollulog.net/futures.data"),
    context: { cloudflare: { env, ctx } },
    params: {},
  } as never;
}

describe("futures loader data source routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetFutureContents.mockResolvedValue([]);
    mockedGetLogger.mockReturnValue(logger);
    mockedGetContentsCommentSummaries.mockResolvedValue({});
    mockedGetFavoritedCounts.mockResolvedValue([]);
    mockedGetUserFavoritedStudents.mockResolvedValue([]);
    mockedGetRecruitmentResults.mockResolvedValue([]);
  });

  it("routes anonymous public aggregates through the PostgreSQL environment", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);

    const result = await loader(createLoaderArgs());

    expect(result).toMatchObject({
      signedIn: false,
      favoritedStudents: null,
      favoritedCounts: [],
      recruitmentResults: [],
      commentSummaries: { status: "available", summaries: {} },
    });
    expect(mockedGetFutureContents).toHaveBeenCalledWith(env, false, ctx);
    expect(mockedGetContentsCommentSummaries).toHaveBeenCalledWith(env, [], undefined, undefined, {
      hideRecruitmentOpinions: false,
      recruitmentPeriodStartAtByContentId: {},
      ctx,
    });
    expect(mockedGetFavoritedCounts).toHaveBeenCalledWith(env, [], { ctx });
    expect(mockedGetUserFavoritedStudents).not.toHaveBeenCalled();
    expect(mockedGetRecruitmentResults).not.toHaveBeenCalled();
  });

  it("keeps signed-in comment and personalized reads on primary", async () => {
    mockedGetActiveSensei.mockResolvedValue({ id: 42, uid: "sensei-42", username: "sensei" } as never);

    const result = await loader(createLoaderArgs());

    expect(result).toMatchObject({
      signedIn: true,
      favoritedStudents: [],
      favoritedCounts: [],
      recruitmentResults: [],
    });
    expect(mockedGetContentsCommentSummaries).toHaveBeenCalledWith(env, [], 42, undefined, {
      hideRecruitmentOpinions: false,
      recruitmentPeriodStartAtByContentId: {},
      ctx,
    });
    expect(mockedGetFutureContents).toHaveBeenCalledWith(env, false, ctx);
    expect(mockedGetFavoritedCounts).toHaveBeenCalledWith(env, [], { ctx });
    expect(mockedGetUserFavoritedStudents).toHaveBeenCalledWith(env, 42, undefined, { ctx });
    expect(mockedGetRecruitmentResults).toHaveBeenCalledWith(env, 42, []);
  });

  it("keeps the futures loader available when comment summaries fail", async () => {
    const error = new Error("PostgreSQL timeout");
    mockedGetActiveSensei.mockResolvedValue(null);
    mockedGetContentsCommentSummaries.mockRejectedValue(error);

    const result = await loader(createLoaderArgs());

    expect(result).toMatchObject({
      signedIn: false,
      favoritedStudents: null,
      favoritedCounts: [],
      recruitmentResults: [],
      commentSummaries: { status: "unavailable" },
    });
    expect(logger.error).toHaveBeenCalledWith("Failed to load futures comment summaries", error, {
      route: "futures.loader",
      operation: "comment_summaries",
      signedIn: false,
      contentCount: 0,
    });
    expect(mockedCaptureServerError).toHaveBeenCalledWith(error, {
      route: "futures.loader",
      operation: "comment_summaries",
      signedIn: false,
      contentCount: 0,
    });
    expect(span.setAttribute).toHaveBeenCalledWith("commentSummariesAvailable", false);
  });

  it("passes the normalized recruitment period through the loader without caching a notice", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);
    mockedGetFutureContents.mockResolvedValue([
      {
        uid: "future-event",
        name: "미래 이벤트",
        startAt: "2030-01-10T00:00:00.000Z",
        endAt: "2030-01-20T00:00:00.000Z",
        endless: false,
        contentType: "event",
        runType: "first",
        contentUid: "event-1",
        recruitmentGroupUid: "group-a",
        recruitmentPeriod: {
          startAt: "2030-01-11T00:00:00.000Z",
          endAt: "2030-01-21T00:00:00.000Z",
        },
        imageUrl: null,
        confirmed: true,
        isSpoiler: false,
        tags: [],
        recruitments: [],
      },
    ] as never);

    const result = await loader(createLoaderArgs());

    expect(result.contents[0]).toMatchObject({
      recruitmentGroupUid: "group-a",
      recruitmentPeriod: {
        startAt: "2030-01-11T00:00:00.000Z",
        endAt: "2030-01-21T00:00:00.000Z",
      },
    });
    expect(result.contents[0]).not.toHaveProperty("recruitmentPeriodNotice");
  });

  it("keeps saved filter changes connected to loader and open-thread refreshes", () => {
    const source = readFileSync("app/routes/futures.tsx", "utf8");

    expect(source).toContain("onHideRecruitmentOpinionsSaved={refreshCommentsAfterFilterSave}");
    expect(source).toContain("revalidator.revalidate()");
    expect(source).toContain("commentThreadFetcher.load(`/api/contents/");
    expect(source).toContain("openCommentContentUid}/comments`)");
  });

  it("closes the guest filter panel before opening the sign-in sheet", () => {
    const futuresSource = readFileSync("app/routes/futures.tsx", "utf8");
    const filterSource = readFileSync("app/components/features/futures/ContentFilterPanel.tsx", "utf8");
    const settingSource = readFileSync("app/components/features/account/RecruitmentOpinionSetting.tsx", "utf8");
    const pageSource = readFileSync("app/components/features/layout/Page.tsx", "utf8");

    expect(settingSource).toContain("if (onSignedOutToggle) onSignedOutToggle();");
    expect(filterSource).toContain("onSignedOutToggle={onSignedOutOpinionToggle}");
    expect(futuresSource).toContain("requestGuestOpinionSignIn");
    expect(futuresSource).toContain("panelCloseRequest={filterPanelCloseRequest > 0 ? filterPanelCloseRequest : null}");
    expect(futuresSource).toContain("onPanelCloseRequestHandled={showSignIn}");
    expect(pageSource).toContain("setOpenPanelIndex(null);");
    expect(pageSource).toContain("onPanelCloseRequestHandled?.();");
  });

  it("keeps the opinion setting as a flat filter row and keeps tutorial eligibility independent of notice display", () => {
    const panelSource = readFileSync("app/components/features/futures/ContentFilterPanel.tsx", "utf8");
    const settingSource = readFileSync("app/components/features/account/RecruitmentOpinionSetting.tsx", "utf8");
    const timelineSource = readFileSync("app/components/features/contents/ContentTimeline.tsx", "utf8");
    const itemSource = readFileSync("app/components/features/contents/ContentTimelineItem.tsx", "utf8");
    const tutorialSource = readFileSync("app/components/features/contents/recruitment-opinion-tutorial.ts", "utf8");

    expect(panelSource).not.toContain('PanelBodySection title="의견 표시"');
    expect(settingSource).toContain("모집 결과에 대한 의견글을 숨겨요.");
    expect(timelineSource).toContain("recruitmentPeriod={content.recruitmentPeriod}");
    expect(timelineSource).toContain("showRecruitmentPeriodNotice={showRecruitmentPeriodNotice}");
    expect(itemSource).toContain('message="모집 결과글을 숨길 수 있어요"');
    expect(itemSource).toContain('icon="eye-slash"');
    expect(itemSource).toContain("mobileActionInline");
    expect(itemSource).not.toContain('message="컨텐츠 필터에서 설정할 수 있어요."');
    expect(tutorialSource).toContain("mllg:feature:recruitment-opinion-filter:v1");
  });
});
