import type { HomeCampaign, HomeJointFiringDrill } from "~/domain/home-content";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchLazySourceCached, ROUTE_CACHE_FRESH_TTL } from "~/lib/cache";
import { toUtcIso } from "~/lib/date-time";

const HOME_CAMPAIGNS_CACHE_KEY = cacheKey("source", "home-campaigns", 2, "region=gl");
const HOME_JOINT_FIRING_DRILLS_CACHE_KEY = cacheKey("source", "home-joint-firing-drills", 2, "region=gl");

const homeCampaignsQuery = graphql(`
  query HomeCampaigns($region: String!, $endAfter: ISO8601DateTime) {
    campaigns(region: $region, endAfter: $endAfter) {
      uid
      category
      multiplier
      startAt
      endAt
    }
  }
`);

const homeJointFiringDrillsQuery = graphql(`
  query HomeJointFiringDrills($endAfter: ISO8601DateTime, $startBefore: ISO8601DateTime) {
    jointFiringDrills(endAfter: $endAfter, startBefore: $startBefore) {
      season
      drillType
      schedules {
        region
        startAt
        endAt
      }
    }
  }
`);

export function getHomeCampaigns(env: Env, forceRefresh = false) {
  return fetchLazySourceCached(
    env,
    HOME_CAMPAIGNS_CACHE_KEY,
    async (): Promise<HomeCampaign[]> => {
      const { data, error } = await runQuery(homeCampaignsQuery, {
        region: "gl",
        endAfter: new Date(),
      });
      if (error || !data) {
        throw error ?? new Error("failed to fetch home campaigns");
      }

      return data.campaigns.map((campaign) => ({
        uid: campaign.uid,
        category: campaign.category,
        multiplier: campaign.multiplier,
        startAt: toUtcIso(campaign.startAt),
        endAt: toUtcIso(campaign.endAt),
      }));
    },
    ROUTE_CACHE_FRESH_TTL,
    forceRefresh,
  );
}

export function getHomeJointFiringDrills(env: Env, forceRefresh = false) {
  return fetchLazySourceCached(
    env,
    HOME_JOINT_FIRING_DRILLS_CACHE_KEY,
    async (): Promise<HomeJointFiringDrill[]> => {
      const { data, error } = await runQuery(homeJointFiringDrillsQuery, {
        endAfter: new Date(),
        startBefore: null,
      });
      if (error || !data) {
        throw error ?? new Error("failed to fetch home joint firing drills");
      }

      return data.jointFiringDrills.map((drill) => ({
        season: drill.season,
        drillType: drill.drillType,
        schedules: drill.schedules.map((schedule) => ({
          region: schedule.region,
          startAt: toUtcIso(schedule.startAt),
          endAt: schedule.endAt ? toUtcIso(schedule.endAt) : null,
        })),
      }));
    },
    ROUTE_CACHE_FRESH_TTL,
    forceRefresh,
  );
}
