import { describe, expect, it } from "@jest/globals";
import { equipmentCategoryImageUrl } from "~/routes/$username.futures._components/FuturePlan";

describe("FuturePlan equipment category image URLs", () => {
  it.each(["hat", "bag", "shoes"])('uses the existing category asset path for "%s"', (category) => {
    expect(equipmentCategoryImageUrl(category)).toBe(
      `https://assets.mollulog.net/assets/images/equipments/${category}`,
    );
  });

  it("does not turn a category into a numeric resource URL", () => {
    expect(equipmentCategoryImageUrl("hat")).not.toContain("/images/resources/equipments/");
    expect(equipmentCategoryImageUrl("hat")).not.toContain(".webp");
  });
});
