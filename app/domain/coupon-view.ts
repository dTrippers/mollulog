import { formatInstant, getInstantTime, parseUtcTimestamp } from "~/lib/date-time";

// Coupon times are game times on the Korean server.
export const COUPON_TIME_ZONE = "Asia/Seoul";

// The 사용완료/만료 tab shows this many cards, then 더 보기 adds as many again.
export const COUPON_HISTORY_PAGE_SIZE = 20;

export type CouponListTab = "available" | "history";

type CouponTiming = { expiresAt: string | null };

export function isCouponExpired(coupon: CouponTiming, now: Date | string = new Date()): boolean {
  if (coupon.expiresAt === null) return false;
  return getInstantTime(coupon.expiresAt) < getInstantTime(now);
}

// The tab is decided once, when the screen opens, so a card does not jump to the other tab when it is recorded.
export function getCouponListTab(coupon: CouponTiming, recordedAtLoad: boolean, now: Date | string): CouponListTab {
  return recordedAtLoad || isCouponExpired(coupon, now) ? "history" : "available";
}

export type CouponDeadline =
  | { kind: "none" }
  | { kind: "expired"; dateText: string }
  | { kind: "remaining"; dateText: string; remaining: CouponRemaining };

export type CouponRemaining = { unit: "days"; value: number } | { unit: "hours"; value: number };

// "11/24 23:59까지" with the time left, or the full date once it has passed.
export function getCouponDeadline(coupon: CouponTiming, now: Date | string): CouponDeadline {
  if (coupon.expiresAt === null) return { kind: "none" };
  if (isCouponExpired(coupon, now)) {
    return {
      kind: "expired",
      dateText: formatInstant(coupon.expiresAt, { timeZone: COUPON_TIME_ZONE, format: "YYYY/MM/DD HH:mm" }),
    };
  }
  return {
    kind: "remaining",
    dateText: formatInstant(coupon.expiresAt, { timeZone: COUPON_TIME_ZONE, format: "MM/DD HH:mm" }),
    remaining: getCouponRemaining(coupon.expiresAt, now),
  };
}

// Calendar days in KST from one day before, and whole hours (rounded up, at least 1) on the last day.
export function getCouponRemaining(expiresAt: string, now: Date | string): CouponRemaining {
  const until = parseUtcTimestamp(expiresAt).tz(COUPON_TIME_ZONE);
  const current = parseUtcTimestamp(now instanceof Date ? now.toISOString() : now).tz(COUPON_TIME_ZONE);
  const days = until.startOf("day").diff(current.startOf("day"), "day");
  if (days >= 1) return { unit: "days", value: days };
  const hours = Math.ceil(until.diff(current, "minute") / 60);
  return { unit: "hours", value: Math.max(1, hours) };
}

// The coupon uids an expiry alert carries in its link (`/coupons?alert=uid1,uid2`).
export function parseCouponAlertParam(value: string | null): string[] {
  if (!value) return [];
  const uids = value
    .split(",")
    .map((uid) => uid.trim())
    .filter((uid) => uid.length > 0 && uid.length <= 64);
  return [...new Set(uids)].slice(0, 50);
}

export type CouponAlertLanding = {
  // Coupons of the alert still in the 사용 가능 tab, to highlight.
  highlightUids: string[];
  // A line about the coupons of the alert that are not in the 사용 가능 tab, or null when every one of them is.
  notice: string | null;
};

// Coupons of the alert that are gone from 사용 가능: recorded (counted first) or expired. Unknown uids are ignored.
export function getCouponAlertLanding(
  alertUids: readonly string[],
  coupons: readonly (CouponTiming & { uid: string; recordedAtLoad: boolean })[],
  now: Date | string,
): CouponAlertLanding {
  const byUid = new Map(coupons.map((coupon) => [coupon.uid, coupon]));
  const known = alertUids.flatMap((uid) => {
    const coupon = byUid.get(uid);
    return coupon ? [coupon] : [];
  });
  const recorded = known.filter((coupon) => coupon.recordedAtLoad).length;
  const expired = known.filter((coupon) => !coupon.recordedAtLoad && isCouponExpired(coupon, now)).length;
  const highlightUids = known
    .filter((coupon) => getCouponListTab(coupon, coupon.recordedAtLoad, now) === "available")
    .map((coupon) => coupon.uid);
  return { highlightUids, notice: formatCouponAlertNotice(known.length, expired, recorded) };
}

export function formatCouponAlertNotice(total: number, expired: number, recorded: number): string | null {
  if (total === 0 || expired + recorded === 0) return null;
  if (total === 1) {
    return expired === 1 ? "이 알림의 쿠폰은 이미 만료됐어요" : "이 알림의 쿠폰은 이미 사용 완료로 기록했어요";
  }
  if (expired === total) return "이 알림의 쿠폰은 이미 모두 만료됐어요";
  if (recorded === total) return "이 알림의 쿠폰은 이미 모두 사용 완료로 기록했어요";
  if (recorded === 0) return `이 알림의 쿠폰 중 ${expired}개는 이미 만료됐어요`;
  if (expired === 0) return `이 알림의 쿠폰 중 ${recorded}개는 이미 사용 완료로 기록했어요`;
  if (expired + recorded === total) {
    return `이 알림의 쿠폰 중 ${expired}개는 이미 만료됐고, 나머지 ${recorded}개는 이미 사용 완료로 기록했어요`;
  }
  return `이 알림의 쿠폰 중 ${expired}개는 이미 만료됐고, ${recorded}개는 이미 사용 완료로 기록했어요`;
}

export type CouponAlertStatus =
  | { kind: "on" }
  | { kind: "off" }
  | { kind: "discord"; state: "missing" | "pending" | "failed" };

// 켜짐 and 꺼짐 are a badge; a Discord connection problem is the row's second line instead, so the row title never wraps.
export function getCouponAlertRowText(status: CouponAlertStatus): { badge?: string; description?: string } {
  if (status.kind === "on") return { badge: "켜짐" };
  if (status.kind === "off") return { badge: "꺼짐" };
  if (status.state === "pending") return { description: "Discord 연결 확인 중" };
  if (status.state === "failed") return { description: "Discord 연결 실패" };
  return { description: "Discord 미연결" };
}
