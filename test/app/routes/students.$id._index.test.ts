import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(env: Env, request: Request) => Promise<{ id: number } | null>>();
const mockGetStudentDetailData = jest.fn<(env: Env, uid: string) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(env: Env, senseiId: number) => Promise<unknown[]>>();
const mockGetRelationshipLevels =
  jest.fn<(env: Env, senseiId: number, studentIds: readonly string[]) => Promise<unknown[]>>();
const mockGetAllRaidSchedules = jest.fn<(env: Env) => Promise<unknown[]>>();
const mockGetStudentGradingsByStudentWithUsers =
  jest.fn<(env: Env, studentUid: string, includeTags: boolean, viewerUserId?: number) => Promise<unknown[]>>();
const mockGetTagCountsByStudent = jest.fn<(env: Env, studentUid: string) => Promise<unknown[]>>();
const mockGetTimelineContentsByRecruitmentGroupUids =
  jest.fn<(env: Env, recruitmentGroupUids: string[], options: { ctx?: unknown }) => Promise<unknown[]>>();
const mockGetStudentDetailContent =
  jest.fn<
    (
      env: Env,
      studentUid: string,
      options: { ctx?: unknown },
    ) => Promise<{
      publishedSummary: { summary: string; publishedAt: string } | null;
      publishedSummaryError: unknown | null;
      knowledgeEntries: Array<{ title: string; aliases: string[]; body: string }>;
      knowledgeLookupStatus: "available" | "failed";
      knowledgeLookupError: unknown | null;
    }>
  >();
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: mockGetActiveSensei,
}));

jest.mock("~/models/student", () => ({
  getStudentDetailData: mockGetStudentDetailData,
}));

jest.mock("~/models/recruited-student", () => ({
  getRecruitedStudents: mockGetRecruitedStudents,
}));

jest.mock("~/models/relationship-level", () => ({
  getRelationshipLevels: mockGetRelationshipLevels,
}));

jest.mock("~/models/raid", () => ({
  getAllRaidSchedules: mockGetAllRaidSchedules,
}));

jest.mock("~/models/student-grading.server", () => ({
  getStudentGradingsByStudentWithUsers: mockGetStudentGradingsByStudentWithUsers,
}));

jest.mock("~/models/student-grading-tag.server", () => ({
  getTagCountsByStudent: mockGetTagCountsByStudent,
}));

jest.mock("~/models/timeline-content.server", () => ({
  getTimelineContentsByRecruitmentGroupUids: mockGetTimelineContentsByRecruitmentGroupUids,
}));

jest.mock("~/views/student-detail-content.server", () => ({
  getStudentDetailContent: mockGetStudentDetailContent,
}));

jest.mock("~/lib/observability.server", () => ({
  getLogger: () => logger,
}));

import { loader } from "~/routes/students.$id._index";

const env = {} as Env;

function createLoaderArgs() {
  return {
    params: { id: "student-a" },
    context: { cloudflare: { env, ctx: undefined } },
    request: new Request("https://mollulog.test/students/student-a"),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 1 });
  mockGetStudentDetailData.mockResolvedValue({
    studentCatalog: {},
    student: {
      uid: "student-a",
      released: true,
      recruitments: [],
      studentVariant: { primaryStudent: { uid: "student-a" } },
      character: { studentVariants: [{ primaryStudent: { uid: "student-a" } }] },
    },
  });
  mockGetRecruitedStudents.mockResolvedValue([]);
  mockGetRelationshipLevels.mockResolvedValue([]);
  mockGetAllRaidSchedules.mockResolvedValue([]);
  mockGetStudentGradingsByStudentWithUsers.mockResolvedValue([]);
  mockGetTagCountsByStudent.mockResolvedValue([]);
  mockGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([]);
  mockGetStudentDetailContent.mockResolvedValue({
    publishedSummary: null,
    publishedSummaryError: null,
    knowledgeEntries: [],
    knowledgeLookupStatus: "available",
    knowledgeLookupError: null,
  });
});

describe("student detail loader published summary", () => {
  it("logs the read failure and omits the AI summary instead of failing the loader", async () => {
    const failure = new Error("Hyperdrive unavailable");
    mockGetStudentDetailContent.mockResolvedValueOnce({
      publishedSummary: null,
      publishedSummaryError: failure,
      knowledgeEntries: [],
      knowledgeLookupStatus: "available",
      knowledgeLookupError: null,
    });

    const result = await loader(createLoaderArgs());

    expect(result.publishedSummary).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to load published student summary",
      failure,
      expect.objectContaining({ studentUid: "student-a" }),
    );
  });

  it("omits the AI summary when no revision is published", async () => {
    mockGetStudentDetailContent.mockResolvedValueOnce({
      publishedSummary: null,
      publishedSummaryError: null,
      knowledgeEntries: [],
      knowledgeLookupStatus: "available",
      knowledgeLookupError: null,
    });

    const result = await loader(createLoaderArgs());

    expect(result.publishedSummary).toBeNull();
    expect(result.knowledgeLookupStatus).toBe("available");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("passes the published summary through to the loader data", async () => {
    const published = {
      summary: "게릴라 유닛 운영이 뛰어난 학생이에요",
      publishedAt: "2026-09-18T09:00:00.000Z",
    };
    const knowledgeEntries = [{ title: "공포", aliases: ["공포"], body: "행동을 막는 상태 효과예요." }];
    mockGetStudentDetailContent.mockResolvedValueOnce({
      publishedSummary: published,
      publishedSummaryError: null,
      knowledgeEntries,
      knowledgeLookupStatus: "available",
      knowledgeLookupError: null,
    });

    const result = await loader(createLoaderArgs());

    expect(result.publishedSummary).toEqual(published);
    expect(result.knowledgeEntries).toEqual(knowledgeEntries);
    expect(mockGetStudentDetailContent).toHaveBeenCalledWith(env, "student-a", { ctx: undefined });
  });

  it("keeps the page and student text while exposing a distinct glossary read failure", async () => {
    const failure = new Error("database details stay server-side");
    mockGetStudentDetailContent.mockResolvedValueOnce({
      publishedSummary: null,
      publishedSummaryError: null,
      knowledgeEntries: [],
      knowledgeLookupStatus: "failed",
      knowledgeLookupError: failure,
    });

    const result = await loader(createLoaderArgs());

    expect(result.student.uid).toBe("student-a");
    expect(result.knowledgeEntries).toEqual([]);
    expect(result.knowledgeLookupStatus).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("database details stay server-side");
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to load published knowledge terms",
      failure,
      expect.objectContaining({ studentUid: "student-a" }),
    );
  });
});
