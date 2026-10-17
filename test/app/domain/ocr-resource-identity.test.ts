import { describe, expect, it } from "@jest/globals";
import {
  buildOcrInventoryCatalogResources,
  buildOcrInventoryUidResolver,
  parseOcrInventoryResourceUid,
} from "~/domain/ocr-resource-identity";

describe("OCR resource identity", () => {
  it("keeps item UIDs and prefixes colliding equipment UIDs for stored inventory", () => {
    const resources = buildOcrInventoryCatalogResources([
      { uid: "23", type: "item", name: "엘리그마" },
      { uid: "23", type: "equipment", name: "티타늄 해머" },
      { uid: "101001", type: "equipment", name: "모자 설계도" },
    ]);

    expect(resources.map(({ inventoryUid, name }) => [inventoryUid, name])).toEqual([
      ["23", "엘리그마"],
      ["equipment:23", "티타늄 해머"],
      ["101001", "모자 설계도"],
    ]);
  });

  it("maps only matching typed resources and preserves unknown and legacy identities", () => {
    const resolve = buildOcrInventoryUidResolver(
      buildOcrInventoryCatalogResources([
        { uid: "23", type: "item" },
        { uid: "23", type: "equipment" },
        { uid: "101001", type: "equipment" },
      ]),
    );
    expect(
      ["item:23", "equipment:23", "equipment:101001", "23", "101001", "item:101001", "equipment:999"].map(resolve),
    ).toEqual(["23", "equipment:23", "101001", "23", "101001", "item:101001", "equipment:999"]);
  });

  it("parses a prefixed inventory UID without changing its asset UID", () => {
    expect(parseOcrInventoryResourceUid("equipment:23")).toEqual({
      inventoryUid: "equipment:23",
      sourceUid: "23",
      resourceType: "equipment",
    });
    expect(parseOcrInventoryResourceUid("23")).toEqual({
      inventoryUid: "23",
      sourceUid: "23",
      resourceType: null,
    });
  });
});
