import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResourceMap } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import { getSyncDraft, getSyncDraftBySourceRef } from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import { loader } from "~/routes/api.ocr.jobs.$jobUid";
import studentVideoResult from "../../fixtures/student-detail-video-result.v1.json";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/ocr-job", () => ({ getOcrJob: jest.fn() }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: jest.fn() }));
jest.mock("~/models/relationship-level", () => ({ getRelationshipLevels: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn() }));
jest.mock("~/models/sync-draft", () => ({ getSyncDraft: jest.fn(), getSyncDraftBySourceRef: jest.fn() }));
jest.mock("~/models/user-resource-inventory", () => ({ getUserResourceInventoryMapByItemUids: jest.fn() }));
jest.mock("~/models/item-catalog", () => ({
  getItemCatalogResourceDescriptionMap: jest.fn(),
  getItemCatalogResourceMap: jest.fn(),
}));

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetOcrJob = getOcrJob as jest.MockedFunction<typeof getOcrJob>;
const mockedGetRecruitedStudents = getRecruitedStudents as jest.MockedFunction<typeof getRecruitedStudents>;
const mockedGetRelationshipLevels = getRelationshipLevels as jest.MockedFunction<typeof getRelationshipLevels>;
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedGetSyncDraft = getSyncDraft as jest.MockedFunction<typeof getSyncDraft>;
const mockedGetSyncDraftBySourceRef = getSyncDraftBySourceRef as jest.MockedFunction<typeof getSyncDraftBySourceRef>;
const mockedGetInventory = getUserResourceInventoryMapByItemUids as jest.MockedFunction<
  typeof getUserResourceInventoryMapByItemUids
>;
const mockedGetCatalogMap = getItemCatalogResourceMap as jest.MockedFunction<typeof getItemCatalogResourceMap>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const env = {} as Env;
const ctx = { waitUntil: jest.fn() };

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

