import { describe, expect, it } from "@jest/globals";
import { DEFAULT_OPEN_GRAPH_IMAGE_URL, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME, SITE_TAGLINE } from "~/lib/seo";

describe("SEO defaults", () => {
  it("uses the MolluLog OpenGraph image as the site-wide fallback", () => {
    expect(DEFAULT_OPEN_GRAPH_IMAGE_URL).toBe("https://mollulog.net/mollulog-og.png");
  });

  it("defines the site identity copy in one place", () => {
    expect(SITE_NAME).toBe("몰루로그");
    expect(SITE_TAGLINE).toBe("블루 아카이브의 미래시, 컨텐츠, 통계 정보 및 유틸리티 모음.");
    expect(HOME_TITLE).toBe("몰루로그 - 블루 아카이브 미래시/컨텐츠 및 유틸 모음");
    expect(HOME_DESCRIPTION).toBe(
      "블루 아카이브의 컨텐츠 정보를 확인하고, 각종 유틸리티를 활용하여 다양한 계획을 관리해보세요.",
    );
  });
});
