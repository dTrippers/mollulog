import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

const appRoot = join(process.cwd(), "app");
const terms = readFileSync(join(appRoot, "content/legal/terms.md"), "utf8");
const privacy = readFileSync(join(appRoot, "content/legal/privacy.md"), "utf8");
const footer = readFileSync(join(appRoot, "components/features/layout/Footer.tsx"), "utf8");

describe("legal pages", () => {
  it("keeps the official relationship and asset copyright notice in the terms", () => {
    expect(terms).toContain("공식과는 무관한 팬 사이트");
    expect(terms).toContain("공식 운영사와 개발사에 있습니다");
  });

  it("keeps the privacy policy's account, scanner, and analytics notices", () => {
    expect(privacy).toContain("Google Analytics");
    expect(privacy).toContain("Sentry");
    expect(privacy).toContain("업로드한 스크린샷·영상");
    expect(privacy).toContain("제안/문의 페이지");
  });

  it("links both legal pages from the footer", () => {
    expect(footer).toContain('to="/terms"');
    expect(footer).toContain('to="/privacy"');
  });
});
