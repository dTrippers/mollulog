import { describe, expect, it } from "@jest/globals";
import { getScannerJobTone } from "~/routes/scanner._components/ScannerJobsPanel";
import { getResourceStepStates } from "~/routes/scanner.resource._components/ResourceScanner";
import { getStudentStepStates } from "~/routes/scanner.student._components/StudentScanner";

const baseJob = {
  uid: "job-1",
  generation: 1,
  status: "review_ready",
  progress: { completed: 1, failed: 0, total: 1 },
  images: [],
  currentQuantities: {},
  application: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-08T00:00:00.000Z",
};

describe("scanner step states", () => {
  it("starts on the upload step with no job", () => {
    expect(getResourceStepStates("idle", null)).toEqual(["active", "pending", "pending", "pending"]);
    expect(getStudentStepStates("idle", null)).toEqual(["active", "pending", "pending", "pending"]);
  });

  it("maps an expired upload to a failed upload step", () => {
    const job = { ...baseJob, status: "expired" };
    expect(getResourceStepStates("idle", job as never)[0]).toBe("failed");
    expect(getStudentStepStates("idle", job as never)[0]).toBe("failed");
  });

  it("maps a failed recognition to a failed recognition step", () => {
    const job = { ...baseJob, status: "failed" };
    expect(getResourceStepStates("idle", job as never)).toEqual(["done", "failed", "pending", "pending"]);
    expect(getStudentStepStates("idle", job as never)).toEqual(["done", "failed", "pending", "pending"]);
  });

  it("keeps recognition active while queued or processing", () => {
    for (const status of ["queued", "processing", "finalizing"]) {
      expect(getResourceStepStates("waiting", { ...baseJob, status } as never)[1]).toBe("active");
    }
  });

  it("marks the apply step active while applying and all steps done once applied", () => {
    expect(getResourceStepStates("applying", baseJob as never)[3]).toBe("active");
    const applied = { ...baseJob, application: { status: "applied", appliedAt: "2026-01-02T00:00:00.000Z" } };
    expect(getResourceStepStates("applied", applied as never)).toEqual(["done", "done", "done", "done"]);
    expect(getStudentStepStates("applied", { ...applied, result: {} } as never)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  it("marks review as failed when the result cannot be read", () => {
    expect(getResourceStepStates("review", { ...baseJob, reviewError: true } as never)).toEqual([
      "done",
      "done",
      "failed",
      "pending",
    ]);
    expect(getStudentStepStates("review", { ...baseJob, result: null } as never)).toEqual([
      "done",
      "done",
      "failed",
      "pending",
    ]);
  });
});

describe("scanner job list tone", () => {
  it("treats an expired upload and a failed recognition as failures", () => {
    expect(getScannerJobTone("expired", false)).toBe("failed");
    expect(getScannerJobTone("failed", false)).toBe("failed");
  });

  it("reads an applied job as done even when its status is review_ready", () => {
    expect(getScannerJobTone("review_ready", true)).toBe("done");
    expect(getScannerJobTone("review_ready", false)).toBe("review");
    expect(getScannerJobTone("queued", false)).toBe("waiting");
  });
});
