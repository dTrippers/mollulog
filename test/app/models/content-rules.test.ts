import { describe, expect, it } from "@jest/globals";
import {
  COMMENT_ENABLED_WITHOUT_RECRUITMENT_CONTENT_TYPES,
  CONTENT_ORDER,
  SHOW_LINK_CONTENT_TYPES,
  TIMELINE_ONLY_CONTENT_TYPES,
} from "~/models/content-rules";

describe("live timeline content rules", () => {
  it("puts live first and exposes it only in linked timeline views", () => {
    expect(CONTENT_ORDER[0]).toBe("live");
    expect(SHOW_LINK_CONTENT_TYPES).toContain("live");
    expect(TIMELINE_ONLY_CONTENT_TYPES).toContain("live");
  });

  it("allows comments without recruitments", () => {
    expect(COMMENT_ENABLED_WITHOUT_RECRUITMENT_CONTENT_TYPES).toContain("live");
  });
});
