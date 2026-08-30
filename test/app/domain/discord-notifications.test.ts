import { describe, expect, it } from "@jest/globals";
import {
  formatDiscordNotificationMessage,
  getKstDateParts,
  isDiscordOAuthStateValid,
  isPastEffectiveAt,
  plannedSendAtForAnchor,
} from "~/domain/discord-notifications";

describe("Discord notification timing and copy", () => {
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
