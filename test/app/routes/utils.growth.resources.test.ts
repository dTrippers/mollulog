import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn();
const mockGetItemCatalogResources = jest.fn();
const mockGetUserResourceInventoryMap = jest.fn();
const mockUpsertUserResourceInventories = jest.fn();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: mockGetActiveSensei,
}));

jest.mock("~/repositories/item-catalog", () => ({
  getGrowthPlannerCatalogResources: jest.fn((resources) => resources),
  getItemCatalogResources: mockGetItemCatalogResources,
}));

jest.mock("~/models/user-resource-inventory", () => ({
  getUserResourceInventoryMap: mockGetUserResourceInventoryMap,
  parseUserResourceInventoryQuantity: jest.fn((value) => Number(value)),
  upsertUserResourceInventories: mockUpsertUserResourceInventories,
}));

jest.mock("~/models/relationship-level", () => ({
  getRelationshipLevels: jest.fn(),
}));

import { action } from "../../../app/routes/utils.growth.resources";

const env = {} as Env;

describe("utils.growth.resources action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveSensei.mockResolvedValue({ id: 1 } as never);
    mockGetUserResourceInventoryMap.mockResolvedValue({} as never);
  });

  it("saves equipment inventory changes even when BAQL all-equipment catalog is empty", async () => {
    const catalogWithoutEquipments = [
      {
        uid: "10",
        name: "초급 활동 보고서",
        rarity: 1,
        type: "item",
        category: "character_exp_growth",
        subCategory: null,
      },
    ];
    mockGetItemCatalogResources.mockResolvedValue(catalogWithoutEquipments as never);

    const response = await action({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/utils/growth/resources", {
        method: "POST",
        body: JSON.stringify({
          items: [{ itemUid: "101001", quantity: 12 }],
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    } as never);

    expect(mockGetItemCatalogResources).toHaveBeenCalledTimes(1);
    expect(mockGetItemCatalogResources).toHaveBeenCalledWith(env);
    expect(mockUpsertUserResourceInventories).toHaveBeenCalledWith(env, 1, [{ itemUid: "101001", quantity: 12 }]);
    expect(response).toMatchObject({ data: { saved: true } });
  });
});
