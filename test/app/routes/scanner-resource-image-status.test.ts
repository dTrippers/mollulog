import { describe, expect, it } from "@jest/globals";
import {
  groupScannerImagesByStatus,
  shouldConfirmUnappliedScannerResult,
} from "~/routes/scanner.resource._components/ResourceScanner";

describe("resource scanner image status groups", () => {
  it("keeps succeeded and failed images in separate groups", () => {
    const groups = groupScannerImagesByStatus([
      { uid: "failed-1", filename: "failed.png", status: "failed" },
      { uid: "succeeded-1", filename: "success.png", status: "succeeded" },
      { uid: "failed-2", filename: "failed-2.png", status: "failed" },
    ]);

    expect(groups.succeeded.map(({ uid }) => uid)).toEqual(["succeeded-1"]);
    expect(groups.failed.map(({ uid }) => uid)).toEqual(["failed-1", "failed-2"]);
  });

  it("keeps all failed images inspectable when no image succeeds", () => {
    const groups = groupScannerImagesByStatus([
      { uid: "failed-1", filename: "failed.png", status: "failed" },
      { uid: "failed-2", filename: "failed-2.png", status: "failed" },
    ]);

    expect(groups.succeeded).toEqual([]);
    expect(groups.failed.map(({ filename }) => filename)).toEqual(["failed.png", "failed-2.png"]);
  });

  it("only confirms before replacing an unapplied review-ready result", () => {
    expect(shouldConfirmUnappliedScannerResult("review_ready")).toBe(true);
    expect(shouldConfirmUnappliedScannerResult("failed")).toBe(false);
  });
});
