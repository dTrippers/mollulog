import { describe, expect, it } from "@jest/globals";
import { fieldNeedsReview, getFieldComparison } from "~/routes/scanner.student._components/StudentScanner";

describe("student review warning", () => {
  it("flags a lower recognized value and identifies the saved value for comparison", () => {
    const detail = { state: "recognized", confidence: 0.95 } as never;
    expect(fieldNeedsReview(detail, "70", true, 79)).toBe(true);
    expect(getFieldComparison(detail, "70", 79, true)).toBe("decreased");
  });

  it("flags a low-confidence read even when it matches the saved value", () => {
    const detail = { state: "recognized", confidence: 0.5 } as never;
    expect(fieldNeedsReview(detail, "79", true, 79)).toBe(true);
  });

  it("requires an unconfirmed failure but clears it after manual confirmation", () => {
    const detail = { state: "unknown" } as never;
    expect(fieldNeedsReview(detail, "79", false, 79)).toBe(true);
    expect(fieldNeedsReview(detail, "79", true, 79)).toBe(false);
  });

  it("leaves an accurate unchanged value without a warning", () => {
    const detail = { state: "recognized", confidence: 0.95 } as never;
    expect(fieldNeedsReview(detail, "79", true, 79)).toBe(false);
    expect(getFieldComparison(detail, "79", 79, true)).toBe("same");
  });
});
