import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<{ id: number; username: string } | null>>();
const mockGetPrimaryStudentUid = jest.fn<(env: Env, uid: string) => Promise<string | null>>();
const mockGetStudentGradeDetail = jest.fn<(env: Env, uid: string) => Promise<unknown>>();
const mockGetStudentGrading = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertStudentGrading = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockDeleteStudentGrading = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockGetStudentGradingsByStudentWithUsers = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockGetTagCountsByStudent = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const logger = { error: jest.fn() };

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/lib/observability.server", () => ({ getLogger: () => logger }));
jest.mock("~/models/student", () => ({
  getPrimaryStudentUid: mockGetPrimaryStudentUid,
  getStudentGradeDetail: mockGetStudentGradeDetail,
}));
jest.mock("~/models/student-grading.server", () => ({
  deleteStudentGrading: mockDeleteStudentGrading,
  getStudentGrading: mockGetStudentGrading,
  getStudentGradingsByStudentWithUsers: mockGetStudentGradingsByStudentWithUsers,
  upsertStudentGrading: mockUpsertStudentGrading,
}));
jest.mock("~/models/student-grading-tag.server", () => ({ getTagCountsByStudent: mockGetTagCountsByStudent }));

import { action as gradeAction, loader as gradeLoader } from "~/routes/students.$id.grade";
import { loader as gradingsLoader } from "~/routes/students.$id.gradings";

const env = {} as Env;

function args(uid: string, request: Request) {
  return { params: { id: uid }, context: { cloudflare: { env, ctx: undefined } }, request } as never;
}

function gradeRequest(fields: Record<string, string | string[]>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
  }
  return new Request("https://mollulog.test/students/form-2/grade", { method: "POST", body });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 7, username: "sensei" });
  mockGetPrimaryStudentUid.mockImplementation(async (_env, uid) => (uid === "form-2" ? "form-1" : uid));
  mockGetStudentGradeDetail.mockResolvedValue({ uid: "form-2", name: "폼 2" });
  mockGetStudentGrading.mockResolvedValue(null);
  mockGetStudentGradingsByStudentWithUsers.mockResolvedValue([]);
  mockGetTagCountsByStudent.mockResolvedValue([]);
});

describe("multiclass form gradings", () => {
  it("lists the gradings and tag counts of the primary form", async () => {
    await gradingsLoader(args("form-2", new Request("https://mollulog.test/students/form-2/gradings")));

    expect(mockGetTagCountsByStudent).toHaveBeenCalledWith(env, "form-1");
    expect(mockGetStudentGradingsByStudentWithUsers).toHaveBeenCalledWith(env, "form-1", true, 7);
  });

  it("loads the sensei's existing grading of the primary form", async () => {
    await gradeLoader(args("form-2", new Request("https://mollulog.test/students/form-2/grade")));

    expect(mockGetStudentGradeDetail).toHaveBeenCalledWith(env, "form-2");
    expect(mockGetStudentGrading).toHaveBeenCalledWith(env, 7, "form-1", true);
  });

  it("saves and deletes the grading under the primary form and returns to the form page", async () => {
    const saved = (await gradeAction(
      args("form-2", gradeRequest({ comment: "좋아요", tags: ["performance"] })),
    )) as Response;
    expect(mockUpsertStudentGrading).toHaveBeenCalledWith(env, 7, "form-1", "좋아요", ["performance"]);
    expect(saved.headers.get("Location")).toBe("/students/form-2");

    const deleted = (await gradeAction(args("form-2", gradeRequest({ intent: "delete" })))) as Response;
    expect(mockDeleteStudentGrading).toHaveBeenCalledWith(env, 7, "form-1");
    expect(deleted.headers.get("Location")).toBe("/students/form-2");
  });

  it("rejects a grading for a student BAQL does not have", async () => {
    mockGetPrimaryStudentUid.mockResolvedValue(null);

    const result = await gradeAction(args("missing", gradeRequest({ comment: "좋아요" })));
    expect(result).toEqual({ error: "존재하지 않는 학생이에요" });
    expect(mockUpsertStudentGrading).not.toHaveBeenCalled();

    await expect(
      gradingsLoader(args("missing", new Request("https://mollulog.test/students/missing/gradings"))),
    ).rejects.toMatchObject({ init: { status: 404 } });
    expect(mockGetStudentGradingsByStudentWithUsers).not.toHaveBeenCalled();
  });

  it("fails the gradings page instead of listing the form's own gradings when BAQL fails", async () => {
    mockGetPrimaryStudentUid.mockRejectedValueOnce(new Error("BAQL unavailable"));

    await expect(
      gradingsLoader(args("form-2", new Request("https://mollulog.test/students/form-2/gradings"))),
    ).rejects.toMatchObject({ init: { status: 500 } });
    expect(mockGetStudentGradingsByStudentWithUsers).not.toHaveBeenCalled();
  });

  it("does not save under the form uid when the primary form cannot be resolved", async () => {
    mockGetPrimaryStudentUid.mockRejectedValueOnce(new Error("BAQL unavailable"));

    const result = await gradeAction(args("form-2", gradeRequest({ comment: "좋아요" })));

    expect(result).toEqual({ error: "학생 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요" });
    expect(mockUpsertStudentGrading).not.toHaveBeenCalled();
  });
});
