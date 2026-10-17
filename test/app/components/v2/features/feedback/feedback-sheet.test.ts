import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { buildFeedbackFormData, SCANNER_FEEDBACK_ACTION } from "~/components/v2/features/feedback/FeedbackSheet";

const input = {
  featureName: "스크린샷 인식기",
  feedbackType: "resource_scanner_feedback" as const,
  description: "  사진이 흐려요  ",
  path: "/scanner/resource?job=abc",
  timestamp: "2026-10-17T00:00:00.000Z",
  viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
  userAgent: "test-agent",
};

describe("v2 feedback sheet request", () => {
  it("posts to /contact with the same title, content, and diagnostic payload as the 1.x button", () => {
    const formData = buildFeedbackFormData(input);
    expect(SCANNER_FEEDBACK_ACTION).toBe("/contact");
    expect(formData.get("title")).toBe("스크린샷 인식기 의견/오류 제보 (/scanner/resource?job=abc)");
    expect(formData.get("content")).toBe("사진이 흐려요");
    expect(JSON.parse(String(formData.get("additional")))).toEqual({
      type: "resource_scanner_feedback",
      version: 1,
      payload: {
        timestamp: "2026-10-17T00:00:00.000Z",
        path: "/scanner/resource?job=abc",
        viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
        userAgent: "test-agent",
      },
    });
  });

  it("uses the default content when no description is written", () => {
    const formData = buildFeedbackFormData({ ...input, description: "   " });
    expect(formData.get("content")).toBe("추가 설명이 입력되지 않았습니다.");
  });

  it("matches the 1.x FeatureFeedbackButton request strings it must keep", () => {
    // Parity check against the source of the 1.x button, which stays in use for the walkthrough timeline.
    const legacy = readFileSync(
      join(process.cwd(), "app/components/features/feedback/FeatureFeedbackButton.tsx"),
      "utf8",
    );
    expect(legacy).toContain('action: "/contact"');
    expect(legacy).toContain("의견/오류 제보 (");
    expect(legacy).toContain('formData.append("title"');
    expect(legacy).toContain('"추가 설명이 입력되지 않았습니다."');
    expect(legacy).toContain("version: 1,");
  });
});
