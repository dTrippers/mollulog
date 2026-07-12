import { drizzle } from "drizzle-orm/d1";
import { buildUnregisteredActiveCouponsQuery } from "./coupon";
import { buildUnreadAdminFeedbackRepliesQuery } from "./feedback";

export type PersonalNavigationState = {
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
};

export async function getPersonalNavigationState(env: Env, userId: number): Promise<PersonalNavigationState> {
  const db = drizzle(env.DB);
  const nowIso = new Date().toISOString();
  const [couponRows, feedbackRows] = await db.batch([
    buildUnregisteredActiveCouponsQuery(db, userId, nowIso),
    buildUnreadAdminFeedbackRepliesQuery(db, userId),
  ]);

  return {
    hasUnconsumedCoupons: couponRows.length > 0,
    hasUnreadFeedbackReplies: feedbackRows.length > 0,
  };
}
