import { cacheKey, fetchRouteCached } from "~/lib/cache";
import {
  compareInstantAsc,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
  toUtcIso,
  type UtcIsoString,
} from "~/lib/date-time";
import { getAllCoupons } from "~/models/coupon";
import { getPersonalNavigationState } from "~/models/personal-navigation";
import { getLatestPostTime } from "~/models/post";
import type { TimelineContent } from "~/models/timeline-content";
import { getTimelineContentsByContentTypes } from "~/models/timeline-content.server";

export type NavigationBarContents = {
  upcomingEvent: {
    uid: string;
    since: UtcIsoString;
    until: UtcIsoString;
  } | null;
  hasRecentNews: boolean;
  hasActiveCoupons: boolean;
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
};

export type NavigationBarContentsRaw = {
  eventCandidates: {
    uid: string;
    startAt: UtcIsoString;
    endAt: UtcIsoString | null;
    runType: TimelineContent["runType"];
  }[];
  latestNewsTime: UtcIsoString | null;
  couponActivePeriods: { endAt: UtcIsoString | null }[];
};

export async function getNavigationBarContentsRaw(
  env: Env,
  forceRefresh = false,
  ctx?: ExecutionContext,
): Promise<NavigationBarContentsRaw> {
  return fetchRouteCached(
    env,
    ctx,
    cacheKey("route", "navigation-bar", 3, "raw"),
    async () => {
      const now = nowUtcIso();
      const [contents, latestNewsTime, coupons] = await Promise.all([
        // Limit results to active and future events (endAt >= now).
        getTimelineContentsByContentTypes(env, ["event"], now, { ctx }),
        getLatestPostTime(env, "news"),
        getAllCoupons(env),
      ]);

      return {
        eventCandidates: contents
          .filter((content) => content.runType !== "permanent")
          .map((content) => ({
            uid: content.uid,
            startAt: content.startAt,
            endAt: content.endAt,
            runType: content.runType,
          })),
        latestNewsTime: latestNewsTime ? toUtcIso(latestNewsTime) : null,
        couponActivePeriods: coupons.map((coupon) => ({
          endAt: coupon.expiresAt ? toUtcIso(coupon.expiresAt) : null,
        })),
      };
    },
    forceRefresh,
  );
}

export async function getNavigationBarContents(
  env: Env,
  forceRefresh = false,
  userId?: number,
  ctx?: ExecutionContext,
  publicReadEnv: Env = env,
): Promise<NavigationBarContents> {
  const now = nowUtcIso();
  const [raw, personalNavigation] = await Promise.all([
    getNavigationBarContentsRaw(publicReadEnv, forceRefresh, ctx),
    userId
      ? getPersonalNavigationState(env, userId)
      : Promise.resolve({ hasUnconsumedCoupons: false, hasUnreadFeedbackReplies: false }),
  ]);
  const upcomingEventContent = raw.eventCandidates
    .filter((content) => content.endAt && isInstantAfter(content.endAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt))[0];
  const upcomingEvent = upcomingEventContent
    ? {
        uid: upcomingEventContent.uid,
        since: upcomingEventContent.startAt,
        until: upcomingEventContent.endAt ?? upcomingEventContent.startAt,
      }
    : null;

  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  return {
    upcomingEvent,
    hasRecentNews: raw.latestNewsTime !== null && !isInstantBefore(raw.latestNewsTime, threeDaysAgo),
    hasActiveCoupons: raw.couponActivePeriods.some(
      (period) => period.endAt === null || isInstantAfter(period.endAt, now),
    ),
    hasUnconsumedCoupons: personalNavigation.hasUnconsumedCoupons,
    hasUnreadFeedbackReplies: personalNavigation.hasUnreadFeedbackReplies,
  };
}
