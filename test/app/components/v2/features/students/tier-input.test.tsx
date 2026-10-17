import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { TierInput, getTierMeaning } from "~/components/v2/features/students/TierInput";

const flowProps = {
  "data-number-input-flow": "grid-1",
  onFocus: () => undefined,
  onKeyDown: () => undefined,
};

function render(value: number | null, warning = false) {
  return renderToStaticMarkup(
    <TierInput
      label="케이"
      value={value}
      initialTier={1}
      min={1}
      max={9}
      warning={warning}
      flowProps={flowProps}
      onChange={() => undefined}
    />,
  );
}

describe("tier input", () => {
  it("shows a star tier as ★n and reads it as n성", () => {
    const markup = render(5);
    expect(markup).toContain("★5");
    expect(markup).not.toContain("exclusive_weapon.png");
    expect(markup).toContain('aria-label="케이 5성"');
  });

  it("shows an exclusive weapon tier as the icon and its level, named 고유무기 n", () => {
    const markup = render(7);
    expect(markup).toContain("/icons/exclusive_weapon.png");
    expect(markup).toContain(">2<");
    expect(markup).toContain('aria-label="케이 고유무기 2"');
    expect(getTierMeaning(7)).toBe("고유무기 2");
  });

  it("keeps the select in the flow navigation and uses the warning background on the box", () => {
    const markup = render(5, true);
    expect(markup).toContain('data-number-input-flow="grid-1"');
    expect(markup).toContain("bg-v2-warning-subtle");
    expect(markup).toContain("min-h-v2-input-min");
  });
});
