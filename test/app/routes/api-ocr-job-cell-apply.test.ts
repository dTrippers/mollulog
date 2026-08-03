import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { createAndApplySyncDraft, getSyncDraftBySourceRef } from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import { action } from "~/routes/api.ocr.jobs.$jobUid.apply";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/item-catalog", () => ({ getItemCatalogResources: jest.fn() }));
jest.mock("~/models/ocr-job", () => ({ getOcrJob: jest.fn() }));
jest.mock("~/models/sync-draft", () => ({ createAndApplySyncDraft: jest.fn(), getSyncDraftBySourceRef: jest.fn() }));
jest.mock("~/models/user-resource-inventory", () => ({ getUserResourceInventoryMapByItemUids: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn() }));

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetItemCatalogResources = getItemCatalogResources as jest.MockedFunction<typeof getItemCatalogResources>;
const mockedGetOcrJob = getOcrJob as jest.MockedFunction<typeof getOcrJob>;
const mockedCreateAndApply = createAndApplySyncDraft as jest.MockedFunction<typeof createAndApplySyncDraft>;
const mockedGetDraft = getSyncDraftBySourceRef as jest.MockedFunction<typeof getSyncDraftBySourceRef>;
const mockedGetInventory = getUserResourceInventoryMapByItemUids as jest.MockedFunction<
  typeof getUserResourceInventoryMapByItemUids
>;
const env = {} as Env;
const ctx = { waitUntil: jest.fn() };
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const job = {
  uid: "job-1",
  jobKind: "item_inventory_images_v1",
  status: "review_ready",
  generation: 4,
  images: [{ uid: "image-1", filename: "screen.png", status: "succeeded" }],
  result: {
    images: [
      {
        filename: "screen.png",
        observations: [
          { resource_uid: "100", quantity: 2, quantity_exact: true, candidates: [{ uid: "100", score: 0.9 }] },
          { resource_uid: "200", quantity: 3, quantity_exact: true, candidates: [{ uid: "200", score: 0.8 }] },
          { resource_uid: null, quantity: null, quantity_exact: false, candidates: [] },
        ],
      },
    ],
  },
  versions: { model: "m", catalog: "c", schema: "s" },
};

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function createArgs(body: unknown) {
  return {
    request: new Request("https://mollulog.net/api/ocr/jobs/job-1/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context: { cloudflare: { env, ctx } },
    params: { jobUid: "job-1" },
  } as never;
}

describe("OCR cell apply", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger);
    mockedGetOcrJob.mockResolvedValue(job as never);
    mockedGetDraft.mockResolvedValue(null);
    mockedGetItemCatalogResources.mockResolvedValue([
      { uid: "100", name: "A", rarity: 1, type: "item", category: null, subCategory: null },
      { uid: "200", name: "B", rarity: 1, type: "item", category: null, subCategory: null },
      { uid: "300", name: "C", rarity: 1, type: "item", category: null, subCategory: null },
      { uid: "23", name: "엘리그마", rarity: 1, type: "item", category: "coin", subCategory: null },
      {
        uid: "23",
        name: "티타늄 해머",
        rarity: 4,
        type: "equipment",
        category: "weapon_exp_growth_b",
        subCategory: null,
      },
    ] as never);
    mockedGetInventory.mockResolvedValue({ "100": 1, "200": 3, "300": 0, "equipment:23": 0 });
    mockedCreateAndApply.mockResolvedValue({
      draft: { status: "applied", appliedAt: "2026-01-01T00:00:00.000Z" },
      alreadyApplied: false,
    } as never);
  });

  it("rejects a stale generation before applying", async () => {
    const response = expectDataResult<{ error: string }>(
      await action(createArgs({ resultGeneration: 3, cells: [{ imageIndex: 0, position: 0, quantity: 2 }] })),
    );
    expect(response.init?.status).toBe(409);
    expect(mockedCreateAndApply).not.toHaveBeenCalled();
  });

  it("partially applies safe changed cells and reports omitted duplicates", async () => {
    const response = expectDataResult<{ summary: { applicableChanged: number; duplicateUids: string[] } }>(
      await action(
        createArgs({
          resultGeneration: 4,
          cells: [
            { imageIndex: 0, position: 0, quantity: 2 },
            { imageIndex: 0, position: 1, itemUid: "100", quantity: 3 },
            { imageIndex: 0, position: 2, itemUid: "300", quantity: 7 },
          ],
        }),
      ),
    );
    expect(response.init?.status).toBe(201);
    expect(response.data.summary).toMatchObject({ applicableChanged: 1, duplicateUids: ["100"] });
    expect(mockedCreateAndApply).toHaveBeenCalledWith(
      env,
      7,
      expect.objectContaining({ entries: [expect.objectContaining({ entryKey: "300", value: 7 })] }),
    );
  });

  it("applies untouched safe cells when the sparse patch array is empty", async () => {
    const response = expectDataResult<{ summary: { applicableChanged: number } }>(
      await action(createArgs({ resultGeneration: 4, cells: [] })),
    );

    expect(response.init?.status).toBe(201);
    expect(response.data.summary.applicableChanged).toBe(1);
    expect(mockedCreateAndApply).toHaveBeenCalledWith(
      env,
      7,
      expect.objectContaining({ entries: [expect.objectContaining({ entryKey: "100", value: 2 })] }),
    );
  });

  it("accepts a type-prefixed equipment UID when the catalog source UID collides", async () => {
    await action(
      createArgs({
        resultGeneration: 4,
        cells: [{ imageIndex: 0, position: 2, itemUid: "equipment:23", quantity: 4 }],
      }),
    );

    expect(mockedCreateAndApply).toHaveBeenCalledWith(
      env,
      7,
      expect.objectContaining({
        entries: expect.arrayContaining([expect.objectContaining({ entryKey: "equipment:23", value: 4 })]),
      }),
    );
  });

  it("rejects unknown catalog UIDs and duplicate patch addresses", async () => {
    const unknown = expectDataResult<{ error: string }>(
      await action(createArgs({ resultGeneration: 4, cells: [{ imageIndex: 0, position: 2, itemUid: "999" }] })),
    );
    expect(unknown.init?.status).toBe(400);
    const duplicate = expectDataResult<{ error: string }>(
      await action(
        createArgs({
          resultGeneration: 4,
          cells: [
            { imageIndex: 0, position: 2, quantity: 1 },
            { imageIndex: 0, position: 2, quantity: 2 },
          ],
        }),
      ),
    );
    expect(duplicate.init?.status).toBe(400);
  });
});
