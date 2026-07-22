import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { getContentsCommentSummaries } from "~/models/content";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result";
import { loader } from "~/routes/futures";
import { getFutureContents } from "~/views/futures";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/content", () => ({
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

jest.mock("~/models/recruitment-result", () => ({
  getRecruitmentResultsByRecruitmentGroupUids: jest.fn(),
}));

jest.mock("~/views/futures", () => ({
  getFutureContents: jest.fn(),
}));

const sessionDb = {} as D1DatabaseSession;
const primaryDb = {
  withSession: jest.fn(() => sessionDb),
} as unknown as D1Database;
const env = { DB: primaryDb } as Env;

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

  it("routes anonymous public aggregates through a first-unconstrained session", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);

    const result = await loader(createLoaderArgs());

    expect(result).toMatchObject({
      signedIn: false,
      favoritedStudents: null,
      favoritedCounts: [],
      recruitmentResults: [],
      commentSummaries: { status: "available", summaries: {} },
    });
    expect(primaryDb.withSession).toHaveBeenCalledWith("first-unconstrained");
    expect(mockedGetFutureContents).toHaveBeenCalledWith(env, false, ctx);
    expect(mockedGetContentsCommentSummaries.mock.calls[0][0].DB).toBe(sessionDb);
    expect(mockedGetContentsCommentSummaries).toHaveBeenCalledWith(
      expect.anything(),
      [],
      undefined,
      expect.any(Function),
    );
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
    expect(mockedGetContentsCommentSummaries).toHaveBeenCalledWith(env, [], 42, expect.any(Function));
    expect(mockedGetFutureContents).toHaveBeenCalledWith(env, false, ctx);
    expect(mockedGetFavoritedCounts).toHaveBeenCalledWith(env, [], { ctx });
    expect(mockedGetUserFavoritedStudents).toHaveBeenCalledWith(env, 42, undefined, { ctx });
    expect(mockedGetRecruitmentResults).toHaveBeenCalledWith(env, 42, [], expect.any(Function));
    expect(mockedGetContentsCommentSummaries.mock.calls[0][3]).toBe(mockedGetRecruitmentResults.mock.calls[0][3]);
  });

  it("keeps the futures loader available when comment summaries fail", async () => {
    const error = new Error("D1 timeout");
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
});
