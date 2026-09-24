import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NumberInput, {
  clampNumberInputValue,
  normalizeNumberInputText,
} from "../../../../app/components/primitives/NumberInput";

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

  it("names the field and its increment/decrement buttons from the visible label", () => {
    const markup = renderToStaticMarkup(
      createElement(NumberInput, {
        label: "레벨",
        minValue: 1,
        maxValue: 90,
        showMin: true,
        showMax: true,
        value: 80,
        inputProps: { "aria-label": "레벨" },
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="레벨"');
    expect(markup).toContain('aria-label="레벨 감소"');
    expect(markup).toContain('aria-label="레벨 증가"');
    expect(markup).toContain('aria-label="레벨 최소값으로 설정"');
    expect(markup).toContain('aria-label="레벨 최대값으로 설정"');
  });

  it("keeps generic min/max button names when no label is supplied", () => {
    const markup = renderToStaticMarkup(
      createElement(NumberInput, {
        minValue: 1,
        maxValue: 90,
        showMin: true,
        showMax: true,
        value: 80,
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="최소값으로 설정"');
    expect(markup).toContain('aria-label="최대값으로 설정"');
  });
});
