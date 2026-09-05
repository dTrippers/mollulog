import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const preferencesSource = readFileSync("app/routes/notifications._components/NotificationPreferencesCard.tsx", "utf8");
const toggleSource = readFileSync("app/components/primitives/Toggle.tsx", "utf8");

describe("notification preference accessibility", () => {
  it("gives every notification switch a direct accessible name", () => {
    for (const label of [
      "이벤트 시작",
      "이벤트 종료",
      "이벤트 보상 교환 종료",
      "학생 모집 시작",
      "상점 초기화 알림",
      "제안/문의 답글",
      "이벤트 의견 답글",
    ]) {
      expect(preferencesSource).toContain(`aria-label="${label}"`);
    }

    expect(preferencesSource).not.toContain("notification-event-start-label");
    expect(preferencesSource).not.toContain("notification-event-start-description");
    expect(preferencesSource).not.toContain("notification-feedback-reply-label");
    expect(preferencesSource).not.toContain("notification-feedback-reply-description");
    expect(toggleSource).not.toContain('"aria-labelledby"?: string');
    expect(toggleSource).not.toContain('"aria-describedby"?: string');
  });
});
