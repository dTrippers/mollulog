import { describe, expect, it } from "@jest/globals";
import {
  getFeedPostTimestamp,
  getFeedPostTypeLabel,
  getPickupAvatarSummary,
} from "~/components/v2/features/feed/feed-model";

describe("getPickupAvatarSummary", () => {
  it("shows up to three students in full", () => {
    expect(getPickupAvatarSummary([])).toEqual({ visible: [], remainingCount: 0 });
    expect(getPickupAvatarSummary(["a", "b", "c"])).toEqual({ visible: ["a", "b", "c"], remainingCount: 0 });
  });

  it("shows two avatars and the rest as a count from four students", () => {
    expect(getPickupAvatarSummary(["a", "b", "c", "d"])).toEqual({ visible: ["a", "b"], remainingCount: 2 });
    expect(getPickupAvatarSummary(["a", "b", "c", "d", "e", "f"])).toEqual({ visible: ["a", "b"], remainingCount: 4 });
  });
});

describe("getFeedPostTimestamp", () => {
  const base = { displayAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" };

  it("marks a user post updated after it was displayed as edited", () => {
    expect(
      getFeedPostTimestamp({ origin: "user", ...base, updatedAt: "2026-11-02T00:00:00Z" }, "Asia/Seoul").edited,
    ).toBe(true);
    expect(getFeedPostTimestamp({ origin: "user", ...base }, "Asia/Seoul").edited).toBe(false);
  });

  it("never marks a curated post as edited", () => {
    expect(
      getFeedPostTimestamp({ origin: "curated", ...base, updatedAt: "2026-11-02T00:00:00Z" }, "Asia/Seoul").edited,
    ).toBe(false);
  });
});

describe("getFeedPostTypeLabel", () => {
  it("labels the post types", () => {
    expect(getFeedPostTypeLabel("student_review")).toBe("학생 평가");
    expect(getFeedPostTypeLabel("recruitment_result")).toBe("모집 결과");
  });
});
