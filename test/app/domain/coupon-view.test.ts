import { describe, expect, it } from "@jest/globals";
import {
  formatCouponAlertNotice,
  getCouponAlertLanding,
  getCouponAlertRowText,
  getCouponDeadline,
  getCouponListTab,
  getCouponRemaining,
  isCouponExpired,
  parseCouponAlertParam,
} from "~/domain/coupon-view";

// 2026-11-21 12:00 KST
const now = "2026-11-21T03:00:00.000Z";

describe("coupon list tab", () => {
  it("keeps an active unrecorded coupon in 사용 가능", () => {
    expect(getCouponListTab({ expiresAt: "2026-11-24T14:59:00.000Z" }, false, now)).toBe("available");
  });

  it("moves a recorded or expired coupon to 사용완료/만료", () => {
    expect(getCouponListTab({ expiresAt: "2026-11-24T14:59:00.000Z" }, true, now)).toBe("history");
    expect(getCouponListTab({ expiresAt: "2026-11-21T02:59:59.999Z" }, false, now)).toBe("history");
  });

  it("never expires a coupon without a deadline", () => {
    expect(isCouponExpired({ expiresAt: null }, now)).toBe(false);
    expect(getCouponListTab({ expiresAt: null }, false, now)).toBe("available");
  });
});

describe("coupon deadline", () => {
  it("shows the KST deadline with whole calendar days left", () => {
    expect(getCouponDeadline({ expiresAt: "2026-11-24T14:59:00.000Z" }, now)).toEqual({
      kind: "remaining",
      dateText: "11/24 23:59",
      remaining: { unit: "days", value: 3 },
    });
  });

  it("counts calendar days in KST, not 24-hour spans", () => {
    // 11/22 00:30 KST is one calendar day later though only 12.5 hours away.
    expect(getCouponRemaining("2026-11-21T15:30:00.000Z", now)).toEqual({ unit: "days", value: 1 });
  });

  it("switches to hours on the last day, rounded up and at least 1", () => {
    expect(getCouponRemaining("2026-11-21T14:59:00.000Z", now)).toEqual({ unit: "hours", value: 12 });
    expect(getCouponRemaining("2026-11-21T03:10:00.000Z", now)).toEqual({ unit: "hours", value: 1 });
  });

  it("shows the full date once expired, and nothing to count without a deadline", () => {
    expect(getCouponDeadline({ expiresAt: "2025-12-31T14:59:00.000Z" }, now)).toEqual({
      kind: "expired",
      dateText: "2025/12/31 23:59",
    });
    expect(getCouponDeadline({ expiresAt: null }, now)).toEqual({ kind: "none" });
  });
});

describe("coupon alert landing", () => {
  const coupon = (uid: string, expiresAt: string | null, recordedAtLoad: boolean) => ({
    uid,
    expiresAt,
    recordedAtLoad,
  });
  const active = "2026-11-24T14:59:00.000Z";
  const expired = "2026-11-20T14:59:00.000Z";

  it("reads unique, bounded coupon uids from the link", () => {
    expect(parseCouponAlertParam(null)).toEqual([]);
    expect(parseCouponAlertParam("a, b,,a")).toEqual(["a", "b"]);
    expect(parseCouponAlertParam("x".repeat(65))).toEqual([]);
  });

  it("highlights the coupons still in 사용 가능 and says nothing when all of them are", () => {
    expect(getCouponAlertLanding(["a", "b"], [coupon("a", active, false), coupon("b", null, false)], now)).toEqual({
      highlightUids: ["a", "b"],
      notice: null,
    });
  });

  it("counts recorded coupons before expired ones and ignores unknown uids", () => {
    const landing = getCouponAlertLanding(
      ["a", "b", "c", "gone"],
      [coupon("a", active, false), coupon("b", expired, true), coupon("c", expired, false)],
      now,
    );
    expect(landing).toEqual({
      highlightUids: ["a"],
      notice: "이 알림의 쿠폰 중 1개는 이미 만료됐고, 1개는 이미 사용 완료로 기록했어요",
    });
  });

  it("words every case of the notice", () => {
    expect(formatCouponAlertNotice(0, 0, 0)).toBeNull();
    expect(formatCouponAlertNotice(2, 0, 0)).toBeNull();
    expect(formatCouponAlertNotice(1, 1, 0)).toBe("이 알림의 쿠폰은 이미 만료됐어요");
    expect(formatCouponAlertNotice(1, 0, 1)).toBe("이 알림의 쿠폰은 이미 사용 완료로 기록했어요");
    expect(formatCouponAlertNotice(2, 2, 0)).toBe("이 알림의 쿠폰은 이미 모두 만료됐어요");
    expect(formatCouponAlertNotice(2, 0, 2)).toBe("이 알림의 쿠폰은 이미 모두 사용 완료로 기록했어요");
    expect(formatCouponAlertNotice(3, 1, 0)).toBe("이 알림의 쿠폰 중 1개는 이미 만료됐어요");
    expect(formatCouponAlertNotice(3, 0, 2)).toBe("이 알림의 쿠폰 중 2개는 이미 사용 완료로 기록했어요");
    expect(formatCouponAlertNotice(3, 1, 2)).toBe(
      "이 알림의 쿠폰 중 1개는 이미 만료됐고, 나머지 2개는 이미 사용 완료로 기록했어요",
    );
    expect(formatCouponAlertNotice(4, 1, 2)).toBe(
      "이 알림의 쿠폰 중 1개는 이미 만료됐고, 2개는 이미 사용 완료로 기록했어요",
    );
  });
});

describe("coupon alert row", () => {
  it("shows on and off as a badge and a Discord problem as the second line", () => {
    expect(getCouponAlertRowText({ kind: "on" })).toEqual({ badge: "켜짐" });
    expect(getCouponAlertRowText({ kind: "off" })).toEqual({ badge: "꺼짐" });
    expect(getCouponAlertRowText({ kind: "discord", state: "missing" })).toEqual({ description: "Discord 미연결" });
    expect(getCouponAlertRowText({ kind: "discord", state: "pending" })).toEqual({
      description: "Discord 연결 확인 중",
    });
    expect(getCouponAlertRowText({ kind: "discord", state: "failed" })).toEqual({ description: "Discord 연결 실패" });
  });
});
