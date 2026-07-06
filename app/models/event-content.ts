import type { MinigameConfig, ShopResource } from "~/domain/event-shop";
import { graphql } from "~/graphql";
import type {
  EventContentShopContentQuery,
  EventContentsListQuery,
  RecruitmentGroupsListQuery,
} from "~/graphql/graphql";
import { RunTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, cacheQuery, fetchLazySourceCached, fetchSourceCached } from "~/lib/cache";
import { type UtcIsoString, compareInstantAsc, toUtcIso } from "~/lib/date-time";
import { getAllRecruitmentGroups, getRecruitmentGroupsByUids } from "~/models/recruitment";
import { getTimelineContent, getTimelineContents } from "./timeline-content";
import type { RunType } from "./timeline-content";

const EVENT_CONTENTS_LIST_CACHE_KEY = cacheKey("source", "event-content", 1, "list");
const EVENT_STATIC_CONTENT_TTL = 7 * 24 * 60 * 60;

function toRunTypeEnum(runType: RunType): RunTypeEnum {
  if (runType === "rerun") return RunTypeEnum.Rerun;
  if (runType === "permanent") return RunTypeEnum.Permanent;
  return RunTypeEnum.First;
}

//
// Get Event Metadata (from D1 timeline_contents)
//
export async function getEventMetadata(env: Env, timelineUid: string) {
  const content = await getTimelineContent(env, timelineUid);
  if (!content) {
    return null;
  }

  return {
    name: content.name,
    runType: content.runType,
    since: content.startAt,
    until: content.endAt,
    contentUid: content.contentUid,
    shopContentUid: content.shopContentUid,
    recruitmentGroupUid: content.recruitmentGroupUid,
    isSpoiler: content.isSpoiler,
    shopAvailable:
      content.shopContentUid != null ||
      (content.contentType === "event" && content.contentUid != null && content.runType !== "permanent"),
  };
}

export type ShopAvailableEvent = {
  uid: string;
  name: string;
  since: UtcIsoString;
  until: UtcIsoString | null;
  isSpoiler: boolean;
};

const eventContentScheduleQuery = graphql(`
  query EventContentSchedule($eventUid: String!) {
    eventContent(uid: $eventUid) {
      schedules {
        region
        runType
        startAt
        endAt
      }
    }
  }
`);

type EventContentSchedule = {
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
};

type CachedEventContentSchedule = {
  startAt: string;
  endAt: string | null;
};

export async function getEventContentSchedule(
  env: Env,
  eventUid: string,
  runType: RunType,
  forceRefresh = false,
): Promise<EventContentSchedule | null> {
  const schedule = await fetchLazySourceCached<CachedEventContentSchedule | null>(
    env,
    cacheKey("source", "event-content-schedule", 1, cacheQuery({ eventUid, region: "gl", runType })),
    async () => {
      const { data, error } = await runQuery(eventContentScheduleQuery, { eventUid });
      if (error || !data?.eventContent) {
        return null;
      }

      const schedules = data.eventContent.schedules;
      const schedule = schedules.find((item) => item.region === "gl" && item.runType === runType) ?? null;
      if (!schedule) {
        return null;
      }
      return {
        startAt: toUtcIso(schedule.startAt),
        endAt: schedule.endAt ? toUtcIso(schedule.endAt) : null,
      };
    },
    EVENT_STATIC_CONTENT_TTL,
    forceRefresh,
  );
  if (!schedule) {
    return null;
  }
  return {
    startAt: toUtcIso(schedule.startAt),
    endAt: schedule.endAt ? toUtcIso(schedule.endAt) : null,
  };
}

export async function getShopAvailableEvents(env: Env): Promise<ShopAvailableEvent[]> {
  const contents = await getTimelineContents(env);
  return contents
    .filter(
      (content) =>
        content.shopContentUid != null ||
        (content.contentType === "event" && content.contentUid != null && content.runType !== "permanent"),
    )
    .map((content) => {
      return {
        uid: content.uid,
        name: content.name,
        since: content.startAt,
        until: content.endAt,
        isSpoiler: content.isSpoiler,
      };
    })
    .sort((a, b) => compareInstantAsc(a.since, b.since));
}

//
// Get Event List
//
const eventContentsListQuery = graphql(`
  query EventContentsList {
    eventContents {
      uid
      name
      schedules {
        region
        runType
        startAt
        endAt
      }
    }
  }
`);

