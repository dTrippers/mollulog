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

  it("keeps preference groups and feedback states semantically connected", () => {
    expect(preferencesSource).toContain("게임 컨텐츠 알림");
    expect(preferencesSource).toContain("몰루로그 알림");
    expect(preferencesSource).toContain('id="notification-game-content-heading"');
    expect(preferencesSource).toContain('aria-labelledby="notification-game-content-heading"');
    expect(preferencesSource).toContain('id="notification-mollulog-heading"');
    expect(preferencesSource).toContain('aria-labelledby="notification-mollulog-heading"');
    expect(preferencesSource).toMatch(/<Field\s+label="알림 시점"\s+htmlFor="notification-lead-hours"/);
    expect(preferencesSource).not.toContain("게임 컨텐츠 알림에 공통으로 적용돼요.");
    expect(preferencesSource).toContain("제안/문의에 답변이 작성되면 알림");
    expect(preferencesSource).toContain("내 이벤트 의견에 답글이 작성되면 알림");
    expect(preferencesSource).toContain('role="alert"');
    expect(preferencesSource).toContain('aria-live="polite"');
  });
});
