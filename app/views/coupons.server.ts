import type { CouponAlertStatus } from "~/domain/coupon-view";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import { type Coupon, getAllCoupons, getCouponRegistrations } from "~/models/coupon";
import { getDiscordNotificationState } from "~/models/discord-notifications.server";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getSenseiPrivacyByUserId } from "~/models/sensei-privacy";

export type CouponRewardView = { itemUid: string; name: string; rarity: number; quantity: number };

export type CouponView = Omit<Coupon, "rewards"> & { rewards: CouponRewardView[] };

export type CouponViewer = {
  recordedCouponIds: number[];
  memberCode: string | null;
  // null when the alert setting could not be read; the row then shows no state.
  alertStatus: CouponAlertStatus | null;
};

export type CouponPageData = {
  loadedAt: string;
  coupons: { state: "loaded"; items: CouponView[] } | { state: "failed" };
  viewer: CouponViewer | null;
};

export async function getCouponPageData(
  env: Env,
  ctx: ExecutionContext,
  senseiId: number | null,
): Promise<CouponPageData> {
  const loadedAt = new Date().toISOString();
  const [coupons, viewer] = await Promise.all([
    loadCoupons(env, ctx),
    senseiId === null ? Promise.resolve(null) : loadViewer(env, ctx, senseiId),
  ]);
  return { loadedAt, coupons, viewer };
}

async function loadCoupons(env: Env, ctx: ExecutionContext): Promise<CouponPageData["coupons"]> {
  let coupons: Coupon[];
  try {
    coupons = await getAllCoupons(env, { ctx });
  } catch (error) {
    console.error("Failed to load coupons.", sanitizeErrorForLogging(error));
    return { state: "failed" };
  }
  const rewardNames = await loadRewardNames(env, coupons);
  return {
    state: "loaded",
    items: coupons.map((coupon) => ({
      ...coupon,
      // A reward whose item name cannot be resolved is left out rather than shown by its item ID.
      rewards: coupon.rewards.flatMap((reward) => {
        const item = rewardNames.get(reward.itemUid);
        return item
          ? [{ itemUid: reward.itemUid, name: item.name, rarity: item.rarity, quantity: reward.quantity }]
          : [];
      }),
    })),
  };
}

async function loadRewardNames(env: Env, coupons: Coupon[]): Promise<Map<string, { name: string; rarity: number }>> {
  if (!coupons.some((coupon) => coupon.rewards.length > 0)) return new Map();
  try {
    const catalog = await getItemCatalogResources(env);
    return new Map(catalog.map((item) => [item.uid, { name: item.name, rarity: item.rarity }]));
  } catch (error) {
    console.error("Failed to load coupon reward names.", sanitizeErrorForLogging(error));
    return new Map();
  }
}

async function loadViewer(env: Env, ctx: ExecutionContext, senseiId: number): Promise<CouponViewer> {
  const [recordedCouponIds, privacy, alertStatus] = await Promise.all([
    getCouponRegistrations(env, senseiId, { ctx }),
    getSenseiPrivacyByUserId(env, senseiId, { ctx }),
    loadAlertStatus(env, ctx, senseiId),
  ]);
  return { recordedCouponIds, memberCode: privacy?.memberCode ?? null, alertStatus };
}

async function loadAlertStatus(env: Env, ctx: ExecutionContext, senseiId: number): Promise<CouponAlertStatus | null> {
  try {
    const { connection, settings } = await getDiscordNotificationState(env, senseiId, { ctx });
    if (!connection) return { kind: "discord", state: "missing" };
    if (connection.status === "pending") return { kind: "discord", state: "pending" };
    if (connection.status === "failed") return { kind: "discord", state: "failed" };
    return { kind: settings.couponExpiryEnabled ? "on" : "off" };
  } catch (error) {
    console.error("Failed to load the coupon alert setting.", sanitizeErrorForLogging(error));
    return null;
  }
}
