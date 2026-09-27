import { cacheKey, fetchRouteCached } from "~/lib/cache";
import { captureServerError, getLogger } from "~/lib/observability.server";
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
import { getAllRaidSchedules } from "~/models/raid";
import { getNavigationMenuBadges } from "~/models/navigation-menu-badges";
import type { TimelineContent } from "~/models/timeline-content";
import { getTimelineContentsByContentTypes } from "~/models/timeline-content.server";
import {
  resolveMenuBadgeOverrides,
  type NavigationMenuId,
  type ResolvedMenuBadgeOverride,
} from "~/domain/navigation-menu-badges";

export type NavigationBarContents = {
  upcomingEvent: {
    uid: string;
    since: UtcIsoString;
    until: UtcIsoString;
  } | null;
  hasRecentNews: boolean;
  hasOngoingRaid: boolean;
  hasActiveCoupons: boolean;
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
  unreadNotificationCount: number;
  menuBadgeOverrides: Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>>;
};

export type NavigationBarContentsRaw = {
  eventCandidates: {
    uid: string;
    startAt: UtcIsoString;
    endAt: UtcIsoString | null;
    runType: TimelineContent["runType"];
    contentType: TimelineContent["contentType"];
    shopContentUid: string | null;
  }[];
  latestNewsTime: UtcIsoString | null;
  raidActivePeriods: { startAt: UtcIsoString | null; endAt: UtcIsoString | null }[];
  couponActivePeriods: { endAt: UtcIsoString | null }[];
};

const MENU_BADGE_CACHE_FRESH_TTL = 30;
const MENU_BADGE_CACHE_MAX_STALE_TTL = 5 * 60;
const MENU_BADGE_CACHE_EXPIRATION_TTL = 10 * 60;

async function getCachedNavigationMenuBadgeOverrides(
  env: Env,
  now: Date,
  ctx?: ExecutionContext,
): Promise<Partial<Record<NavigationMenuId, ResolvedMenuBadgeOverride>>> {
  let storedBadges: Awaited<ReturnType<typeof getNavigationMenuBadges>>;
  try {
    storedBadges = await fetchRouteCached(
      env,
      ctx,
      cacheKey("route", "navigation-menu-badges", 1, "all"),
      () => getNavigationMenuBadges(env, { ctx }),
      false,
      {
        freshTtl: MENU_BADGE_CACHE_FRESH_TTL,
        maxStaleTtl: MENU_BADGE_CACHE_MAX_STALE_TTL,
        expirationTtl: MENU_BADGE_CACHE_EXPIRATION_TTL,
      },
    );
  } catch (error) {
    getLogger(env, ctx, { view: "navigation_menu_badges" }).error("Failed to load navigation menu badges", error, {
      operation: "list",
    });
    captureServerError(error, { view: "navigation_menu_badges", operation: "list" });
    return {};
  }

  const { overrides, warnings } = resolveMenuBadgeOverrides(storedBadges, now);
  const logger = warnings.length > 0 ? getLogger(env, ctx, { view: "navigation_menu_badges" }) : null;
  for (const warning of warnings) {
    logger?.warn("Ignored invalid navigation menu badge data", {
      operation: "resolve",
      menuId: warning.menuId,
      reason: warning.reason,
    });
  }
  return overrides;
}

export async function getNavigationBarContentsRaw(
  env: Env,
  forceRefresh = false,
  ctx?: ExecutionContext,
): Promise<NavigationBarContentsRaw> {
  return fetchRouteCached(
    env,
    ctx,
    cacheKey("route", "navigation-bar", 5, "raw"),
    async () => {
      const now = nowUtcIso();
      const [contents, latestNewsTime, raidSchedules, coupons] = await Promise.all([
        // Main stories can own an event shop, so include those as calculator candidates too.
        getTimelineContentsByContentTypes(env, ["event", "main_story"], now, { ctx }),
        getLatestPostTime(env, "news", { ctx }),
        getAllRaidSchedules(env, forceRefresh),
        getAllCoupons(env, { ctx }),
      ]);

      return {
        eventCandidates: contents
          .filter(
            (content) =>
              (content.contentType === "event" && content.runType !== "permanent") ||
              (content.contentType === "main_story" && content.shopContentUid !== null),
          )
          .map((content) => ({
            uid: content.uid,
            startAt: content.startAt,
            endAt: content.endAt,
            runType: content.runType,
            contentType: content.contentType,
            shopContentUid: content.shopContentUid,
          })),
        latestNewsTime: latestNewsTime ? toUtcIso(latestNewsTime) : null,
        raidActivePeriods: raidSchedules
          .filter((schedule) => schedule.raidType === "total_assault" || schedule.raidType === "elimination")
          .map((schedule) => ({
            startAt: schedule.startAt,
            endAt: schedule.endAt,
          })),
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
  const nowDate = new Date(now);
  const [raw, personalNavigation, menuBadgeOverrides] = await Promise.all([
    getNavigationBarContentsRaw(publicReadEnv, forceRefresh, ctx),
    userId
      ? getPersonalNavigationState(env, userId, { ctx })
      : Promise.resolve({ hasUnconsumedCoupons: false, hasUnreadFeedbackReplies: false, unreadNotificationCount: 0 }),
    getCachedNavigationMenuBadgeOverrides(publicReadEnv, nowDate, ctx),
  ]);
  const shopCandidates = raw.eventCandidates.filter(
    (content) =>
      content.endAt &&
      isInstantAfter(content.endAt, now) &&
      (content.contentType === "event" || content.shopContentUid !== null),
  );
  const ongoingEvent = shopCandidates
    .filter((content) => content.contentType === "event" && !isInstantAfter(content.startAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt))[0];
  const ongoingMainStory = shopCandidates
    .filter((content) => content.contentType === "main_story" && !isInstantAfter(content.startAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt))[0];
  const upcomingEventContent =
    ongoingEvent ?? ongoingMainStory ?? shopCandidates.sort((a, b) => compareInstantAsc(a.startAt, b.startAt))[0];
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
    hasOngoingRaid: raw.raidActivePeriods.some(
      (period) =>
        period.startAt !== null &&
        period.endAt !== null &&
        !isInstantAfter(period.startAt, now) &&
        isInstantAfter(period.endAt, now),
    ),
    hasActiveCoupons: raw.couponActivePeriods.some(
      (period) => period.endAt === null || isInstantAfter(period.endAt, now),
    ),
    hasUnconsumedCoupons: personalNavigation.hasUnconsumedCoupons,
    hasUnreadFeedbackReplies: personalNavigation.hasUnreadFeedbackReplies,
    unreadNotificationCount: personalNavigation.unreadNotificationCount,
    menuBadgeOverrides,
  };
}
