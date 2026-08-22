import { describe, expect, it } from "@jest/globals";
import { mapWithConcurrencyLimit } from "~/lib/concurrency";
import {
  getPartialRecognitionReviewImageUids,
  getResourceJobTransition,
  groupScannerImagesByStatus,
  RESOURCE_FILE_CONCURRENCY,
  shouldShowScannerCancelAction,
  shouldShowScannerResultActions,
} from "~/routes/scanner.resource._components/ResourceScanner";

describe("resource scanner image status groups", () => {
  it("bounds resource file work at four concurrent tasks", async () => {
    let active = 0;
    let maximum = 0;
    await mapWithConcurrencyLimit(Array.from({ length: 10 }), RESOURCE_FILE_CONCURRENCY, async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
    });

    expect(RESOURCE_FILE_CONCURRENCY).toBe(4);
    expect(maximum).toBeLessThanOrEqual(4);
  });

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
      cells: [
        { imageUid: "complete", status: "recognized" },
        { imageUid: "partial", status: "recognized" },
        { imageUid: "partial", status: "quantity_failure" },
      ],
    });

    const groups = groupScannerImagesByStatus(images, partialRecognitionReviewImageUids);
    expect(groups.succeeded.map(({ uid }) => uid)).toEqual(["complete"]);
    expect(groups.reviewRequired.map(({ uid }) => uid)).toEqual(["partial"]);
  });

  it("keeps an unrecognized cell in the review-required image group", () => {
    const images = [
      { uid: "recognized", filename: "recognized.png", status: "succeeded" },
      { uid: "unrecognized", filename: "unrecognized.png", status: "succeeded" },
    ];
    const partialRecognitionReviewImageUids = getPartialRecognitionReviewImageUids({
      images,
      cells: [
        { imageUid: "recognized", status: "recognized" },
        { imageUid: "unrecognized", status: "unrecognized" },
      ],
    });

    const groups = groupScannerImagesByStatus(images, partialRecognitionReviewImageUids);
    expect(groups.succeeded.map(({ uid }) => uid)).toEqual(["recognized"]);
    expect(groups.reviewRequired.map(({ uid }) => uid)).toEqual(["unrecognized"]);
  });

  it("requires review when a processed image has no recognized cells", () => {
    const images = [{ uid: "empty", filename: "empty.png", status: "succeeded" }];
    const partialRecognitionReviewImageUids = getPartialRecognitionReviewImageUids({
      images,
      cells: [],
    });

    expect(groupScannerImagesByStatus(images, partialRecognitionReviewImageUids).reviewRequired).toEqual(images);
  });

  it("keeps the job-level result action stable when a failed image is selected", () => {
    expect(shouldShowScannerResultActions("review_ready", "cells")).toBe(true);
    expect(shouldShowScannerResultActions("review_ready", "cells", true)).toBe(false);
    expect(shouldShowScannerResultActions("review_ready", undefined)).toBe(false);
    expect(shouldShowScannerResultActions("failed", "cells")).toBe(false);
  });

  it("keeps the cancel action available for an unmappable review job", () => {
    expect(shouldShowScannerCancelAction("review_ready")).toBe(true);
    expect(shouldShowScannerCancelAction("failed")).toBe(false);
  });

  it("marks unsupported resource job states as an explicit unavailable result", () => {
    expect(
      getResourceJobTransition({ status: "unexpected" } as Parameters<typeof getResourceJobTransition>[0]),
    ).toEqual({
      phase: "idle",
      error: "인식 결과를 안전하게 확인하지 못했어요. 새로 업로드해 주세요.",
    });
  });

  it("prioritizes review errors over an active job transition", () => {
    expect(
      getResourceJobTransition({ status: "processing", reviewError: true } as Parameters<
        typeof getResourceJobTransition
      >[0]),
    ).toEqual({ phase: "review" });
  });

  it("keeps a failed job with a failed image in the review phase", () => {
    expect(
      getResourceJobTransition({
        status: "failed",
        images: [{ uid: "failed", filename: "failed.png", status: "failed" }],
      } as Parameters<typeof getResourceJobTransition>[0]),
    ).toEqual({ phase: "review" });
  });
});