export async function getEventContentsList(
  env: Env,
  forceRefresh = false,
): Promise<EventContentsListQuery["eventContents"]> {
  return fetchSourceCached(
    env,
    EVENT_CONTENTS_LIST_CACHE_KEY,
    async () => {
      const { data, error } = await runQuery(eventContentsListQuery, {});
      if (error || !data) {
        throw error ?? new Error("failed to fetch event contents");
      }

      return data.eventContents;
    },
    forceRefresh,
  );
}

export function syncEventContentsList(env: Env, forceRefresh = true): Promise<EventContentsListQuery["eventContents"]> {
  return getEventContentsList(env, forceRefresh);
}

//
// Get Recruitment Groups (plural)
//
export type RecruitmentGroupsResult = RecruitmentGroupsListQuery["recruitmentGroups"];

export async function getRecruitmentGroups(
  env: Env,
  opts: { endAfter?: Date; uids?: string[] } = {},
): Promise<RecruitmentGroupsResult> {
  if (opts.uids) {
    let groups = await getRecruitmentGroupsByUids(env, opts.uids);
    if (opts.endAfter) {
      const endAfterTime = opts.endAfter.getTime();
      groups = groups.filter((group) => !group.endAt || new Date(group.endAt).getTime() >= endAfterTime);
    }
    return groups;
  }

  if (opts.endAfter) {
    const endAfterTime = opts.endAfter.getTime();
    const groups = await getAllRecruitmentGroups(env);
    return groups.filter((group) => !group.endAt || new Date(group.endAt).getTime() >= endAfterTime);
  }

  return getAllRecruitmentGroups(env);
}

//
// Get Event Shop Content (stages, shopResources, eventRewardBonus)
//
const eventContentShopContentQuery = graphql(`
  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {
    eventContent(uid: $eventUid) {
      stages(runType: $runType) {
        uid stageNumber stageIndex stageType enterCostAmount
        rewards {
          amount probability tag
          resource { __typename uid name rarity ... on Item { category } }
        }
      }
      shopResources(runType: $runType) {
        uid resourceAmount shopAmount
        resource { type uid name rarity }
        paymentResource { type uid name }
        purchaseTiers {
          tierIndex
          startQuantity
          quantity
          unitPrice
          paymentResource { type uid name }
        }
      }
      bonuses(runType: $runType) {
        percentage
        resource { uid name }
        student { uid name role }
      }
      minigameConfigs(runType: $runType) {
        minigameType
        payment { quantity resource { type uid name } }
        payments { quantity resource { type uid name } }
        rewardGroups {
          condition { type value values divisor remainders }
          payments {
            quantityMin
            quantityExpected
            quantityMax
            quantityVariable
            resource { type uid name }
          }
          rewards { quantity resource { type uid name rarity } }
        }
      }
    }
  }
`);

type EventContentData = NonNullable<EventContentShopContentQuery["eventContent"]>;

function transformStages(stages: NonNullable<EventContentData>["stages"]) {
  const stageDifficulty: Record<string, number> = { story: 0, stage: 1 };
  return stages.map((stage) => ({
    uid: stage.uid,
    entryAp: stage.enterCostAmount,
    index: stage.stageNumber,
    difficulty: stageDifficulty[stage.stageType] ?? 2,
    rewards: stage.rewards.map((reward) => ({
      amount: reward.amount,
      rewardRequirement: reward.tag === "Event" ? null : reward.tag || null,
      chance: reward.probability || null,
      item: reward.resource
        ? {
            uid: reward.resource.uid,
            name: reward.resource.name,
            category: "category" in reward.resource ? (reward.resource as { category: string }).category : "",
            rarity: reward.resource.rarity,
          }
        : null,
    })),
  }));
}

function hasShopResourceAndPaymentResource(
  resource: NonNullable<EventContentData>["shopResources"][number],
): resource is NonNullable<EventContentData>["shopResources"][number] & {
  resource: NonNullable<NonNullable<EventContentData>["shopResources"][number]["resource"]>;
  paymentResource: NonNullable<NonNullable<EventContentData>["shopResources"][number]["paymentResource"]>;
} {
  return resource.resource !== null && resource.paymentResource !== null;
}

function transformShopResources(shopResources: NonNullable<EventContentData>["shopResources"]): ShopResource[] {
  return shopResources.filter(hasShopResourceAndPaymentResource).map((r) => ({
    uid: r.uid,
    resourceAmount: r.resourceAmount,
    purchaseTiers: r.purchaseTiers.flatMap((tier) =>
      tier.paymentResource
        ? [
            {
              tierIndex: tier.tierIndex,
              startQuantity: tier.startQuantity,
              quantity: tier.quantity,
              unitPrice: tier.unitPrice,
              paymentResource: tier.paymentResource,
            },
          ]
        : [],
    ),
    shopAmount: r.shopAmount,
    resource: r.resource,
    paymentResource: r.paymentResource,
  }));
}