const job = {
  uid: "job-1",
  jobKind: "item_inventory_images_v1",
  status: "review_ready",
  generation: 3,
  progress: { completed: 2, failed: 1, total: 3 },
  images: [
    { uid: "failed", filename: "same.png", status: "failed", error: null },
    { uid: "succeeded-a", filename: "same.png", status: "succeeded", error: null },
    { uid: "succeeded-b", filename: "other.png", status: "succeeded", error: null },
  ],
  result: {
    images: [
      {
        filename: "same.png",
        observations: [
          {
            resource_uid: "100",
            quantity: 4,
            quantity_exact: true,
            candidates: [{ uid: "100", score: 0.99 }],
          },
        ],
      },
      { filename: "other.png", observations: [{ resource_uid: null, quantity: null }] },
    ],
  },
  artifacts: [],
  video: null,
  versions: { model: "m", catalog: "c", schema: "s" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-08T00:00:00.000Z",
};

describe("OCR job detail cell review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger);
    mockedGetOcrJob.mockResolvedValue(job as never);
    mockedGetRecruitedStudents.mockResolvedValue([] as never);
    mockedGetRelationshipLevels.mockResolvedValue([] as never);
    mockedGetAllStudentsMap.mockResolvedValue({} as never);
    mockedGetSyncDraftBySourceRef.mockResolvedValue(null);
    mockedGetInventory.mockResolvedValue({ "100": 1 });
    mockedGetCatalogMap.mockResolvedValue({
      "100": {
        uid: "100",
        inventoryUid: "100",
        name: "기존 아이템",
        rarity: 1,
        type: "item",
        category: null,
        subCategory: null,
      },
    } as never);
  });

  const args = () =>
    ({
      request: new Request("https://mollulog.net/api/ocr/jobs/job-1"),
      context: { cloudflare: { env, ctx } },
      params: { jobUid: "job-1" },
    }) as never;

  it("normalizes typed recognition before loading current quantities and rendering resources", async () => {
    const typedJob = structuredClone(job);
    typedJob.result.images[0].observations[0].resource_uid = "item:100";
    mockedGetOcrJob.mockResolvedValue(typedJob as never);
    const response = expectDataResult<{ cells: Array<Record<string, unknown>> }>(await loader(args()));
    expect(response.data.cells[0]).toMatchObject({
      itemUid: "100",
      currentQuantity: 1,
      resource: { uid: "100", name: "기존 아이템" },
    });
    expect(mockedGetInventory).toHaveBeenCalledWith(env, 7, ["100"]);
  });

  it("returns cells keyed by result index and observation position with imageUid", async () => {
    const response = expectDataResult<{ reviewMode: string; cells: Array<Record<string, unknown>> }>(
      await loader(args()),
    );
    expect(response.data.reviewMode).toBe("cells");
    expect(response.data.cells).toEqual([
      expect.objectContaining({
        imageIndex: 0,
        position: 0,
        imageUid: "succeeded-a",
        itemUid: "100",
        resource: {
          uid: "100",
          assetUid: "100",
          resourceType: "item",
          name: "기존 아이템",
          rarity: 1,
        },
        currentQuantity: 1,
      }),
      expect.objectContaining({ imageIndex: 1, position: 0, imageUid: "succeeded-b", itemUid: null }),
    ]);
    expect(response.data.cells[0]).not.toHaveProperty("candidates");
    expect(response.data).not.toHaveProperty("conflictImageUids");
    expect(mockedGetInventory).toHaveBeenCalledWith(env, 7, ["100"]);
  });

  it("returns an explicit unavailable review state when filename validation fails", async () => {
    mockedGetOcrJob.mockResolvedValue({
      ...job,
      result: { ...job.result, images: [{ ...job.result.images[0], filename: "wrong.png" }, job.result.images[1]] },
    } as never);
    const response = expectDataResult<{ reviewError: boolean; reviewMode?: string }>(await loader(args()));
    expect(response.data.reviewError).toBe(true);
    expect(response.data).not.toHaveProperty("reviewMode");
    expect(response.data).not.toHaveProperty("reviewModeReason");
  });

  it("reports only visually identical top-ranked choices without exposing candidate details", async () => {
    mockedGetOcrJob.mockResolvedValue({
      ...job,
      result: {
        ...job.result,
        images: [
          {
            ...job.result.images[0],
            observations: [
              {
                resource_uid: null,
                quantity: 575,
                quantity_exact: true,
                reasons: ["resource_visual_identity_ambiguous"],
                candidates: [
                  { uid: "100", score: 0.99 },
                  { uid: "101", score: 0.99 },
                  { uid: "102", score: 0.99 },
                  { uid: "other", score: 0.85 },
                ],
              },
            ],
          },
          job.result.images[1],
        ],
      },
    } as never);

    const response = expectDataResult<{ cells: Array<Record<string, unknown>> }>(await loader(args()));

    expect(response.data.cells[0]).toEqual(
      expect.objectContaining({
        itemUid: null,
        sameAppearanceCandidateCount: 3,
        sameAppearanceResource: expect.objectContaining({ uid: "100", assetUid: "100" }),
      }),
    );
    expect(response.data.cells[0]).not.toHaveProperty("candidates");
  });

  it("does not classify an in-progress job as an unavailable review", async () => {
    mockedGetOcrJob.mockResolvedValue({ ...job, status: "processing", result: null } as never);

    const response = expectDataResult<{ status: string; reviewError?: boolean; cells: unknown[] }>(
      await loader(args()),
    );

    expect(response.data.status).toBe("processing");
    expect(response.data.reviewError).toBeUndefined();
    expect(response.data.cells).toEqual([]);
  });

  it("keeps an unset current relationship rank null in a student OCR result", async () => {
    mockedGetOcrJob.mockResolvedValue({
      ...job,
      jobKind: "student_detail_video_v1",
      result: studentVideoResult,
    } as never);
    mockedGetRelationshipLevels.mockResolvedValue([
      { studentId: "10000", currentLevel: null, currentExp: null, targetLevel: null, items: {} },
    ] as never);
    mockedGetAllStudentsMap.mockResolvedValue({
      "10000": { uid: "10000", name: "Student A", initialTier: 3 },
    } as never);

    const response = expectDataResult<{
      currentStudentStates: Record<string, { bond: number | null }>;
    }>(await loader(args()));

    expect(response.data.currentStudentStates["10000"]?.bond).toBeNull();
  });

  it("returns the job with no result and an explicit flag when a stored student result cannot be read", async () => {
    mockedGetOcrJob.mockResolvedValue({
      ...job,
      jobKind: "student_detail_video_v1",
      result: { students: "not a list" },
    } as never);

    const response = expectDataResult<{
      result: unknown;
      resultInvalid: boolean;
      currentStudentStates: Record<string, unknown>;
    }>(await loader(args()));

    // Not a server failure: the client shows the unavailable state, and a retry cannot change the stored result.
    expect((response as unknown as { init?: { status?: number } }).init?.status ?? 200).toBe(200);
    expect(response.data).toMatchObject({ result: null, resultInvalid: true, currentStudentStates: {} });
    expect(logger.error).toHaveBeenCalledWith("Stored student video OCR result is invalid", expect.anything());
  });
});

