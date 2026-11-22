import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { DEFAULT_OPEN_GRAPH_IMAGE_URL, socialMeta } from "~/lib/seo";

describe("SEO defaults", () => {
  it("uses the MolluLog OpenGraph image as the site-wide fallback", () => {
    expect(DEFAULT_OPEN_GRAPH_IMAGE_URL).toBe("https://mollulog.net/mollulog-og-261121.png");
  });
});

describe("socialMeta", () => {
  it("writes Open Graph tags as `property` and X card tags as `name`", () => {
    expect(socialMeta({ title: "학생부", description: "학생 목록", pathname: "/students/" })).toEqual([
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "몰루로그" },
      { property: "og:locale", content: "ko_KR" },
      { property: "og:title", content: "학생부" },
      { property: "og:url", content: "https://mollulog.net/students" },
      { name: "twitter:title", content: "학생부" },
      { property: "og:description", content: "학생 목록" },
      { name: "twitter:description", content: "학생 목록" },
    ]);
  });

  it("leaves the description tags out for a page without a description", () => {
    const tags = socialMeta({ title: "업데이트 소식", pathname: "/news", type: "article" });

    expect(tags).toContainEqual({ property: "og:type", content: "article" });
    expect(JSON.stringify(tags)).not.toContain(":description");
  });
});

describe("route meta", () => {
  const routesDirectory = join(__dirname, "../../../app/routes");

  // A hand-written `{ name: "og:title" }` is ignored by X and other link previews, so a shared link showed no title.
  // Routes take their card text from socialMeta and write only the card image and card type themselves.
  it("leaves card text tags to socialMeta", () => {
    const handWritten = readdirSync(routesDirectory)
      .filter((name) => name.endsWith(".tsx"))
      .flatMap((name) =>
        [
          ...readFileSync(join(routesDirectory, name), "utf8").matchAll(
            /\b(?:name|property): "((?:og|twitter):[\w:]+)"/g,
          ),
        ]
          .map((match) => match[1])
          .filter((tag) => !["og:image", "twitter:image", "twitter:card"].includes(tag))
          .map((tag) => `${name}: ${tag}`),
      );

    expect(handWritten).toEqual([]);
  });
});
