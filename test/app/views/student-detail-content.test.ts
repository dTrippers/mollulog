import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getPublishedInlineKnowledgeEntries } from "~/models/knowledge-entry.server";
import { getPublishedStudentSummary } from "~/models/student-summary.server";
import { getStudentDetailContent } from "~/views/student-detail-content.server";

jest.mock("~/models/knowledge-entry.server", () => ({ getPublishedInlineKnowledgeEntries: jest.fn() }));
jest.mock("~/models/student-summary.server", () => ({ getPublishedStudentSummary: jest.fn() }));

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as Env;
const mockGetPublishedInlineKnowledgeEntries = getPublishedInlineKnowledgeEntries as jest.MockedFunction<
  typeof getPublishedInlineKnowledgeEntries
>;
const mockGetPublishedStudentSummary = getPublishedStudentSummary as jest.MockedFunction<
  typeof getPublishedStudentSummary
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPublishedStudentSummary.mockResolvedValue(null);
  mockGetPublishedInlineKnowledgeEntries.mockResolvedValue([]);
});

describe("student detail content view", () => {
  it("distinguishes a successful empty glossary from a failed glossary lookup", async () => {
    const empty = await getStudentDetailContent(env, "student-1");
    expect(empty).toMatchObject({
      knowledgeEntries: [],
      knowledgeLookupStatus: "available",
      knowledgeLookupError: null,
    });

    const failure = new Error("database details stay server-side");
    mockGetPublishedInlineKnowledgeEntries.mockRejectedValueOnce(failure);
    const failed = await getStudentDetailContent(env, "student-1");

    expect(failed).toMatchObject({
      knowledgeEntries: [],
      knowledgeLookupStatus: "failed",
      knowledgeLookupError: failure,
    });
    expect(failed.publishedSummary).toBeNull();
    expect(mockGetPublishedInlineKnowledgeEntries).toHaveBeenCalledTimes(2);
  });

  it("keeps the independent published summary when glossary lookup fails", async () => {
    const summary = { summary: "공포 효과를 활용해요", publishedAt: "2026-09-26T00:00:00.000Z" };
    mockGetPublishedStudentSummary.mockResolvedValueOnce(summary);
    mockGetPublishedInlineKnowledgeEntries.mockRejectedValueOnce(new Error("unavailable"));

    const result = await getStudentDetailContent(env, "student-1");

    expect(result.publishedSummary).toEqual(summary);
    expect(result.knowledgeLookupStatus).toBe("failed");
  });
});
