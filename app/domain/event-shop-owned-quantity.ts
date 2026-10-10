import type { ShopResource } from "~/domain/event-shop";
import type { OcrInventoryCatalogResource } from "~/domain/ocr-resource-identity";
import { ResourceTypeEnum } from "~/graphql/graphql";

type TrackableResource = OcrInventoryCatalogResource<{
  uid: string;
  type: ResourceTypeEnum;
}>;

type BuildEventShopOwnedQuantitiesInput = {
  shopResources: ShopResource[];
  trackableResources: TrackableResource[];
  resourceInventory: Record<string, number>;
  furnitureInventory: Record<string, number>;
};

export function buildEventShopOwnedQuantities({
  shopResources,
  trackableResources,
  resourceInventory,
  furnitureInventory,
}: BuildEventShopOwnedQuantitiesInput): Record<string, number> {
  const trackableResourceByIdentity = new Map(
    trackableResources.map((resource) => [`${resource.type}:${resource.uid}`, resource]),
  );
  const ownedQuantities: Record<string, number> = {};

  for (const shopResource of shopResources) {
    const { type, uid: resourceUid } = shopResource.resource;
    if (type === ResourceTypeEnum.Item || type === ResourceTypeEnum.Equipment) {
      const trackableResource = trackableResourceByIdentity.get(`${type}:${resourceUid}`);
      if (trackableResource) {
        ownedQuantities[shopResource.uid] = resourceInventory[trackableResource.inventoryUid] ?? 0;
      }
      continue;
    }

    if (type === ResourceTypeEnum.Furniture) {
      const quantity = furnitureInventory[resourceUid];
      if (quantity !== undefined) {
        ownedQuantities[shopResource.uid] = quantity;
      }
    }
  }

  return ownedQuantities;
}
