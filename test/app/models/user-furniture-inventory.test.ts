import { describe, expect, it } from "@jest/globals";
import {
  MAX_USER_FURNITURE_INVENTORY_QUANTITY,
  parseUserFurnitureInventoryQuantity,
  saveUserFurnitureInventory,
  USER_FURNITURE_INVENTORY_QUANTITY_ERROR,
} from "~/models/user-furniture-inventory";

describe("parseUserFurnitureInventoryQuantity", () => {
  it.each([
    [0, 0],
    [1, 1],
    [" 12 ", 12],
    [MAX_USER_FURNITURE_INVENTORY_QUANTITY, MAX_USER_FURNITURE_INVENTORY_QUANTITY],
    [String(MAX_USER_FURNITURE_INVENTORY_QUANTITY), MAX_USER_FURNITURE_INVENTORY_QUANTITY],
  ])("accepts a PostgreSQL integer quantity %p", (input, expected) => {
    expect(parseUserFurnitureInventoryQuantity(input)).toBe(expected);
  });

  it.each([
    -1,
    1.5,
    "-1",
    "1.5",
    "",
    "2147483648",
    2_147_483_648,
    "9007199254740992",
    null,
  ])("rejects invalid quantity %p", (input) => {
    expect(() => parseUserFurnitureInventoryQuantity(input)).toThrow(USER_FURNITURE_INVENTORY_QUANTITY_ERROR);
  });

  it("rejects a value outside the PostgreSQL integer range before opening a database connection", async () => {
    await expect(
      saveUserFurnitureInventory({} as Env, 1, { furnitureUid: "chair", quantity: 2_147_483_648 }),
    ).rejects.toThrow(USER_FURNITURE_INVENTORY_QUANTITY_ERROR);
  });
});
