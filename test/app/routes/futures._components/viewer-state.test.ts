import { describe, expect, it, jest } from "@jest/globals";
import { resolveViewerStatus, settleViewerState } from "~/routes/futures._components/viewer-state";

describe("settleViewerState", () => {
  it("resolves a loaded value as available without reporting", async () => {
    const report = jest.fn<(error: unknown, operation: string) => void>();
    await expect(settleViewerState(Promise.resolve([1]), "favorited_students", report)).resolves.toEqual({
      status: "available",
      value: [1],
    });
    expect(report).not.toHaveBeenCalled();
  });

  it("resolves a failed read as unavailable and reports the operation", async () => {
    const error = new Error("boom");
    const report = jest.fn<(error: unknown, operation: string) => void>();
    await expect(settleViewerState(Promise.reject(error), "recruitment_results", report)).resolves.toEqual({
      status: "unavailable",
    });
    expect(report).toHaveBeenCalledWith(error, "recruitment_results");
  });
});

describe("resolveViewerStatus", () => {
  const available = { status: "available" as const, value: [] };
  const unavailable = { status: "unavailable" as const };

  it("is pending until both viewer reads have settled", () => {
    expect(resolveViewerStatus(undefined, undefined)).toBe("pending");
    expect(resolveViewerStatus(available, undefined)).toBe("pending");
    expect(resolveViewerStatus(undefined, available)).toBe("pending");
  });

  it("is ready only when both reads succeed", () => {
    expect(resolveViewerStatus(available, available)).toBe("ready");
  });

  it("fails as soon as either read fails, even while the other is still pending", () => {
    expect(resolveViewerStatus(unavailable, undefined)).toBe("failed");
    expect(resolveViewerStatus(undefined, unavailable)).toBe("failed");
    expect(resolveViewerStatus(available, unavailable)).toBe("failed");
    expect(resolveViewerStatus(unavailable, available)).toBe("failed");
  });
});
