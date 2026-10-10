import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ShopResource } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const mockGetItemCatalogResources = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetUserResourceInventoryMap = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetUserFurnitureInventoryMap = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/models/item-catalog", () => {
  const actual = jest.requireActual<typeof import("~/models/item-catalog")>("~/models/item-catalog");
  return { ...actual, getItemCatalogResources: mockGetItemCatalogResources };
});
jest.mock("~/models/user-resource-inventory", () => ({
  getUserResourceInventoryMap: mockGetUserResourceInventoryMap,
}));
jest.mock("~/models/user-furniture-inventory", () => ({
  getUserFurnitureInventoryMap: mockGetUserFurnitureInventoryMap,
}));

import { getEventShopOwnedQuantities } from "~/views/event-shop-owned-quantities";

const env = {} as Env;
const userId = 42;

function shopResource(uid: string, type: ResourceTypeEnum, resourceUid: string): ShopResource {
  const paymentResource = { type: ResourceTypeEnum.Currency, uid: "currency-1", name: "크레딧" };
  return {
    uid,
    resource: { type, uid: resourceUid, name: uid, rarity: 1 },
    resourceAmount: 1,
    paymentResource,
    purchaseTiers: [{ tierIndex: 1, startQuantity: 0, quantity: 1, unitPrice: 1, paymentResource }],
    shopAmount: 1,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetItemCatalogResources.mockResolvedValue([
    {
      uid: "3001",
      name: "아이템",
      rarity: 1,
      type: ResourceTypeEnum.Item,
      category: "normal",
      subCategory: "cd_item",
    },
    {
      uid: "3001",
      name: "장비",
      rarity: 1,
      type: ResourceTypeEnum.Equipment,
      category: "exp",
      subCategory: null,
    },
  ]);
  mockGetUserResourceInventoryMap.mockResolvedValue({ "3001": 123, "equipment:3001": 456 });
  mockGetUserFurnitureInventoryMap.mockResolvedValue({});
});

describe("getEventShopOwnedQuantities", () => {
  it("composes the catalog and inventories while keeping colliding item and equipment UIDs distinct", async () => {
    const quantities = await getEventShopOwnedQuantities(env, userId, [
      shopResource("shop-item", ResourceTypeEnum.Item, "3001"),
      shopResource("shop-equipment", ResourceTypeEnum.Equipment, "3001"),
    ]);

    expect(quantities).toEqual({ "shop-item": 123, "shop-equipment": 456 });
    expect(mockGetItemCatalogResources).toHaveBeenCalledWith(env);
    expect(mockGetUserResourceInventoryMap).toHaveBeenCalledWith(env, userId);
    expect(mockGetUserFurnitureInventoryMap).toHaveBeenCalledWith(env, userId);
  });
});
