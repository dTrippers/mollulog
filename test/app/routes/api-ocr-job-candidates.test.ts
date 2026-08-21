import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResourceDescriptionMap, getItemCatalogResources } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import { loader } from "~/routes/api.ocr.jobs.$jobUid.candidates";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/item-catalog", () => ({
  getItemCatalogResourceDescriptionMap: jest.fn(),
  getItemCatalogResources: jest.fn(),
}));
jest.mock("~/models/ocr-job", () => ({ getOcrJob: jest.fn() }));
jest.mock("~/models/user-resource-inventory", () => ({ getUserResourceInventoryMapByItemUids: jest.fn() }));

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetItemCatalogResources = getItemCatalogResources as jest.MockedFunction<typeof getItemCatalogResources>;
const mockedGetDescriptions = getItemCatalogResourceDescriptionMap as jest.MockedFunction<
  typeof getItemCatalogResourceDescriptionMap
>;
const mockedGetOcrJob = getOcrJob as jest.MockedFunction<typeof getOcrJob>;
const mockedGetInventory = getUserResourceInventoryMapByItemUids as jest.MockedFunction<
  typeof getUserResourceInventoryMapByItemUids
>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const env = {} as Env;
const ctx = { waitUntil: jest.fn() };
const job = {
  uid: "job-1",
  jobKind: "item_inventory_images_v1",
  status: "review_ready",
  generation: 1,
  images: [{ uid: "image-1", filename: "screen.png", status: "succeeded" }],
  result: {
    images: [
      {
        filename: "screen.png",
        observations: [
          {
            resource_uid: "100",
            quantity: 2,
            quantity_exact: true,
            candidates: [
              { uid: "100", score: 0.99 },
              { uid: "200", score: 0.8 },
            ],
          },
        ],
      },
    ],
  },
};

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

describe("OCR candidate lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger);
    mockedGetOcrJob.mockResolvedValue(job as never);
    mockedGetItemCatalogResources.mockResolvedValue([
      { uid: "100", name: "기존 아이템", rarity: 1, type: "item", category: null, subCategory: null },
      { uid: "200", name: "후보 아이템", rarity: 2, type: "item", category: null, subCategory: null },
      { uid: "999", name: "검색 아이템", rarity: 3, type: "item", category: null, subCategory: null },
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
    mockedGetInventory.mockResolvedValue({ "23": 5, "100": 12, "200": 4, "999": 1, "equipment:23": 2 });
    mockedGetDescriptions.mockResolvedValue({
      "23": "엘리그마 설명",
      "100": "기존 아이템 설명",
      "200": "후보 아이템 설명",
      "999": "검색 아이템 설명",
      "equipment:23": "티타늄 해머 설명",
    });
  });

  it("returns the stored recognition before top-five candidates", async () => {
    const response = expectDataResult<{
      current: { uid: string; currentQuantity: number; description: string };
      candidates: Array<{ uid: string; currentQuantity: number; description: string }>;
    }>(
      await loader({
        request: new Request("https://mollulog.net/api/ocr/jobs/job-1/candidates?imageIndex=0&position=0"),
        context: { cloudflare: { env, ctx } },
        params: { jobUid: "job-1" },
      } as never),
    );
    expect(response.data.current.uid).toBe("100");
    expect(response.data.current.currentQuantity).toBe(12);
    expect(response.data.current.description).toBe("기존 아이템 설명");
    expect(response.data.candidates.map(({ uid }) => uid)).toEqual(["100", "200"]);
    expect(response.data.candidates.map(({ currentQuantity }) => currentQuantity)).toEqual([12, 4]);
    expect(response.data.candidates.map(({ description }) => description)).toEqual([
      "기존 아이템 설명",
      "후보 아이템 설명",
    ]);
  });

  it("supports lazy catalog search outside the OCR candidates", async () => {
    const response = expectDataResult<{
      candidates: Array<{ uid: string; selectionSource: string; currentQuantity: number; description: string }>;
    }>(
      await loader({
        request: new Request("https://mollulog.net/api/ocr/jobs/job-1/candidates?imageIndex=0&position=0&q=검색"),
        context: { cloudflare: { env, ctx } },
        params: { jobUid: "job-1" },
      } as never),
    );
    expect(response.data.candidates).toEqual([
      expect.objectContaining({
        uid: "999",
        description: "검색 아이템 설명",
        selectionSource: "catalog_search",
        currentQuantity: 1,
      }),
    ]);
  });

  it("keeps colliding item and equipment search results distinct", async () => {
    const itemResponse = expectDataResult<{
      candidates: Array<{ uid: string; assetUid: string; resourceType: string; name: string }>;
    }>(
      await loader({
        request: new Request("https://mollulog.net/api/ocr/jobs/job-1/candidates?imageIndex=0&position=0&q=엘리그마"),
        context: { cloudflare: { env, ctx } },
        params: { jobUid: "job-1" },
      } as never),
    );
    expect(itemResponse.data.candidates).toEqual([
      expect.objectContaining({ uid: "23", assetUid: "23", resourceType: "item", name: "엘리그마" }),
    ]);

    const equipmentResponse = expectDataResult<{
      candidates: Array<{ uid: string; assetUid: string; resourceType: string; name: string }>;
    }>(
      await loader({
        request: new Request("https://mollulog.net/api/ocr/jobs/job-1/candidates?imageIndex=0&position=0&q=티타늄"),
        context: { cloudflare: { env, ctx } },
        params: { jobUid: "job-1" },
      } as never),
    );
    expect(equipmentResponse.data.candidates).toEqual([
      expect.objectContaining({
        uid: "equipment:23",
        assetUid: "23",
        resourceType: "equipment",
        name: "티타늄 해머",
      }),
    ]);
  });

  it("returns a public retry message when the stored result cannot map to cells", async () => {
    mockedGetOcrJob.mockResolvedValue({
      ...job,
      result: { images: [{ filename: "wrong.png", observations: [] }] },
    } as never);

    const response = expectDataResult<{ error: string }>(
      await loader({
        request: new Request("https://mollulog.net/api/ocr/jobs/job-1/candidates?imageIndex=0&position=0"),
        context: { cloudflare: { env, ctx } },
        params: { jobUid: "job-1" },
      } as never),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("인식 결과를 확인하지 못했어요. 새로 업로드해 주세요.");
    expect(response.data.error).not.toContain("result_image_mapping_unusable");
  });
});
