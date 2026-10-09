import { describe, expect, it } from "@jest/globals";
import type { ShopResource } from "~/domain/event-shop";
import { buildEventShopOwnedQuantities } from "~/domain/event-shop-owned-quantity";
import { ResourceTypeEnum } from "~/graphql/graphql";

function shopResource(uid: string, type: ResourceTypeEnum, resourceUid = uid): ShopResource {
  const paymentResource = {
    type: ResourceTypeEnum.Currency,
    uid: "currency-1",
    name: "크레딧",
  };
  return {
    uid,
    resource: { type, uid: resourceUid, name: uid, rarity: 1 },
    resourceAmount: 1,
    paymentResource,
    purchaseTiers: [{ tierIndex: 1, startQuantity: 0, quantity: 1, unitPrice: 1, paymentResource }],
    shopAmount: 1,
  };
}

describe("buildEventShopOwnedQuantities", () => {
  it("maps trackable items and equipment by type and resource UID to the shop resource UID", () => {
    const result = buildEventShopOwnedQuantities({
      shopResources: [
        shopResource("shop-item", ResourceTypeEnum.Item, "3001"),
        shopResource("shop-equipment", ResourceTypeEnum.Equipment, "3001"),
      ],
      trackableResources: [
        { uid: "3001", type: ResourceTypeEnum.Item, inventoryUid: "3001" },
        { uid: "3001", type: ResourceTypeEnum.Equipment, inventoryUid: "equipment:3001" },
      ],
      resourceInventory: { "3001": 12, "equipment:3001": 34 },
      furnitureInventory: {},
    });

    expect(result).toEqual({ "shop-item": 12, "shop-equipment": 34 });
  });

  it("uses zero for a tracked resource without an inventory row and excludes untracked items and payments", () => {
    const result = buildEventShopOwnedQuantities({
      shopResources: [
        shopResource("shop-tracked", ResourceTypeEnum.Item, "3001"),
        shopResource("shop-missing-row", ResourceTypeEnum.Item, "3002"),
        shopResource("shop-untracked", ResourceTypeEnum.Item, "9000"),
        shopResource("shop-currency", ResourceTypeEnum.Currency, "currency-1"),
        shopResource("shop-emblem", ResourceTypeEnum.Emblem, "emblem-1"),
      ],
      trackableResources: [
        { uid: "3001", type: ResourceTypeEnum.Item, inventoryUid: "3001" },
        { uid: "3002", type: ResourceTypeEnum.Item, inventoryUid: "3002" },
      ],
      resourceInventory: { "3001": 7 },
      furnitureInventory: {},
    });

    expect(result).toEqual({ "shop-tracked": 7, "shop-missing-row": 0 });
  });

  it("includes registered furniture quantities, including zero, and omits unregistered furniture", () => {
    const result = buildEventShopOwnedQuantities({
      shopResources: [
        shopResource("shop-owned-furniture", ResourceTypeEnum.Furniture, "furniture-1"),
        shopResource("shop-missing-furniture", ResourceTypeEnum.Furniture, "furniture-2"),
      ],
      trackableResources: [],
      resourceInventory: {},
      furnitureInventory: { "furniture-1": 0 },
    });

    expect(result).toEqual({ "shop-owned-furniture": 0 });
  });
});
