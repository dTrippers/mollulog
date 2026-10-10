import { describe, expect, it } from "@jest/globals";
import { normalizeFurnitureCatalogItemSource } from "~/models/furniture-catalog";

const furniture = {
  uid: "furniture-1",
  name: " Sample chair ",
  imageUrl: " https://assets.test/furniture.webp ",
  rarity: 4,
  category: "furnitures",
  subCategory: "chair",
  tags: [],
  interactionStudents: [{ uid: "student-1", name: " Student One " }],
};

describe("normalizeFurnitureCatalogItemSource", () => {
  it("normalizes required display fields and confirmed classification values", () => {
    expect(normalizeFurnitureCatalogItemSource(furniture)).toEqual({
      ...furniture,
      name: "Sample chair",
      imageUrl: "https://assets.test/furniture.webp",
      interactionStudents: [{ uid: "student-1", name: "Student One" }],
    });
  });

  it.each([0, 5, -1])("rejects unsupported upstream rarity %p", (rarity) => {
    expect(() => normalizeFurnitureCatalogItemSource({ ...furniture, rarity })).toThrow("unsupported rarity");
  });

  it("rejects unsupported upstream categories", () => {
    expect(() => normalizeFurnitureCatalogItemSource({ ...furniture, category: "future_category" })).toThrow(
      "unsupported category",
    );
  });

  it("fails when the authoritative image URL is missing", () => {
    expect(() => normalizeFurnitureCatalogItemSource({ ...furniture, imageUrl: "  " })).toThrow(
      "missing its name or image URL",
    );
  });
});
