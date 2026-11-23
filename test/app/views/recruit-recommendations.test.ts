import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RecruitRecommendationCall } from "~/models/recruit-recommendation.server";
import type { RecruitRecommendationAnswer } from "~/models/recruit-recommendation-contract";
import type { FutureContent } from "~/views/futures";
import {
  collectRecommendationPickups,
  loadRecruitMarks,
  loadRecruitRecommendations,
} from "~/views/recruit-recommendations.server";

const mockGetRecruitedStudents = jest.fn<(env: Env, userId: number) => Promise<{ studentUid: string }[]>>();
const mockGetRecruitmentResultsByRecruitmentGroupUids =
  jest.fn<
    (
      env: Env,
      userId: number,
      uids: string[],
    ) => Promise<
      {
        completedAt: string | null;
        recruitedStudents: { studentUid: string }[];
        exchangedStudents: { studentUid: string }[];
      }[]
    >
  >();
const mockGetAllStudentsMap =
  jest.fn<(env: Env, includeUnreleased: boolean) => Promise<Record<string, { name: string }>>>();
const mockGetRecruitRecommendations = jest.fn<(env: Env, request: unknown) => Promise<RecruitRecommendationCall>>();

jest.mock("~/models/recruited-student", () => ({
  getRecruitedStudents: (...args: never[]) => (mockGetRecruitedStudents as (...a: never[]) => unknown)(...args),
}));
jest.mock("~/models/recruitment-result.server", () => ({
  getRecruitmentResultsByRecruitmentGroupUids: (...args: never[]) =>
    (mockGetRecruitmentResultsByRecruitmentGroupUids as (...a: never[]) => unknown)(...args),
}));
jest.mock("~/models/student", () => ({
  getAllStudentsMap: (...args: never[]) => (mockGetAllStudentsMap as (...a: never[]) => unknown)(...args),
}));
jest.mock("~/models/recruit-recommendation.server", () => ({
  getRecruitRecommendations: (...args: never[]) =>
    (mockGetRecruitRecommendations as (...a: never[]) => unknown)(...args),
}));

const env = {} as Env;
const now = "2026-11-24T00:00:00.000Z";

function recruitment(studentUid: string | null, overrides: Record<string, unknown> = {}) {
  return {
    student: studentUid ? { uid: studentUid } : null,
    pickup: true,
    since: "2026-11-25T02:00:00.000Z",
    until: "2026-12-02T02:00:00.000Z",
    ...overrides,
  };
}

function content(overrides: Record<string, unknown>): FutureContent {
  return { endAt: "2026-12-02T02:00:00.000Z", recruitmentGroupUid: "group-1", recruitments: [], ...overrides } as never;
}

