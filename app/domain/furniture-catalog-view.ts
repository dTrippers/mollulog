import {
  type FurnitureCatalogItem,
  type FurnitureCatalogProgress,
  getFurnitureCatalogProgress,
  getFurnitureInventoryStatus,
} from "~/domain/furniture-catalog";
import type { FurnitureCatalogSource } from "~/models/furniture-catalog";

export type FurnitureCatalogViewItem = FurnitureCatalogItem;

export type FurnitureCatalogViewTheme = FurnitureCatalogSource["themes"][number] & {
  items: FurnitureCatalogViewItem[];
  progress: FurnitureCatalogProgress;
};

export type FurnitureCatalogView = {
  items: FurnitureCatalogViewItem[];
  themes: FurnitureCatalogViewTheme[];
  ownedQuantities: Record<string, number>;
};

export function buildFurnitureCatalogView(
  source: FurnitureCatalogSource,
  ownedQuantities: Record<string, number>,
): FurnitureCatalogView {
  const themeUidsByFurniture = new Map<string, string[]>();
  for (const theme of source.themes) {
    for (const furnitureUid of new Set(theme.furnitureUids)) {
      const themeUids = themeUidsByFurniture.get(furnitureUid) ?? [];
      themeUids.push(theme.uid);
      themeUidsByFurniture.set(furnitureUid, themeUids);
    }
  }

  const itemsByUid = new Map<string, FurnitureCatalogViewItem>();
  const items = source.furnitures.map((furniture) => {
    const quantity = ownedQuantities[furniture.uid];
    const item = {
      ...furniture,
      themeUids: themeUidsByFurniture.get(furniture.uid) ?? [],
      quantity: quantity ?? null,
      status: getFurnitureInventoryStatus(quantity),
    };
    itemsByUid.set(furniture.uid, item);
    return item;
  });

  const themes = source.themes.map((theme) => {
    const themeItems = [...new Set(theme.furnitureUids)].map((furnitureUid) => {
      const item = itemsByUid.get(furnitureUid);
      if (!item) throw new Error(`BAQL furniture theme ${theme.uid} references unknown furniture ${furnitureUid}`);
      return item;
    });
    return {
      ...theme,
      items: themeItems,
      progress: getFurnitureCatalogProgress(theme.furnitureUids, ownedQuantities),
    };
  });

  return { items, themes, ownedQuantities };
}
