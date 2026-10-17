import { describe, expect, it } from "@jest/globals";
import { getScannerUnavailableResultMessage } from "~/routes/scanner._components/scanner-messages";
import { getStudentJobTransition, getStudentReviewBody } from "~/routes/scanner.student._components/StudentScanner";

// A stored result that cannot be read is the explicit unavailable state: no review, no retry, no counts (U1).
const reviewReady = {
  status: "review_ready",
  result: null,
  resultInvalid: true,
  application: null,
  completionSummary: null,
} as never;

describe("student result that cannot be read", () => {
  it("maps the resultInvalid flag to the unavailable review body, not a review", () => {
    expect(getStudentReviewBody(reviewReady)).toBe("unavailable");
  });

  it("keeps a readable result as a review", () => {
    expect(
      getStudentReviewBody({ status: "review_ready", result: { students: [] }, resultInvalid: false } as never),
    ).toBe("review");
  });

  it("is not a transient load error: the transition reports the explicit unavailable message and no retry phase", () => {
    const transition = getStudentJobTransition(reviewReady);

    expect(transition.error).toBe(getScannerUnavailableResultMessage());
    expect(transition.phase).toBe("idle");
  });

  it("has no review body for a job that is not review ready yet", () => {
    expect(getStudentReviewBody({ status: "queued", result: null, resultInvalid: false } as never)).toBeNull();
  });
});
