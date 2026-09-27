import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const moreSource = readFileSync("app/routes/more._index.tsx", "utf8");

describe("More menu accessibility", () => {
  it("announces the meaning of red-dot service states to screen readers", () => {
    expect(moreSource).toContain("aria-label={getMoreMenuItemAriaLabel(item)}");
    expect(moreSource).toContain("const label = item.badgeLabel ? `${item.name}, ${item.badgeLabel}` : item.name;");
    expect(moreSource).toContain("return `${label}, 새 소식 있음`;");
    expect(moreSource).toContain("return `${label}, 읽지 않은 답변 있음`;");
    expect(moreSource).toContain("return `${label}, 새 항목 있음`;");
  });

  it("announces labels without a red dot and keeps red-dot-only meaning separate", () => {
    expect(moreSource).toContain("if (!item.showRedDot) return label;");
    expect(moreSource).toContain("item.badgeLabel ? `${item.name}, ${item.badgeLabel}` : item.name");
  });
});
