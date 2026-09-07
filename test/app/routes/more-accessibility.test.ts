import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const moreSource = readFileSync("app/routes/more._index.tsx", "utf8");

describe("More menu accessibility", () => {
  it("announces the meaning of red-dot service states to screen readers", () => {
    expect(moreSource).toContain("aria-label={getMoreMenuItemAriaLabel(item)}");
    expect(moreSource).toContain("업데이트 소식, 새 소식 있음");
    expect(moreSource).toContain("제안/문의, 읽지 않은 답변 있음");
    expect(moreSource).toContain("새 소식 있음");
  });

  it("keeps fixed red-dot labels unchanged outside the two stateful service links", () => {
    expect(moreSource).toMatch(
      /if \(item\.to === "\/contact"\)[\s\S]*?return "제안\/문의, 읽지 않은 답변 있음";[\s\S]*?return item\.name;/,
    );
    expect(moreSource).not.toMatch(/\$\{item\.name\}, 새 소식 있음/);
  });
});
