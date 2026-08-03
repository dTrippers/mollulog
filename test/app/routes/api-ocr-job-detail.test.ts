import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResourceMap } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { getSyncDraftBySourceRef } from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import { loader } from "~/routes/api.ocr.jobs.$jobUid";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/ocr-job", () => ({ getOcrJob: jest.fn() }));
jest.mock("~/models/sync-draft", () => ({ getSyncDraftBySourceRef: jest.fn() }));
jest.mock("~/models/user-resource-inventory", () => ({ getUserResourceInventoryMapByItemUids: jest.fn() }));
jest.mock("~/models/item-catalog", () => ({
  getItemCatalogResourceDescriptionMap: jest.fn(),
  getItemCatalogResourceMap: jest.fn(),
}));

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetOcrJob = getOcrJob as jest.MockedFunction<typeof getOcrJob>;
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
    mockedGetSyncDraftBySourceRef.mockResolvedValue(null);
    mockedGetInventory.mockResolvedValue({ "100": 1 });
    mockedGetCatalogMap.mockResolvedValue({
      "100": { uid: "100", name: "기존 아이템", rarity: 1, type: "item", category: null, subCategory: null },
    } as never);
  });

  const args = () =>
    ({
      request: new Request("https://mollulog.net/api/ocr/jobs/job-1"),
      context: { cloudflare: { env, ctx } },
      params: { jobUid: "job-1" },
    }) as never;

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
    expect(mockedGetInventory).toHaveBeenCalledWith(env, 7, ["100"]);
  });

  it("selects legacy mode when filename validation fails", async () => {
    mockedGetOcrJob.mockResolvedValue({
      ...job,
      result: { ...job.result, images: [{ ...job.result.images[0], filename: "wrong.png" }, job.result.images[1]] },
    } as never);
    const response = expectDataResult<{ reviewMode: string; reviewModeReason: string }>(await loader(args()));
    expect(response.data.reviewMode).toBe("legacy");
    expect(response.data.reviewModeReason).toBe("result_image_mapping_unusable");
  });
});
