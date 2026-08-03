import { describe, expect, it } from "@jest/globals";
import { ResourceTypeEnum } from "~/graphql/graphql";
import {
  buildCellReviewAttentionCounts,
  buildCellReviewPreviewSummary,
  getCellReviewCandidateList,
  hasCellReviewCells,
  type ReviewCell,
} from "~/routes/scanner.resource._components/resource-cell-review";

const cells: ReviewCell[] = [
  {
    imageIndex: 0,
    position: 0,
    imageUid: "image-1",
    filename: "screen.png",
    width: 100,
    height: 100,
    bbox: null,
    status: "recognized",
    itemUid: "100",
    resource: { uid: "100", name: "A", rarity: 1 },
    currentQuantity: 2,
    quantity: 5,
    quantityExact: true,
    quantityKnown: true,
    candidates: [],
    reasons: [],
  },
  {
    imageIndex: 0,
    position: 1,
    imageUid: "image-1",
    filename: "screen.png",
    width: 100,
    height: 100,
    bbox: null,
    status: "recognized",
    itemUid: "200",
    resource: { uid: "200", name: "B", rarity: 1 },
    currentQuantity: 3,
    quantity: 3,
    quantityExact: true,
    quantityKnown: true,
    candidates: [],
    reasons: [],
  },
  {
    imageIndex: 0,
    position: 2,
    imageUid: "image-1",
    filename: "screen.png",
    width: 100,
    height: 100,
    bbox: null,
    status: "unrecognized",
    itemUid: null,
    resource: null,
    currentQuantity: null,
    quantity: null,
    quantityExact: false,
    quantityKnown: false,
    candidates: [],
    reasons: [],
  },
];

describe("resource cell review preview", () => {
  it("compares untouched effective cells with current quantities and reports omissions", () => {
    expect(buildCellReviewPreviewSummary(cells, {}, { "100": 2, "200": 3 })).toEqual({
      applicableChanged: 1,
      unchangedSafe: 1,
      omitted: 1,
      omittedReasons: { "아이템 확인 필요": 1 },
    });
  });

  it("renders the current recognition once and keeps search results distinct", () => {
    const current = {
      uid: "100",
      name: "A",
      rarity: 1,
      currentQuantity: 2,
    };
    const topCandidates = [
      {
        uid: "100",
        assetUid: "100",
        name: "A",
        resourceType: ResourceTypeEnum.Item,
        rarity: 1,
        currentQuantity: 2,
        score: 0.99,
        selectionSource: "ocr_candidate" as const,
      },
      {
        uid: "200",
        assetUid: "200",
        name: "B",
        resourceType: ResourceTypeEnum.Item,
        rarity: 1,
        currentQuantity: 4,
        score: 0.8,
        selectionSource: "ocr_candidate" as const,
      },
    ];
    const searchResults = [
      {
        uid: "999",
        assetUid: "999",
        name: "검색 아이템",
        resourceType: ResourceTypeEnum.Item,
        rarity: 2,
        currentQuantity: 1,
        score: null,
        selectionSource: "catalog_search" as const,
      },
    ];

    expect(getCellReviewCandidateList(current, topCandidates).map(({ uid }) => uid)).toEqual(["200"]);
    expect(getCellReviewCandidateList(current, searchResults).map(({ uid }) => uid)).toEqual(["999"]);
  });

  it("uses the complete cell set for the empty warning", () => {
    expect(hasCellReviewCells([])).toBe(false);
    expect(hasCellReviewCells(cells)).toBe(true);
  });

  it("counts unresolved cells by image and clears attention after correction or exclusion", () => {
    const multiImageCells: ReviewCell[] = [
      {
        ...cells[0],
        imageUid: "image-a",
        filename: "same.png",
        position: 0,
        itemUid: "400",
        resource: { uid: "400", name: "수량 확인 아이템", rarity: 1 },
        status: "quantity_failure",
        quantity: null,
        quantityExact: false,
        quantityKnown: false,
      },
      {
        ...cells[2],
        imageUid: "image-b",
        filename: "same.png",
        imageIndex: 1,
        position: 0,
        quantity: 7,
      },
      {
        ...cells[0],
        imageUid: "image-b",
        filename: "same.png",
        imageIndex: 1,
        position: 1,
        itemUid: null,
        resource: null,
        quantity: 8,
      },
    ];

    expect(buildCellReviewAttentionCounts(multiImageCells, {})).toEqual({ "image-a": 1, "image-b": 2 });
    expect(
      buildCellReviewAttentionCounts(multiImageCells, {
        "0:0": { quantity: "9", quantityTouched: true },
        "1:0": { itemUid: "300", itemTouched: true },
        "1:1": { excluded: true, exclusionTouched: true },
      }),
    ).toEqual({});
  });
});
