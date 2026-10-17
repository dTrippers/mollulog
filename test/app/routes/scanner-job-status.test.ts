import { describe, expect, it } from "@jest/globals";
import { classifyScannerJobStatusError, ScannerApiRequestError } from "~/routes/scanner._components/scanner-client";
import { getScannerCompletionState, getScannerJobStatusView } from "~/routes/scanner._components/scanner-messages";

describe("scanner job status errors", () => {
  it("treats a missing job (404) as not found, which is not retryable", () => {
    expect(classifyScannerJobStatusError(new ScannerApiRequestError("OCR 작업을 찾을 수 없어요", undefined, 404))).toBe(
      "not_found",
    );
    expect(getScannerJobStatusView("not_found")).toEqual({ title: "작업을 찾을 수 없어요", action: "startNew" });
  });

  it("treats a 5xx response and a network failure as transient, which offers a retry", () => {
    expect(classifyScannerJobStatusError(new ScannerApiRequestError("서버 오류", undefined, 503))).toBe("transient");
    expect(classifyScannerJobStatusError(new TypeError("Failed to fetch"))).toBe("transient");
    expect(getScannerJobStatusView("transient")).toEqual({
      title: "인식 작업 상태를 확인하지 못했어요.",
      action: "retry",
    });
  });
});

describe("scanner completion view", () => {
  it("shows the saved summary when it can be built", () => {
    const summary = { appliedCount: 2, unappliedCellCount: 1, items: [] };
    expect(getScannerCompletionState(summary)).toEqual({ kind: "summary", summary });
  });

  it("shows an explicit unavailable state for a null summary, never empty counts", () => {
    const state = getScannerCompletionState(null);
    expect(state.kind).toBe("unavailable");
    expect(state).toEqual({
      kind: "unavailable",
      message: "반영 기록을 확인하지 못했어요. 새로고침한 뒤 다시 확인해 주세요.",
    });
  });
});
