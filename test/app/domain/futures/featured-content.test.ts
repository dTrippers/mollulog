import { describe, expect, it } from "@jest/globals";
import { defaultContentFilterState } from "~/domain/futures/content-filter-state";
import { selectFeaturedContent } from "~/domain/futures/featured-content";

const now = "2030-01-01T00:00:00.000Z";

function content(uid: string, featuredUntil: string | null, contentType: "event" | "pickup" = "event") {
  return { uid, featuredUntil, contentType, recruitments: [{ pickup: contentType === "pickup" }] };
}

describe("selectFeaturedContent", () => {
  it("ignores missing and expired feature windows", () => {
    expect(
      selectFeaturedContent([content("missing", null), content("expired", now)], defaultContentFilterState, now),
    ).toBeNull();
  });

  it("keeps the first active content in the existing content order", () => {
    const result = selectFeaturedContent(
      [content("first", "2030-01-02T00:00:00.000Z"), content("second", "2030-02-01T00:00:00.000Z")],
      defaultContentFilterState,
      now,
    );

    expect(result?.uid).toBe("first");
  });

  it("hides the feature when the current filter excludes it", () => {
    const result = selectFeaturedContent(
      [content("featured-event", "2030-01-02T00:00:00.000Z")],
      { types: ["pickup"], onlyPickups: false },
      now,
    );

    expect(result).toBeNull();
  });
});
