import { describe, expect, it } from "@jest/globals";
import {
  FURNITURE_CATEGORY_LABELS,
  FURNITURE_RARITY_LABELS,
  filterFurnitureCatalogItems,
  getFurnitureCatalogProgress,
  getFurnitureInventoryStatus,
  groupFurnitureCatalogItems,
  parseFurnitureCategory,
  parseFurnitureRarity,
} from "~/domain/furniture-catalog";

describe("furniture catalog inventory state", () => {
  it("distinguishes unregistered, confirmed zero, and owned quantities", () => {
    expect(getFurnitureInventoryStatus(undefined)).toBe("unregistered");
    expect(getFurnitureInventoryStatus(0)).toBe("not-owned");
    expect(getFurnitureInventoryStatus(1)).toBe("owned");
    expect(getFurnitureInventoryStatus(10)).toBe("owned");
  });

  it("counts collected furniture kinds rather than quantity and keeps unknown items visible", () => {
    expect(
      getFurnitureCatalogProgress(["chair", "chair", "table", "lamp"], {
        chair: 10,
        table: 0,
      }),
    ).toEqual({ ownedKinds: 1, totalKinds: 3, notOwnedKinds: 1, unregisteredKinds: 1 });
  });

  it("filters only confirmed zero-quantity furniture as not owned", () => {
    const items = [
      { name: "Oak Chair", themeUids: ["cafe"], status: "owned" as const },
      { name: "Oak Table", themeUids: ["cafe"], status: "not-owned" as const },
      { name: "Lamp", themeUids: [], status: "unregistered" as const },
    ];

    expect(filterFurnitureCatalogItems(items, { query: "oak", notOwnedOnly: true })).toEqual([items[1]]);
    expect(filterFurnitureCatalogItems(items, { themeUid: "cafe" })).toEqual(items.slice(0, 2));
    expect(filterFurnitureCatalogItems(items, { query: "LAMP" })).toEqual([items[2]]);
  });
});

describe("furniture catalog display data", () => {
  it("groups furniture by category in the approved display order", () => {
    const chair = { uid: "chair", category: "furnitures" as const };
    const lamp = { uid: "lamp", category: "decorations" as const };
    const wallpaper = { uid: "wallpaper", category: "interiors" as const };

    expect(groupFurnitureCatalogItems([lamp, wallpaper, chair])).toEqual([
      { category: "furnitures", items: [chair] },
      { category: "decorations", items: [lamp] },
      { category: "interiors", items: [wallpaper] },
    ]);
  });

  it("uses Korean labels for verified top-level categories and the canonical rarity labels", () => {
    expect(parseFurnitureCategory("furnitures")).toBe("furnitures");
    expect(parseFurnitureCategory("decorations")).toBe("decorations");
    expect(parseFurnitureCategory("interiors")).toBe("interiors");
    expect(FURNITURE_CATEGORY_LABELS).toEqual({
      decorations: "장식",
      furnitures: "가구",
      interiors: "인테리어",
    });
    expect(FURNITURE_RARITY_LABELS).toEqual({ 1: "N", 2: "R", 3: "SR", 4: "SSR" });
  });

  it("rejects unknown category and rarity values rather than returning raw or empty labels", () => {
    expect(() => parseFurnitureCategory("future_category")).toThrow("unsupported category");
    expect(() => parseFurnitureRarity(5)).toThrow("unsupported rarity");
  });
});
