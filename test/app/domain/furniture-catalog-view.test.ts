import { describe, expect, it } from "@jest/globals";
import { buildFurnitureCatalogView } from "~/domain/furniture-catalog-view";
import type { FurnitureCatalogSource } from "~/models/furniture-catalog";

const source: FurnitureCatalogSource = {
  furnitures: [
    {
      uid: "chair",
      name: "Chair",
      imageUrl: "https://assets.test/chair.webp",
      rarity: 1,
      category: "furnitures",
      subCategory: "Chair",
      tags: [],
    },
    {
      uid: "table",
      name: "Table",
      imageUrl: "https://assets.test/table.webp",
      rarity: 2,
      category: "furnitures",
      subCategory: "Table",
      tags: [],
    },
    {
      uid: "lamp",
      name: "Lamp",
      imageUrl: "https://assets.test/lamp.webp",
      rarity: 3,
      category: "decorations",
      subCategory: "Lamp",
      tags: [],
    },
  ],
  themes: [
    {
      uid: "cafe",
      name: "Cafe set",
      description: null,
      previews: [
        {
          uid: "cafe-preview",
          title: "Cafe",
          imageUrl: "https://assets.test/cafe.webp",
          thumbnailUrl: "https://assets.test/cafe-small.webp",
        },
      ],
      furnitureUids: ["chair", "table", "chair"],
    },
  ],
};

describe("furniture catalog view composition", () => {
  it("uses explicit theme membership, deduplicates types, and preserves inventory status", () => {
    const view = buildFurnitureCatalogView(source, { chair: 8, table: 0 });
    const theme = view.themes[0];

    expect(theme.items.map((item) => item.uid)).toEqual(["chair", "table"]);
    expect(theme.progress).toEqual({ ownedKinds: 1, totalKinds: 2, notOwnedKinds: 1, unregisteredKinds: 0 });
    expect(view.items.find((item) => item.uid === "chair"))?.toMatchObject({ quantity: 8, status: "owned" });
    expect(view.items.find((item) => item.uid === "table"))?.toMatchObject({ quantity: 0, status: "not-owned" });
    expect(view.items.find((item) => item.uid === "lamp"))?.toMatchObject({ quantity: null, status: "unregistered" });
  });

  it("fails explicitly when a theme membership references missing furniture", () => {
    const invalidSource = {
      ...source,
      themes: [{ ...source.themes[0], furnitureUids: ["missing"] }],
    };

    expect(() => buildFurnitureCatalogView(invalidSource, {})).toThrow("references unknown furniture missing");
  });
});
