import { describe, expect, it } from "@jest/globals";
import { getCouponDisplayStatus, isCouponExpired } from "~/components/features/coupons/coupon-display";

const now = new Date("2026-07-02T00:00:00.000Z");

describe("coupon display status", () => {
  it("treats an active unregistered coupon as available", () => {
    expect(getCouponDisplayStatus({ expiresAt: "2026-07-03T00:00:00.000Z" }, false, now)).toBe("available");
  });

  it("treats an active registered coupon as history", () => {
    expect(getCouponDisplayStatus({ expiresAt: "2026-07-03T00:00:00.000Z" }, true, now)).toBe("history");
  });

  it("treats an expired unregistered coupon as history", () => {
    expect(getCouponDisplayStatus({ expiresAt: "2026-07-01T23:59:59.999Z" }, false, now)).toBe("history");
  });

  it("treats a coupon without an expiry as active", () => {
    expect(isCouponExpired({ expiresAt: null }, now)).toBe(false);
    expect(getCouponDisplayStatus({ expiresAt: null }, false, now)).toBe("available");
  });
});
