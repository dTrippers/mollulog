import { describe, expect, it } from "@jest/globals";
import { DEFAULT_OPEN_GRAPH_IMAGE_URL } from "~/lib/seo";

describe("SEO defaults", () => {
  it("uses the MolluLog OpenGraph image as the site-wide fallback", () => {
    expect(DEFAULT_OPEN_GRAPH_IMAGE_URL).toBe("https://mollulog.net/mollulog-og.png");
  });
});
