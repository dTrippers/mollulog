import { describe, expect, it } from "@jest/globals";
import {
  getPartialRecognitionReviewImageUids,
  groupScannerImagesByStatus,
  shouldConfirmUnappliedScannerResult,
  shouldShowScannerResultActions,
} from "~/routes/scanner.resource._components/ResourceScanner";

describe("resource scanner image status groups", () => {
  it("keeps succeeded and failed images in separate groups", () => {
    const groups = groupScannerImagesByStatus([
      { uid: "failed-1", filename: "failed.png", status: "failed" },
      { uid: "succeeded-1", filename: "success.png", status: "succeeded" },
      { uid: "failed-2", filename: "failed-2.png", status: "failed" },
    ]);

    expect(groups.succeeded.map(({ uid }) => uid)).toEqual(["succeeded-1"]);
    expect(groups.reviewRequired.map(({ uid }) => uid)).toEqual(["failed-1", "failed-2"]);
  });

  it("keeps all failed images inspectable when no image succeeds", () => {
    const groups = groupScannerImagesByStatus([
      { uid: "failed-1", filename: "failed.png", status: "failed" },
      { uid: "failed-2", filename: "failed-2.png", status: "failed" },
    ]);

    expect(groups.succeeded).toEqual([]);
    expect(groups.reviewRequired.map(({ filename }) => filename)).toEqual(["failed.png", "failed-2.png"]);
  });

  it("keeps every non-succeeded image in the review-required group", () => {
    const groups = groupScannerImagesByStatus([
      { uid: "queued-1", status: "queued" },
      { uid: "processing-1", status: "processing" },
      { uid: "cancelled-1", status: "cancelled" },
      { uid: "succeeded-1", status: "succeeded" },
    ]);

    expect(groups.succeeded.map(({ uid }) => uid)).toEqual(["succeeded-1"]);
    expect(groups.reviewRequired.map(({ uid }) => uid)).toEqual(["queued-1", "processing-1", "cancelled-1"]);
  });

  it("classifies a processed image with a partial recognition failure as review-required", () => {
    const images = [
      { uid: "complete", filename: "complete.png", status: "succeeded" },
      { uid: "partial", filename: "partial.png", status: "succeeded" },
    ];
    const partialRecognitionReviewImageUids = getPartialRecognitionReviewImageUids({
      images,
      reviewMode: "cells",
      cells: [
        { imageUid: "complete", status: "recognized" },
        { imageUid: "partial", status: "recognized" },
        { imageUid: "partial", status: "quantity_failure" },
      ],
      result: null,
    });

    const groups = groupScannerImagesByStatus(images, partialRecognitionReviewImageUids);
    expect(groups.succeeded.map(({ uid }) => uid)).toEqual(["complete"]);
    expect(groups.reviewRequired.map(({ uid }) => uid)).toEqual(["partial"]);
  });

  it("requires review when a processed image has no recognized cells", () => {
    const images = [{ uid: "empty", filename: "empty.png", status: "succeeded" }];
    const partialRecognitionReviewImageUids = getPartialRecognitionReviewImageUids({
      images,
      reviewMode: "cells",
      cells: [],
      result: null,
    });

    expect(groupScannerImagesByStatus(images, partialRecognitionReviewImageUids).reviewRequired).toEqual(images);
  });

  it("requires review when recognized cells contribute to a conflicting item result", () => {
    const images = [{ uid: "conflict", filename: "conflict.png", status: "succeeded" }];
    const partialRecognitionReviewImageUids = getPartialRecognitionReviewImageUids({
      images,
      reviewMode: "cells",
      cells: [{ imageUid: "conflict", status: "recognized" }],
      result: {
        items: [{ status: "conflict", source_images: ["conflict.png"] }],
      },
    });

    expect(groupScannerImagesByStatus(images, partialRecognitionReviewImageUids).reviewRequired).toEqual(images);
  });

  it("uses legacy placement status to classify partial recognition", () => {
    const images = [
      { uid: "complete", filename: "complete.png", status: "succeeded" },
      { uid: "partial", filename: "partial.png", status: "succeeded" },
    ];
    const partialRecognitionReviewImageUids = getPartialRecognitionReviewImageUids({
      images,
      reviewMode: "legacy",
      cells: [],
      result: {
        items: [],
        components: [
          {
            placements: [
              { filename: "complete.png", start: 0, cell_count: 1 },
              { filename: "partial.png", start: 1, cell_count: 2 },
            ],
            positions: [
              { position: 0, status: "recognized" },
              { position: 1, status: "recognized" },
              { position: 2, status: "unrecognized" },
            ],
          },
        ],
      },
    });

    const groups = groupScannerImagesByStatus(images, partialRecognitionReviewImageUids);
    expect(groups.succeeded.map(({ uid }) => uid)).toEqual(["complete"]);
    expect(groups.reviewRequired.map(({ uid }) => uid)).toEqual(["partial"]);
  });

  it("only confirms before replacing an unapplied review-ready result", () => {
    expect(shouldConfirmUnappliedScannerResult("review_ready")).toBe(true);
    expect(shouldConfirmUnappliedScannerResult("failed")).toBe(false);
  });

  it("only shows result actions while a succeeded image is selected", () => {
    expect(shouldShowScannerResultActions("review_ready", "succeeded")).toBe(true);
    expect(shouldShowScannerResultActions("review_ready", "failed")).toBe(false);
    expect(shouldShowScannerResultActions("review_ready", "cancelled")).toBe(false);
    expect(shouldShowScannerResultActions("failed", "failed")).toBe(false);
  });
});
