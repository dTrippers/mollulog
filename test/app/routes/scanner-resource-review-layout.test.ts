import { describe, expect, it } from "@jest/globals";
import { buildImageReviewSlots } from "../../../app/routes/scanner.resource._components/resource-review-layout";

describe("resource scanner review layout", () => {
  it("uses image positions instead of the server item order and preserves unresolved cells", () => {
    const items = [
      { resource_uid: "300", source_images: ["screen-5.png"] },
      { resource_uid: "100", source_images: ["screen-5.png"] },
      { resource_uid: "200", source_images: ["screen-5.png"] },
    ];
    const components = [
      {
        placements: [{ filename: "screen-5.png", start: 10, cell_count: 5 }],
        positions: [
          { position: 10, resource_uid: "200" },
          { position: 11, resource_uid: null },
          { position: 12, resource_uid: "300" },
          { position: 13, resource_uid: "missing" },
          { position: 14, resource_uid: "100" },
        ],
      },
    ];

    expect(buildImageReviewSlots(components, items, "screen-5.png")).toEqual([
      { position: 0, itemIndex: 2 },
      { position: 1, itemIndex: null },
      { position: 2, itemIndex: 0 },
      { position: 3, itemIndex: null },
      { position: 4, itemIndex: 1 },
    ]);
  });

  it("falls back to source filtering when an older result has no placement data", () => {
    const items = [
      { resource_uid: "100", source_images: ["screen-1.png"] },
      { resource_uid: "200", source_images: ["screen-2.png"] },
    ];

    expect(buildImageReviewSlots(undefined, items, "screen-2.png")).toEqual([{ position: 1, itemIndex: 1 }]);
  });
});
