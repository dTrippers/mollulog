import { describe, expect, it } from "@jest/globals";
import { clampNumberInputValue, normalizeNumberInputText } from "../../../../app/components/primitives/NumberInput";

describe("NumberInput", () => {
  it("keeps positive numeric input sanitized", () => {
    expect(normalizeNumberInputText("0012개", false)).toBe("12");
    expect(normalizeNumberInputText("-12", false)).toBe("12");
  });

  it("allows one leading negative sign when negative values are enabled", () => {
    expect(normalizeNumberInputText("-12", true)).toBe("-12");
    expect(normalizeNumberInputText("--12", true)).toBe("-12");
    expect(normalizeNumberInputText("12-3", true)).toBe("123");
  });

  it("clamps committed numeric input to min and max values", () => {
    expect(clampNumberInputValue(0, 1, 100)).toBe(1);
    expect(clampNumberInputValue(999, 1, 100)).toBe(100);
    expect(clampNumberInputValue(50, 1, 100)).toBe(50);
  });
});
