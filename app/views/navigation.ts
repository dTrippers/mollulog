import { compareInstantAsc, type UtcIsoString, isInstantAfter, isInstantBefore, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { cacheKey, fetchRouteCached } from "~/lib/cache";
import { getAllCoupons, hasUnregisteredActiveCoupons } from "~/models/coupon";
import { hasUnreadAdminFeedbackReplies } from "~/models/feedback";
import { getLatestPostTime } from "~/models/post";
import { getTimelineContentsByContentTypes } from "~/models/timeline-content";
import type { TimelineContent } from "~/models/timeline-content";

const NAVIGATION_BAR_CONTENTS_RAW_CACHE_KEY = cacheKey("route", "navigation-bar", 1, "raw");

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
    NAVIGATION_BAR_CONTENTS_RAW_CACHE_KEY,
    async () => {
      const now = nowUtcIso();
      const [contents, latestNewsTime, coupons] = await Promise.all([
        // Limit D1 results to active and future events (endAt >= now).
        getTimelineContentsByContentTypes(env, ["event"], now),
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
): Promise<NavigationBarContents> {
  const now = nowUtcIso();
  const [raw, personalRedDots] = await Promise.all([
    getNavigationBarContentsRaw(env, forceRefresh, ctx),
    userId
      ? Promise.all([hasUnregisteredActiveCoupons(env, userId), hasUnreadAdminFeedbackReplies(env, userId)])
      : Promise.resolve([false, false] as const),
  ]);
  const [hasUnconsumedCoupons, hasUnreadFeedbackReplies] = personalRedDots;
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
    hasUnconsumedCoupons,
    hasUnreadFeedbackReplies,
  };
}
