export type FurnitureInventoryStatus = "unregistered" | "not-owned" | "owned";

export const FURNITURE_CATEGORY_LABELS = {
  decorations: "장식",
  furnitures: "가구",
  interiors: "인테리어",
} as const;

export type FurnitureCategory = keyof typeof FURNITURE_CATEGORY_LABELS;

export const FURNITURE_RARITY_LABELS = {
  1: "N",
  2: "R",
  3: "SR",
  4: "SSR",
} as const;

export type FurnitureRarity = keyof typeof FURNITURE_RARITY_LABELS;

export function parseFurnitureCategory(category: string): FurnitureCategory {
  if (Object.hasOwn(FURNITURE_CATEGORY_LABELS, category)) {
    return category as FurnitureCategory;
  }
  throw new Error(`BAQL furniture catalog contains unsupported category: ${category}`);
}

export function parseFurnitureRarity(rarity: number): FurnitureRarity {
  if (Object.hasOwn(FURNITURE_RARITY_LABELS, rarity)) {
    return rarity as FurnitureRarity;
  }
  throw new Error(`BAQL furniture catalog contains unsupported rarity: ${rarity}`);
}

export type FurnitureCatalogItem = {
  uid: string;
  name: string;
  imageUrl: string;
  rarity: FurnitureRarity;
  category: FurnitureCategory;
  subCategory: string | null;
  tags: string[];
  themeUids: string[];
  quantity: number | null;
  status: FurnitureInventoryStatus;
};

export function groupFurnitureCatalogItems<T extends Pick<FurnitureCatalogItem, "category">>(items: T[]) {
  const categoryOrder: FurnitureCategory[] = ["furnitures", "decorations", "interiors"];
  return categoryOrder
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category),
    }))
    .filter(({ items: categoryItems }) => categoryItems.length > 0);
}

export type FurnitureCatalogProgress = {
  ownedKinds: number;
  totalKinds: number;
  notOwnedKinds: number;
  unregisteredKinds: number;
};

export type FurnitureCatalogFilter = {
  query?: string;
  themeUid?: string | null;
  categories?: FurnitureCategory[];
  rarities?: FurnitureRarity[];
};

export function getFurnitureInventoryStatus(quantity: number | undefined): FurnitureInventoryStatus {
  if (quantity === undefined) return "unregistered";
  return quantity > 0 ? "owned" : "not-owned";
}

export function getFurnitureCatalogProgress(
  furnitureUids: string[],
  ownedQuantities: Record<string, number>,
): FurnitureCatalogProgress {
  const uniqueFurnitureUids = new Set(furnitureUids);
  let ownedKinds = 0;
  let notOwnedKinds = 0;
  let unregisteredKinds = 0;

  for (const uid of uniqueFurnitureUids) {
    const quantity = ownedQuantities[uid];
    if (quantity === undefined) {
      unregisteredKinds += 1;
    } else if (quantity > 0) {
      ownedKinds += 1;
    } else {
      notOwnedKinds += 1;
    }
  }

  return {
    ownedKinds,
    totalKinds: uniqueFurnitureUids.size,
    notOwnedKinds,
    unregisteredKinds,
  };
}

export function filterFurnitureCatalogItems<
  T extends Pick<FurnitureCatalogItem, "name" | "themeUids"> &
    Partial<Pick<FurnitureCatalogItem, "category" | "rarity">>,
>(
  items: T[],
  filter: FurnitureCatalogFilter,
): T[] {
  const query = filter.query?.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (query && !item.name.toLocaleLowerCase().includes(query)) return false;
    if (filter.themeUid && !item.themeUids.includes(filter.themeUid)) return false;
    if (filter.categories?.length && (!item.category || !filter.categories.includes(item.category))) return false;
    if (filter.rarities?.length && (item.rarity === undefined || !filter.rarities.includes(item.rarity))) return false;
    return true;
  });
}
