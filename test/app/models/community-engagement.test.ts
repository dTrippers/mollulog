import { describe, expect, it } from "@jest/globals";
import { isCommunityEngagementActionResult } from "~/models/community-engagement";

describe("isCommunityEngagementActionResult", () => {
  it("accepts community comment and like action results", () => {
    expect(
      isCommunityEngagementActionResult({
        kind: "communityPostCommentsChanged",
        postUid: "post-1",
        comments: [],
      }),
    ).toBe(true);

    expect(
      isCommunityEngagementActionResult({
        kind: "likeChanged",
        targetUid: "post-1",
        likeCount: 1,
        liked: true,
      }),
    ).toBe(true);
  });

  it("rejects unrelated action results", () => {
    expect(isCommunityEngagementActionResult(null)).toBe(false);
    expect(isCommunityEngagementActionResult({ kind: "listChange" })).toBe(false);
    expect(isCommunityEngagementActionResult({ kind: "communityPostCommentsChanged", postUid: "post-1" })).toBe(false);
    expect(isCommunityEngagementActionResult({ kind: "likeChanged", targetUid: "post-1", likeCount: 1 })).toBe(false);
    expect(isCommunityEngagementActionResult({})).toBe(false);
  });
});
