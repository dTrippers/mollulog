import {
  countPostgresUnregisteredActiveCoupons,
  getPostgresCouponRegistrations,
  getPostgresCoupons,
  hasPostgresActiveCoupons,
  hasPostgresUnregisteredActiveCoupons,
  type PostgresCouponOptions,
  registerPostgresCoupon,
  unregisterPostgresCoupon,
} from "~/db/postgres/coupons";

export type { Coupon } from "~/db/postgres/coupons";
export type { CouponReward } from "~/domain/coupon";

export function getAllCoupons(env: Env, options: PostgresCouponOptions = {}) {
  return getPostgresCoupons(env, options);
}

export function hasActiveCoupons(env: Env, options: PostgresCouponOptions = {}) {
  return hasPostgresActiveCoupons(env, options);
}

export function hasUnregisteredActiveCoupons(env: Env, userId: number, options: PostgresCouponOptions = {}) {
  return hasPostgresUnregisteredActiveCoupons(env, userId, options);
}

export function countUnregisteredActiveCoupons(env: Env, userId: number, options: PostgresCouponOptions = {}) {
  return countPostgresUnregisteredActiveCoupons(env, userId, options);
}

export function getCouponRegistrations(env: Env, userId: number, options: PostgresCouponOptions = {}) {
  return getPostgresCouponRegistrations(env, userId, options);
}

export function registerCoupon(env: Env, userId: number, couponId: number, options: PostgresCouponOptions = {}) {
  return registerPostgresCoupon(env, userId, couponId, options);
}

export function unregisterCoupon(env: Env, userId: number, couponId: number, options: PostgresCouponOptions = {}) {
  return unregisterPostgresCoupon(env, userId, couponId, options);
}
