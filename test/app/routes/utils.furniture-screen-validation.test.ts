import { describe, expect, it } from "@jest/globals";
import {
  getEmptyFurnitureInventoryInputBehavior,
  isImageAlreadyBroken,
  isValidFurnitureInventoryQuantityInput,
} from "~/routes/utils.furniture._components/FurnitureCatalogScreen";

describe("furniture screen input and image boundaries", () => {
  it.each([
    ["0", true],
    ["2147483647", true],
    ["2147483648", false],
    ["3000000000", false],
    ["1.5", false],
    ["", false],
  ])("validates inventory quantity %p without clamping", (value, valid) => {
    expect(isValidFurnitureInventoryQuantityInput(value)).toBe(valid);
  });

  it("recognizes a complete image with no natural width as already broken", () => {
    expect(isImageAlreadyBroken({ complete: true, naturalWidth: 0 })).toBe(true);
    expect(isImageAlreadyBroken({ complete: true, naturalWidth: 48 })).toBe(false);
    expect(isImageAlreadyBroken({ complete: false, naturalWidth: 0 })).toBe(false);
    expect(isImageAlreadyBroken(null)).toBe(false);
  });

  it("distinguishes an unsaved empty draft from an empty draft after save has started or data already exists", () => {
    expect(getEmptyFurnitureInventoryInputBehavior({ storedQuantity: undefined, saveInFlight: false })).toBe(
      "reset-unregistered",
    );
    expect(getEmptyFurnitureInventoryInputBehavior({ storedQuantity: undefined, saveInFlight: true })).toBe(
      "wait-for-save",
    );
    expect(getEmptyFurnitureInventoryInputBehavior({ storedQuantity: 0, saveInFlight: false })).toBe("keep-invalid");
    expect(getEmptyFurnitureInventoryInputBehavior({ storedQuantity: 3, saveInFlight: true })).toBe("keep-invalid");
  });
});
