import { buildFurnitureCatalogView, type FurnitureCatalogView } from "~/domain/furniture-catalog-view";
import { getFurnitureCatalogSource } from "~/models/furniture-catalog";
import { getUserFurnitureInventoryMap } from "~/models/user-furniture-inventory";

export async function getFurnitureCatalogView(
  env: Env,
  userId: number | null,
  forceRefresh = false,
): Promise<FurnitureCatalogView> {
  const [catalog, ownedQuantities] = await Promise.all([
    getFurnitureCatalogSource(env, forceRefresh),
    userId === null ? Promise.resolve({}) : getUserFurnitureInventoryMap(env, userId),
  ]);
  return buildFurnitureCatalogView(catalog, ownedQuantities);
}
