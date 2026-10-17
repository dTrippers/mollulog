import { describe, expect, it } from "@jest/globals";
import { getScannerStepBody } from "~/routes/scanner._components/scanner-step-body";

const base = {
  hasSelectedJob: true,
  hasJob: true,
  phase: "review" as const,
  isApplied: false,
  isTerminal: false,
  reviewBody: "review" as const,
};

describe("getScannerStepBody", () => {
  it("shows the upload body when no job is selected", () => {
    expect(getScannerStepBody({ ...base, hasSelectedJob: false, hasJob: false })).toBe("upload");
  });

  it("shows no body while the selected job is still loading", () => {
    expect(getScannerStepBody({ ...base, hasJob: false })).toBeNull();
  });

  it("shows the waiting body for a queued or processing job", () => {
    expect(getScannerStepBody({ ...base, phase: "waiting", reviewBody: null })).toBe("waiting");
  });

  it("shows the completion body once applied, even when the job is still review ready", () => {
    expect(getScannerStepBody({ ...base, isApplied: true })).toBe("completion");
  });

  it("shows the terminal body for failed, expired, and cancelled jobs before any review body", () => {
    expect(getScannerStepBody({ ...base, isTerminal: true, reviewBody: "review" })).toBe("terminal");
  });

  it("shows the unavailable body for a review-ready job without a result", () => {
    expect(getScannerStepBody({ ...base, reviewBody: "unavailable" })).toBe("unavailable");
  });

  it("returns exactly one body for each state", () => {
    const states = [
      { ...base, hasSelectedJob: false, hasJob: false },
      { ...base, phase: "waiting" as const, reviewBody: null },
      base,
      { ...base, isApplied: true },
      { ...base, isTerminal: true },
      { ...base, reviewBody: "unavailable" as const },
    ];
    for (const state of states) {
      expect(getScannerStepBody(state)).not.toBeUndefined();
    }
  });
});