describe("OCR job detail completion summary", () => {
  const appliedAt = "2026-01-02T00:00:00.000Z";

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger);
    mockedGetOcrJob.mockResolvedValue(job as never);
    mockedGetRecruitedStudents.mockResolvedValue([] as never);
    mockedGetRelationshipLevels.mockResolvedValue([] as never);
    mockedGetAllStudentsMap.mockResolvedValue({} as never);
    mockedGetInventory.mockResolvedValue({ "100": 1 });
    mockedGetCatalogMap.mockResolvedValue({
      "100": {
        uid: "100",
        inventoryUid: "100",
        name: "기존 아이템",
        rarity: 1,
        type: "item",
        category: null,
        subCategory: null,
      },
    } as never);
  });

  const args = () =>
    ({
      request: new Request("https://mollulog.net/api/ocr/jobs/job-1"),
      context: { cloudflare: { env, ctx } },
      params: { jobUid: "job-1" },
    }) as never;

  it("summarizes an applied item draft from its saved entries and reports the cells it did not cover", async () => {
    mockedGetSyncDraftBySourceRef.mockResolvedValue({ uid: "draft-1", status: "applied", appliedAt } as never);
    mockedGetSyncDraft.mockResolvedValue({
      uid: "draft-1",
      entries: [
        {
          entryKey: "100",
          value: 5,
          valueJson: null,
          meta: JSON.stringify({ cells: [{ imageIndex: 0, position: 0 }] }),
        },
      ],
    } as never);

    const response = expectDataResult<{ cells: unknown[]; completionSummary: unknown }>(await loader(args()));

    expect(mockedGetSyncDraft).toHaveBeenCalledWith(env, 7, "draft-1");
    expect(response.data.completionSummary).toEqual({
      appliedCount: 1,
      unappliedCellCount: response.data.cells.length - 1,
      items: [{ uid: "100", assetUid: "100", resourceType: "item", name: "기존 아이템", quantity: 5 }],
    });
  });

  it("returns no completion summary before the result is applied", async () => {
    mockedGetSyncDraftBySourceRef.mockResolvedValue(null);

    const response = expectDataResult<{ completionSummary: unknown; cells: unknown[] }>(await loader(args()));

    expect(response.data.completionSummary).toBeNull();
    expect(response.data.cells.length).toBeGreaterThan(0);
    expect(mockedGetSyncDraft).not.toHaveBeenCalled();
  });

  it("returns an explicit null summary when a saved entry cannot be read, instead of a guessed value", async () => {
    mockedGetSyncDraftBySourceRef.mockResolvedValue({ uid: "draft-1", status: "applied", appliedAt } as never);
    mockedGetSyncDraft.mockResolvedValue({
      uid: "draft-1",
      entries: [{ entryKey: "100", value: 5, valueJson: null, meta: "{not json" }],
    } as never);

    const response = expectDataResult<{ completionSummary: unknown }>(await loader(args()));

    expect(response.data.completionSummary).toBeNull();
  });

  it("summarizes an applied student draft with the applied and excluded students", async () => {
    const resultStudentUids = [...new Set(studentVideoResult.students.map(({ studentUid }) => studentUid))];
    const [appliedUid] = resultStudentUids;
    mockedGetOcrJob.mockResolvedValue({
      ...job,
      jobKind: "student_detail_video_v1",
      result: studentVideoResult,
    } as never);
    mockedGetSyncDraftBySourceRef.mockResolvedValue({ uid: "draft-2", status: "applied", appliedAt } as never);
    mockedGetSyncDraft.mockResolvedValue({
      uid: "draft-2",
      entries: [{ entryKey: appliedUid, value: 1, valueJson: "{}", meta: null }],
    } as never);
    mockedGetAllStudentsMap.mockResolvedValue({
      [appliedUid]: { uid: appliedUid, name: "첫 학생", initialTier: 1 },
    } as never);

    const response = expectDataResult<{ completionSummary: unknown }>(await loader(args()));

    expect(response.data.completionSummary).toEqual({
      appliedCount: 1,
      excludedCount: resultStudentUids.length - 1,
      applied: [{ uid: appliedUid, name: "첫 학생" }],
      excluded: resultStudentUids.slice(1).map((uid) => ({ uid, name: null })),
    });
  });
});