function answer(overrides: Partial<RecruitRecommendationAnswer> = {}): RecruitRecommendationAnswer {
  return {
    goal: "top",
    computedAt: now,
    students: [],
    pickups: [
      { studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z", aiRecommended: true },
      { studentUid: "10002", startAt: "2026-11-25T02:00:00.000Z", aiRecommended: true },
      { studentUid: "10003", startAt: "2026-11-25T02:00:00.000Z", aiRecommended: false },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRecruitedStudents.mockResolvedValue([{ studentUid: "10001" }]);
  mockGetRecruitmentResultsByRecruitmentGroupUids.mockResolvedValue([
    { completedAt: "2026-11-25T03:00:00.000Z", recruitedStudents: [{ studentUid: "10002" }], exchangedStudents: [] },
    { completedAt: null, recruitedStudents: [{ studentUid: "10003" }], exchangedStudents: [] },
  ]);
  mockGetAllStudentsMap.mockResolvedValue({ "10009": { name: "아루" } });
  mockGetRecruitRecommendations.mockResolvedValue({ ok: true, answer: answer() });
});

describe("recruit recommendation pickups", () => {
  it("asks for every open pickup student once, skipping ended contents, ended pickups, and non-pickups", () => {
    const pickups = collectRecommendationPickups(
      [
        content({ endAt: "2026-11-20T00:00:00.000Z", recruitments: [recruitment("10009")] }),
        content({
          recruitments: [
            recruitment("10001"),
            recruitment("10001"),
            recruitment("10002", { until: "2026-11-23T00:00:00.000Z" }),
            recruitment("10003", { pickup: false }),
            recruitment(null),
          ],
        }),
        content({ endAt: null, recruitments: [recruitment("10001", { since: "2027-01-05T02:00:00.000Z" })] }),
      ],
      now,
    );

    expect(pickups).toEqual([
      { studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z" },
      { studentUid: "10001", startAt: "2027-01-05T02:00:00.000Z" },
    ]);
  });
});

describe("recruit recommendation view", () => {
  const contents = [content({ recruitments: [recruitment("10001")] })];

  it("joins the 학생부 students and the completed results as recruited", async () => {
    const view = await loadRecruitRecommendations(env, { goal: "top", userId: 7, contents });

    expect(view).toMatchObject({ status: "ok", recruited: "available" });
    expect(view.status === "ok" && [...view.recruitedStudentUids].sort()).toEqual(["10001", "10002"]);
    expect(mockGetRecruitmentResultsByRecruitmentGroupUids).toHaveBeenCalledWith(env, 7, ["group-1"]);
  });

  it("reads no records for a guest", async () => {
    const view = await loadRecruitRecommendations(env, { goal: "top", userId: null, contents });

    expect(view).toMatchObject({ status: "ok", recruited: "guest", recruitedStudentUids: [] });
    expect(mockGetRecruitedStudents).not.toHaveBeenCalled();
  });

  it("reports a failed record read and still answers, marked unavailable", async () => {
    mockGetRecruitedStudents.mockRejectedValue(new Error("db down"));
    const onRecruitedReadFailure = jest.fn();

    const view = await loadRecruitRecommendations(env, { goal: "top", userId: 7, contents, onRecruitedReadFailure });

    expect(view).toMatchObject({ status: "ok", recruited: "unavailable", recruitedStudentUids: [] });
    expect(onRecruitedReadFailure).toHaveBeenCalledTimes(1);
  });

  it("is unavailable when the service fails", async () => {
    mockGetRecruitRecommendations.mockResolvedValue({ ok: false, reason: "unavailable" });

    await expect(loadRecruitRecommendations(env, { goal: "top", userId: null, contents })).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("names the substitutes and drops a tag whose student is unknown", async () => {
    mockGetRecruitRecommendations.mockResolvedValue({
      ok: true,
      answer: answer({
        students: [
          {
            studentUid: "10001",
            tags: [
              { kind: "substitute", value: "대체", substituteStudentUid: "10009", sourceCount: 2 },
              { kind: "substitute", value: "대체", substituteStudentUid: "99999", sourceCount: 2 },
              { kind: "content", value: "총력전", sourceCount: 2 },
            ],
            recommendation: {
              verdict: { kind: "general", level: 2, evidence: "window" },
              tileBosses: [],
              bosses: [],
              communityLevel: null,
              growth: null,
              newbie: null,
            },
          },
        ],
      }),
    });
    const onUnknownSubstitute = jest.fn();

    const view = await loadRecruitRecommendations(env, { goal: "top", userId: null, contents, onUnknownSubstitute });

    expect(view.status === "ok" && view.substituteNames).toEqual({ "10009": "아루" });
    expect(view.status === "ok" && view.answer.students[0].tags.map((tag) => tag.substituteStudentUid)).toEqual([
      "10009",
      undefined,
    ]);
    expect(onUnknownSubstitute).toHaveBeenCalledWith("99999");
  });
});

describe("미래시 recruit marks view", () => {
  const contents = [content({ recruitments: [recruitment("10001")] })];

  it("marks the recommended pickups of students not recruited", async () => {
    await expect(loadRecruitMarks(env, { goal: "top", userId: 7, contents })).resolves.toEqual({
      status: "ok",
      marks: [],
    });
    mockGetRecruitedStudents.mockResolvedValue([]);
    mockGetRecruitmentResultsByRecruitmentGroupUids.mockResolvedValue([]);
    await expect(loadRecruitMarks(env, { goal: "top", userId: 7, contents })).resolves.toEqual({
      status: "ok",
      marks: [
        { studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z" },
        { studentUid: "10002", startAt: "2026-11-25T02:00:00.000Z" },
      ],
    });
  });

  it("hides every mark when the records or the service cannot be read", async () => {
    mockGetRecruitedStudents.mockRejectedValue(new Error("db down"));
    const onRecruitedReadFailure = jest.fn();
    await expect(loadRecruitMarks(env, { goal: "top", userId: 7, contents, onRecruitedReadFailure })).resolves.toEqual({
      status: "hidden",
    });
    expect(onRecruitedReadFailure).toHaveBeenCalledTimes(1);
    expect(mockGetRecruitRecommendations).not.toHaveBeenCalled();

    mockGetRecruitRecommendations.mockResolvedValue({ ok: false, reason: "unexpected_result" });
    const onServiceFailure = jest.fn();
    await expect(loadRecruitMarks(env, { goal: "top", userId: null, contents, onServiceFailure })).resolves.toEqual({
      status: "hidden",
    });
    expect(onServiceFailure).toHaveBeenCalledTimes(1);
  });
});
