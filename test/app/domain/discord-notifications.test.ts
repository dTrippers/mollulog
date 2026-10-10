import { describe, expect, it } from "@jest/globals";
import {
  formatDiscordNotificationMessage,
  getEnabledTriggers,
  getKstDateParts,
  isDiscordOAuthStateValid,
  isPastEffectiveAt,
  plannedSendAtForAnchor,
} from "~/domain/discord-notifications";

describe("Discord notification timing and copy", () => {
  it("formats fixed messages for reactive reply triggers without source content", () => {
    expect(
      formatDiscordNotificationMessage({
        trigger: "feedback-reply",
        sourceAnchor: "2026-09-01T02:00:00.000Z",
        contentName: "should not be included",
      }),
    ).toBe("작성한 제안/문의에 운영팀 답변이 등록되었습니다.");
    expect(
      formatDiscordNotificationMessage({
        trigger: "event-opinion-reply",
        sourceAnchor: "2026-09-01T02:00:00.000Z",
      }),
    ).toBe("작성한 이벤트 의견에 새 답글이 등록되었습니다.");
  });

  it("maps the schedule settings to their notification triggers", () => {
    expect(
      getEnabledTriggers({
        eventStartEnabled: true,
        eventEndEnabled: false,
        offlineEventEnabled: false,
        rewardExchangeEndEnabled: false,
        recruitmentStartEnabled: false,
        shopResetEnabled: false,
        feedbackReplyEnabled: true,
        eventOpinionReplyEnabled: true,
        leadHours: 24,
      }),
    ).toEqual(["event-start", "feedback-reply", "event-opinion-reply"]);
  });

  it("uses one offline-event preference for start and optional end notifications", () => {
    expect(
      getEnabledTriggers({
        eventStartEnabled: false,
        eventEndEnabled: false,
        offlineEventEnabled: true,
        rewardExchangeEndEnabled: false,
        recruitmentStartEnabled: false,
        shopResetEnabled: false,
        feedbackReplyEnabled: false,
        eventOpinionReplyEnabled: false,
        leadHours: 24,
      }),
    ).toEqual(["offline-event-start", "offline-event-end"]);
  });

  it("formats offline-event start and end messages with the shared source time", () => {
    const sourceAnchor = "2026-09-01T02:00:00.000Z";
    expect(formatDiscordNotificationMessage({ trigger: "offline-event-start", sourceAnchor, contentName: "XXX" })).toBe(
      '9/1(화) 11:00, "XXX" 행사 일정이 시작됩니다.',
    );
    expect(formatDiscordNotificationMessage({ trigger: "offline-event-end", sourceAnchor, contentName: "XXX" })).toBe(
      '9/1(화) 11:00, "XXX" 행사 일정이 종료됩니다.',
    );
  });

  it("formats KST across a day boundary with the exact event copy", () => {
    const anchor = new Date("2026-08-31T15:00:00.000Z");
    expect(getKstDateParts(anchor)).toMatchObject({ year: 2026, month: 9, day: 1, hour: 0 });
    expect(formatDiscordNotificationMessage({ trigger: "event-start", sourceAnchor: anchor, contentName: "XXX" })).toBe(
      '9/1(화) 00:00, "XXX" 이벤트가 시작됩니다.',
    );
  });

  it("schedules the default alert exactly 24 hours before the source anchor", () => {
    expect(plannedSendAtForAnchor("2026-09-02T03:00:00.000Z", 24).toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  it("rejects lead times outside 1 to 24 hours", () => {
    expect(() => plannedSendAtForAnchor("2026-09-02T03:00:00.000Z", 0)).toThrow("1시간 전부터 24시간 전");
    expect(() => plannedSendAtForAnchor("2026-09-02T03:00:00.000Z", 25)).toThrow("1시간 전부터 24시간 전");
  });

  it("never schedules a job whose planned time predates a settings change", () => {
    expect(isPastEffectiveAt("2026-09-01T02:00:00.000Z", "2026-09-01T03:00:00.000Z")).toBe(true);
    expect(isPastEffectiveAt("2026-09-01T03:00:00.000Z", "2026-09-01T03:00:00.000Z")).toBe(false);
  });

  it("formats recruitment names as one grouped immutable message", () => {
    expect(
      formatDiscordNotificationMessage({
        trigger: "recruitment-start",
        sourceAnchor: "2026-09-07T02:00:00.000Z",
        studentNames: ["XXX", "YYY"],
      }),
    ).toBe('9/7(월) 11:00, "XXX", "YYY" 학생의 모집이 시작됩니다.');
  });

  it("formats the monthly shop reset message from its KST source anchor", () => {
    expect(
      formatDiscordNotificationMessage({
        trigger: "shop-reset",
        sourceAnchor: "2026-08-31T19:00:00.000Z",
      }),
    ).toBe("9/1(화) 04:00, 상점이 초기화됩니다.");
  });

  it("blocks missing names rather than using an internal uid", () => {
    expect(() =>
      formatDiscordNotificationMessage({ trigger: "event-end", sourceAnchor: new Date(), contentName: null }),
    ).toThrow("이름을 확인할 수 없어");
  });

  it("requires a matching, session-bound OAuth state within ten minutes", () => {
    const now = 1_000_000;
    const value = { state: "state", userId: 7, createdAt: now - 9 * 60 * 1000 };
    expect(isDiscordOAuthStateValid(value, "state", 7, now)).toBe(true);
    expect(isDiscordOAuthStateValid(value, "other", 7, now)).toBe(false);
    expect(isDiscordOAuthStateValid(value, "state", 8, now)).toBe(false);
    expect(isDiscordOAuthStateValid({ ...value, createdAt: now - 10 * 60 * 1000 - 1 }, "state", 7, now)).toBe(false);
    expect(isDiscordOAuthStateValid({ ...value, createdAt: now + 1 }, "state", 7, now)).toBe(false);
  });
});