function transformBonuses(bonuses: NonNullable<EventContentData>["bonuses"]) {
  const bonusByResource = new Map<
    string,
    {
      uid: string;
      name: string;
      rewardBonuses: { student: { uid: string; name: string; role: string }; ratio: string }[];
    }
  >();
  for (const bonus of bonuses) {
    if (!bonus.resource || !bonus.student) continue;
    const { uid, name } = bonus.resource;
    if (!bonusByResource.has(uid)) {
      bonusByResource.set(uid, { uid, name, rewardBonuses: [] });
    }
    bonusByResource.get(uid)?.rewardBonuses.push({
      student: { uid: bonus.student.uid, name: bonus.student.name, role: bonus.student.role },
      ratio: bonus.percentage,
    });
  }
  return [...bonusByResource.values()];
}

type ServerCondition = NonNullable<EventContentData>["minigameConfigs"][number]["rewardGroups"][number]["condition"];

function resolveRounds(condition: ServerCondition): MinigameConfig["rewardGroups"][number]["rounds"] {
  if (condition.type === "exact" && condition.values) {
    return condition.values;
  }
  if (condition.type === "gte" && condition.value != null) {
    return { gte: condition.value };
  }
  if (condition.type === "values" && condition.values) {
    return condition.values;
  }
  if (condition.type === "modulo" && condition.divisor != null && condition.remainders) {
    return { divisor: condition.divisor, remainders: condition.remainders };
  }
  return "subsequent";
}

function transformMinigameConfigs(configs: NonNullable<EventContentData>["minigameConfigs"]): MinigameConfig | null {
  if (configs.length === 0) return null;
  const serverConfig = configs[0];
  const paymentResource = serverConfig.payment.resource;
  if (!paymentResource) return null;

  const payments = serverConfig.payments.flatMap((payment) =>
    payment.resource
      ? [
          {
            resourceType: payment.resource.type,
            resourceUid: payment.resource.uid,
            resourceName: payment.resource.name,
            quantity: payment.quantity,
          },
        ]
      : [],
  );

  return {
    minigameType: serverConfig.minigameType as MinigameConfig["minigameType"],
    payment: {
      resourceType: paymentResource.type,
      resourceUid: paymentResource.uid,
      resourceName: paymentResource.name,
      quantity: serverConfig.payment.quantity,
    },
    payments,
    rewardGroups: serverConfig.rewardGroups.map((group) => ({
      rounds: resolveRounds(group.condition),
      payments: group.payments.flatMap((payment) =>
        payment.resource
          ? [
              {
                resourceType: payment.resource.type,
                resourceUid: payment.resource.uid,
                resourceName: payment.resource.name,
                quantityMin: payment.quantityMin,
                quantityExpected: payment.quantityExpected,
                quantityMax: payment.quantityMax,
                quantityVariable: payment.quantityVariable,
              },
            ]
          : [],
      ),
      rewards: group.rewards.flatMap((r) =>
        r.resource
          ? [
              {
                resourceType: r.resource.type,
                resourceUid: r.resource.uid,
                resourceName: r.resource.name,
                quantity: r.quantity,
                rarity: r.resource.rarity ?? undefined,
              },
            ]
          : [],
      ),
    })),
  };
}

export async function getEventShopContent(env: Env, timelineUid: string, forceRefresh = false) {
  const metadata = await getEventMetadata(env, timelineUid);
  if (!metadata) {
    return null;
  }

  const shopContentUid = metadata.shopContentUid ?? metadata.contentUid;
  if (!shopContentUid) {
    return null;
  }

  const { runType } = metadata;

  return fetchLazySourceCached(
    env,
    cacheKey("source", "event-shop", 1, cacheQuery({ contentUid: shopContentUid, runType })),
    async () => {
      const { data, error } = await runQuery(eventContentShopContentQuery, {
        eventUid: shopContentUid,
        runType: toRunTypeEnum(runType),
      });
      if (error || !data?.eventContent) {
        return null;
      }

      const { stages, shopResources, bonuses, minigameConfigs } = data.eventContent;
      return {
        stages: transformStages(stages),
        shopResources: transformShopResources(shopResources),
        eventRewardBonus: transformBonuses(bonuses),
        minigameConfig: transformMinigameConfigs(minigameConfigs),
      };
    },
    EVENT_STATIC_CONTENT_TTL,
    forceRefresh,
  );
}
