import { describe, expect, it } from "@jest/globals";
import { getOwnedGiftQuantities } from "~/components/features/relationship/FavoriteItemSelector";

describe("getOwnedGiftQuantities", () => {
  const favoriteItems = [{ item: { uid: "gift-a" } }, { item: { uid: "gift-b" } }, { item: { uid: "gift-c" } }];

  it("keeps only positive inventory quantities for gifts the selected student can receive", () => {
    expect(
      getOwnedGiftQuantities(favoriteItems, {
        "gift-a": 3,
        "gift-b": 0,
        "other-resource": 99,
      }),
    ).toEqual({ "gift-a": 3 });
  });

  it("returns an empty plan before gift or inventory data is available", () => {
    expect(getOwnedGiftQuantities(undefined, { "gift-a": 3 })).toEqual({});
    expect(getOwnedGiftQuantities(favoriteItems, null)).toEqual({});
  });
});
