import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "../../../app/auth/authenticator.server";
import { RecruitmentTypeEnum } from "../../../app/graphql/graphql";
import { getUserFavoritedStudents } from "../../../app/models/favorite-students";
import { addRecruitedStudentToResult } from "../../../app/models/recruitment-result.server";
import { action } from "../../../app/routes/api.recruitment-results";
import { getFutureContents } from "../../../app/views/futures";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/views/futures", () => ({
  getFutureContents: jest.fn(),
}));

jest.mock("~/models/favorite-students", () => ({
  getUserFavoritedStudents: jest.fn(),
}));

jest.mock("~/models/recruitment-result.server", () => ({
  addRecruitedStudentToResult: jest.fn(),
  deleteRecruitmentResult: jest.fn(),
  removeRecruitedStudentFromResult: jest.fn(),
  setRecruitmentResultCompletion: jest.fn(),
  upsertRecruitmentResult: jest.fn(),
}));

const env = {} as Env;
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetFutureContents = getFutureContents as jest.MockedFunction<typeof getFutureContents>;
const mockedGetUserFavoritedStudents = getUserFavoritedStudents as jest.MockedFunction<typeof getUserFavoritedStudents>;
const mockedAddRecruitedStudentToResult = addRecruitedStudentToResult as jest.MockedFunction<
  typeof addRecruitedStudentToResult
>;

type DataResult<T> = {
  type: "DataWithResponseInit";
  data: T;
  init: ResponseInit | null;
};

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function createActionArgs(body: Record<string, unknown>): Parameters<typeof action>[0] {
  return {
    request: new Request("https://mollulog.net/api/recruitment-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context: { cloudflare: { env } },
    params: {},
  } as never;
}

function futureRecruitmentContent({ recruitmentSince }: { recruitmentSince: string }) {
  return {
    uid: "content-a",
    contentUid: "timeline-content-a",
    recruitmentGroupUid: "group-a",
    recruitments: [
      {
        recruitmentType: RecruitmentTypeEnum.Usual,
        pickup: true,
        rerun: false,
        since: recruitmentSince,
        until: "2026-06-15T00:00:00.000Z",
        studentName: "히나",
        student: {
          uid: "hina",
          initialTier: 3,
        },
      },
    ],
  };
}

describe("api.recruitment-results", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-08T00:00:00.000Z").getTime());
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedAddRecruitedStudentToResult.mockResolvedValue({
      uid: "result-a",
      recruitmentGroupUid: "group-a",
      contentUid: "content-a",
      completedAt: "2026-06-08T00:00:00.000Z",
      recruitedStudents: [{ studentUid: "hina", tier: 3, pickup: true }],
      exchangedStudents: [],
    } as unknown as Awaited<ReturnType<typeof addRecruitedStudentToResult>>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows completeStudent after recruitment start for a favorited student", async () => {
    mockedGetFutureContents.mockResolvedValue([
      futureRecruitmentContent({ recruitmentSince: "2026-06-07T00:00:00.000Z" }),
    ] as unknown as Awaited<ReturnType<typeof getFutureContents>>);
    mockedGetUserFavoritedStudents.mockResolvedValue([
      { contentId: "content-a", studentId: "hina", uid: "favorite-a" },
    ] as Awaited<ReturnType<typeof getUserFavoritedStudents>>);

    const response = expectDataResult<{ success: boolean }>(
      await action(
        createActionArgs({
          action: "completeStudent",
          recruitmentGroupUid: "group-a",
          contentUid: "content-a",
          studentUid: "hina",
          tier: 3,
          pickup: true,
        }),
      ),
    );

    expect(response.init?.status ?? 200).toBe(200);
    expect(response.data.success).toBe(true);
    expect(mockedAddRecruitedStudentToResult).toHaveBeenCalledWith(env, 1, {
      recruitmentGroupUid: "group-a",
      contentUid: "content-a",
      studentUid: "hina",
      tier: 3,
      pickup: true,
    });
  });

  it("rejects completeStudent before recruitment start", async () => {
    mockedGetFutureContents.mockResolvedValue([
      futureRecruitmentContent({ recruitmentSince: "2026-06-09T00:00:00.000Z" }),
    ] as unknown as Awaited<ReturnType<typeof getFutureContents>>);
    mockedGetUserFavoritedStudents.mockResolvedValue([
      { contentId: "content-a", studentId: "hina", uid: "favorite-a" },
    ] as Awaited<ReturnType<typeof getUserFavoritedStudents>>);

    const response = expectDataResult<{ error: string }>(
      await action(
        createActionArgs({
          action: "completeStudent",
          recruitmentGroupUid: "group-a",
          contentUid: "content-a",
          studentUid: "hina",
        }),
      ),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("Recruitment completion is not allowed");
    expect(mockedAddRecruitedStudentToResult).not.toHaveBeenCalled();
  });

  it("rejects completeStudent for a non-favorited student even after recruitment start", async () => {
    mockedGetFutureContents.mockResolvedValue([
      futureRecruitmentContent({ recruitmentSince: "2026-06-07T00:00:00.000Z" }),
    ] as unknown as Awaited<ReturnType<typeof getFutureContents>>);
    mockedGetUserFavoritedStudents.mockResolvedValue([]);

    const response = expectDataResult<{ error: string }>(
      await action(
        createActionArgs({
          action: "completeStudent",
          recruitmentGroupUid: "group-a",
          contentUid: "content-a",
          studentUid: "hina",
        }),
      ),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("Recruitment completion is not allowed");
    expect(mockedAddRecruitedStudentToResult).not.toHaveBeenCalled();
  });
});
