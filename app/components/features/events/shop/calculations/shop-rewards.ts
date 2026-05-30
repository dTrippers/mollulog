import { ResourceTypeEnum } from "~/graphql/graphql";
import type { ShopResource } from "../types";
import { calculateEffectiveShopPurchaseCount } from "./shop-costs";

export type BoughtResourceQuantity = {
  resource: ShopResource["resource"];
  totalQuantity: number;
};

export function calculateBoughtResourceQuantities(
  shopResources: ShopResource[],
  itemQuantities: Record<string, number>,
  itemPurchaseDays: Record<string, number> = {},
): BoughtResourceQuantity[] {
  const resourceMap = new Map<string, BoughtResourceQuantity>();

  for (const shopResource of shopResources) {
    const { uid, resource, resourceAmount } = shopResource;
    const purchaseCount = itemQuantities[uid] || 0;
    const effectivePurchaseCount = calculateEffectiveShopPurchaseCount(
      shopResource,
      purchaseCount,
      itemPurchaseDays[uid] || 0,
    );
    if (effectivePurchaseCount <= 0) {
      continue;
    }

    const resourceKey = `${resource.type}:${resource.uid}`;
    const totalQuantity = effectivePurchaseCount * resourceAmount;
    const existingResource = resourceMap.get(resourceKey);
    if (existingResource) {
      existingResource.totalQuantity += totalQuantity;
    } else {
      resourceMap.set(resourceKey, {
        resource,
        totalQuantity,
      });
    }
  }

  return Array.from(resourceMap.values());
}

export function calculateBoughtItemQuantities(
  shopResources: ShopResource[],
  itemQuantities: Record<string, number>,
  itemPurchaseDays: Record<string, number> = {},
): Record<string, number> {
  const itemQuantitiesByUid: Record<string, number> = {};

  for (const { resource, totalQuantity } of calculateBoughtResourceQuantities(
    shopResources,
    itemQuantities,
    itemPurchaseDays,
  )) {
    if (resource.type !== ResourceTypeEnum.Item) {
      continue;
    }

    itemQuantitiesByUid[resource.uid] = (itemQuantitiesByUid[resource.uid] || 0) + totalQuantity;
  }

  return itemQuantitiesByUid;
}
