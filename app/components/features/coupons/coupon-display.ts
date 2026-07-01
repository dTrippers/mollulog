import type { Coupon } from "~/models/coupon";

export type CouponDisplayStatus = "available" | "history";

export function isCouponExpired(coupon: Pick<Coupon, "expiresAt">, now = new Date()): boolean {
  if (coupon.expiresAt === null) return false;
  return new Date(coupon.expiresAt).getTime() < now.getTime();
}

export function getCouponDisplayStatus(
  coupon: Pick<Coupon, "expiresAt">,
  registeredAtLoad: boolean,
  now = new Date(),
): CouponDisplayStatus {
  if (registeredAtLoad || isCouponExpired(coupon, now)) return "history";
  return "available";
}
