import { describe, expect, it } from "@jest/globals";
import { WALKTHROUGH_COMMUNITY_TEXT_LENGTH, walkthroughCommunityText } from "~/domain/walkthrough-timeline-community";

describe("walkthroughCommunityText", () => {
  it("never splits an emoji at the cut", () => {
    const text = walkthroughCommunityText(`${"가".repeat(WALKTHROUGH_COMMUNITY_TEXT_LENGTH - 1)}😊끝`);
    expect(text).toBe(`${"가".repeat(WALKTHROUGH_COMMUNITY_TEXT_LENGTH - 1)}😊…`);
    // A lone surrogate would show up as an unpaired \ud83d escape.
    expect(JSON.stringify(text)).not.toMatch(/\\ud[89ab]/i);
  });

  it("keeps a body within the length whole", () => {
    expect(walkthroughCommunityText("  짧은 본문 😊  ")).toBe("짧은 본문 😊");
  });
});
