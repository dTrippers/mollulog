import { describe, expect, it } from "@jest/globals";
import {
  formatNotificationRelativeTime,
  getNotificationTypeLabel,
  toNotificationHistoryItem,
} from "~/domain/notification-history";

const now = new Date("2026-09-07T12:00:00.000Z");

describe("notification history domain", () => {
  it.each([
    ["2026-09-07T11:59:45.000Z", "방금"],
    ["2026-09-07T11:55:00.000Z", "5분 전"],
    ["2026-09-07T10:00:00.000Z", "2시간 전"],
    ["2026-09-04T12:00:00.000Z", "3일 전"],
  ])("formats relative delivery time %s", (deliveredAt, expected) => {
    expect(formatNotificationRelativeTime(deliveredAt, now)).toBe(expected);
  });

  it("maps supported triggers and preserves only safe internal actions", () => {
    expect(
      toNotificationHistoryItem({
        uid: "job-1",
        trigger: "connection-verification",
        payload: {
          message: "Discord 연결이 확인되었습니다.",
          action: { label: "알림 설정 바로가기", url: "https://mollulog.net/notifications?source=bell" },
        },
        deliveredAt: new Date("2026-09-07T11:00:00.000Z"),
        isUnread: true,
        now,
      }),
    ).toEqual({
      uid: "job-1",
      typeLabel: "Discord 연결 확인",
      relativeTime: "1시간 전",
      deliveredAt: "2026-09-07T11:00:00.000Z",
      message: { state: "available", text: "Discord 연결이 확인되었습니다." },
      action: { state: "available", label: "알림 설정 바로가기", to: "/notifications?source=bell" },
      isUnread: true,
    });
  });

  it("does not expose malformed message, trigger, or external action data", () => {
    const item = toNotificationHistoryItem({
      uid: "job-2",
      trigger: "unknown-internal-trigger",
      payload: {
        message: { raw: "internal" },
        action: { label: "내부 ID", url: "https://mollulog.net/admin" },
      },
      deliveredAt: new Date("2026-09-07T11:59:00.000Z"),
      isUnread: false,
      now,
    });
    if (!item) {
      throw new Error("Expected a valid notification history item");
    }

    expect(item.typeLabel).toBe("알림");
    expect(item.message).toEqual({ state: "unavailable", text: "알림 내용을 불러올 수 없어요." });
    expect(item.action).toEqual({ state: "unavailable", text: "연결 화면을 열 수 없어요." });
    expect(item.isUnread).toBe(false);
  });

  it("does not create a history item for a missing or malformed job uid", () => {
    const input = {
      trigger: "event-start",
      payload: { message: "이벤트가 시작됩니다." },
      deliveredAt: new Date("2026-09-07T11:00:00.000Z"),
      isUnread: true,
    };

    expect(toNotificationHistoryItem({ ...input, uid: null })).toBeNull();
    expect(toNotificationHistoryItem({ ...input, uid: " " })).toBeNull();
    expect(toNotificationHistoryItem({ ...input, uid: 42 })).toBeNull();
  });

  it("uses a generic safe label for an unsupported trigger", () => {
    expect(getNotificationTypeLabel("internal-trigger")).toBe("알림");
    expect(getNotificationTypeLabel("event-start")).toBe("이벤트 시작");
  });
});
