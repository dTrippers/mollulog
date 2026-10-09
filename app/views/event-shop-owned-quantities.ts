import type { ShopResource } from "~/domain/event-shop";
import { buildEventShopOwnedQuantities } from "~/domain/event-shop-owned-quantity";
import { buildOcrInventoryCatalogResources } from "~/domain/ocr-resource-identity";
import { getGrowthPlannerCatalogResources, getItemCatalogResources } from "~/models/item-catalog";
import { getUserFurnitureInventoryMap } from "~/models/user-furniture-inventory";
import { getUserResourceInventoryMap } from "~/models/user-resource-inventory";

export async function getEventShopOwnedQuantities(
  env: Env,
  userId: number,
  shopResources: ShopResource[],
): Promise<Record<string, number>> {
  const [catalogResources, resourceInventory, furnitureInventory] = await Promise.all([
    getItemCatalogResources(env),
    getUserResourceInventoryMap(env, userId),
    getUserFurnitureInventoryMap(env, userId),
  ]);

  const trackableResources = getGrowthPlannerCatalogResources(buildOcrInventoryCatalogResources(catalogResources));
  return buildEventShopOwnedQuantities({
    shopResources,
    trackableResources,
    resourceInventory,
    furnitureInventory,
  });
}
