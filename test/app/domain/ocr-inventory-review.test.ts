import { describe, expect, it } from "@jest/globals";
import {
  buildOcrInventoryReview,
  evaluateOcrInventoryReview,
  parseOcrCellPatches,
} from "../../../app/domain/ocr-inventory-review";

const imageRows = [
  { uid: "image-a", filename: "same.png", status: "failed" },
  { uid: "image-b", filename: "same.png", status: "succeeded" },
  { uid: "image-c", filename: "other.png", status: "succeeded" },
];

const result = {
  images: [
    {
      filename: "same.png",
      observations: [
        {
          resource_uid: "100",
          quantity: 5,
          quantity_exact: true,
          candidates: [
            { uid: "100", score: 0.99 },
            { uid: "200", score: 0.8 },
          ],
        },
      ],
    },
    {
      filename: "other.png",
      observations: [
        { resource_uid: "100", quantity: 5, quantity_exact: true, candidates: [] },
        { resource_uid: null, quantity: null, quantity_exact: false, candidates: [{ uid: "300", score: 0.7 }] },
      ],
    },
  ],
};

describe("OCR inventory cell review", () => {
  it("maps result image indexes to succeeded image UIDs, even with duplicate filenames", () => {
    const review = buildOcrInventoryReview(result, imageRows);

    expect(review.reviewMode).toBe("cells");
    expect(review.cells.map(({ imageIndex, position, imageUid }) => ({ imageIndex, position, imageUid }))).toEqual([
      { imageIndex: 0, position: 0, imageUid: "image-b" },
      { imageIndex: 1, position: 0, imageUid: "image-c" },
      { imageIndex: 1, position: 1, imageUid: "image-c" },
    ]);
  });

  it("returns an unavailable review when a result filename does not match its succeeded row", () => {
    const review = buildOcrInventoryReview(
      { ...result, images: [{ ...result.images[0], filename: "wrong.png" }, result.images[1]] },
      imageRows,
    );

    expect(review).toEqual({ reviewMode: "unavailable", cells: [], reason: "result_image_mapping_unusable" });
  });

  it("omits every member of a duplicate effective UID group without auto-deduping", () => {
    const review = buildOcrInventoryReview(result, imageRows);
    const evaluation = evaluateOcrInventoryReview(
      review,
      parseOcrCellPatches([{ imageIndex: 1, position: 1, itemUid: "100", quantity: 5 }]),
      new Set(["100", "200"]),
      { "100": 0 },
    );

    expect(evaluation.changedEntries).toEqual([]);
    expect(evaluation.duplicateUids).toEqual(["100"]);
    expect(evaluation.omittedCells.filter((cell) => cell.reason === "duplicate_uid")).toHaveLength(3);
  });

  it("evaluates untouched safe cells when the sparse patch array is empty", () => {
    const review = buildOcrInventoryReview({ images: [result.images[0]] }, [imageRows[1]]);
    const evaluation = evaluateOcrInventoryReview(review, [], new Set(["100"]), { "100": 0 });

    expect(evaluation.changedEntries).toEqual([
      expect.objectContaining({ itemUid: "100", quantity: 5, currentQuantity: 0 }),
    ]);
    expect(evaluation.omittedCells).toEqual([]);
  });

  it("keeps an approximate non-null quantity resolvable", () => {
    const review = buildOcrInventoryReview(
      { images: [{ filename: "compact.png", observations: [{ resource_uid: "100", quantity: 20_000 }] }] },
      [{ uid: "compact-image", filename: "compact.png", status: "succeeded" }],
    );

    expect(review.reviewMode).toBe("cells");
    expect(review.cells[0]).toEqual(expect.objectContaining({ quantity: 20_000, quantityExact: false }));
    const evaluation = evaluateOcrInventoryReview(review, [], new Set(["100"]), { "100": 0 });
    expect(evaluation.changedEntries).toEqual([
      expect.objectContaining({ itemUid: "100", quantity: 20_000, quantityExact: false }),
    ]);
    expect(evaluation.omittedCells).toEqual([]);
  });

  it("rejects duplicate addresses and unsafe quantities", () => {
    expect(() =>
      parseOcrCellPatches([
        { imageIndex: 0, position: 0, quantity: 1 },
        { imageIndex: 0, position: 0, quantity: 2 },
      ]),
    ).toThrow();
    expect(() =>
      parseOcrCellPatches([{ imageIndex: 0, position: 0, quantity: Number.MAX_SAFE_INTEGER + 1 }]),
    ).toThrow();
    expect(() => parseOcrCellPatches([{ imageIndex: 0, position: 0, excluded: true, quantity: 1 }])).toThrow();
  });
});
