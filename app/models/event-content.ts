import type { MinigameConfig } from "~/components/features/events/shop/constants";
import type { ShopResource } from "~/components/features/events/shop/types";
import { graphql } from "~/graphql";
import type { EventContentShopContentQuery, RecruitmentGroupsListQuery } from "~/graphql/graphql";
import { RunTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { RecruitmentRepository } from "~/repositories";
import { fetchCached } from "./base";
import { getTimelineContent, getTimelineContents } from "./timeline-content";
import type { RunType } from "./timeline-content";

function toRunTypeEnum(runType: RunType): RunTypeEnum {
  if (runType === "rerun") return RunTypeEnum.Rerun;
  if (runType === "permanent") return RunTypeEnum.Permanent;
  return RunTypeEnum.First;
}

//
// Get Event Metadata (from D1 timeline_contents + BAQL for name)
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
    shopAvailable:
      content.shopContentUid != null ||
      (content.contentType === "event" && content.contentUid != null && content.runType !== "permanent"),
  };
}

export type ShopAvailableEvent = {
  uid: string;
  name: string;
  since: Date;
  until: Date | null;
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
  startAt: Date;
  endAt: Date | null;
};

type CachedEventContentSchedule = {
  startAt: string;
  endAt: string | null;
};

export async function getEventContentSchedule(
  env: Env,
  eventUid: string,
  runType: RunType,
): Promise<EventContentSchedule | null> {
  const schedule = await fetchCached<CachedEventContentSchedule | null>(
    env,
    `event-content::schedule::gl::v1::${eventUid}::${runType}`,
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
        startAt: new Date(schedule.startAt).toISOString(),
        endAt: schedule.endAt ? new Date(schedule.endAt).toISOString() : null,
      };
    },
    7 * 24 * 60 * 60,
  );
  if (!schedule) {
    return null;
  }
  return {
    startAt: new Date(schedule.startAt),
    endAt: schedule.endAt ? new Date(schedule.endAt) : null,
  };
}

export async function getShopAvailableEvents(env: Env): Promise<ShopAvailableEvent[]> {
  const contents = await getTimelineContents(env);
  const shopScheduleEntries = await Promise.all(
    contents.map(async (content) => {
      if (!content.shopContentUid) {
        return null;
      }
      const schedule = await getEventContentSchedule(env, content.shopContentUid, content.runType);
      return schedule ? ([content.uid, schedule] as const) : null;
    }),
  );
  const shopSchedules = new Map(shopScheduleEntries.filter((entry) => entry !== null));

  return contents
    .filter(
      (content) =>
        content.shopContentUid != null ||
        (content.contentType === "event" && content.contentUid != null && content.runType !== "permanent"),
    )
    .map((content) => {
      const shopSchedule = content.shopContentUid ? shopSchedules.get(content.uid) : null;
      return {
        uid: content.uid,
        name: content.name,
        since: shopSchedule?.startAt ?? content.startAt,
        until: shopSchedule?.endAt ?? content.endAt,
      };
    })
    .sort((a, b) => a.since.getTime() - b.since.getTime());
}

//
// Get Recruitment Groups (plural)
//
export type RecruitmentGroupsResult = RecruitmentGroupsListQuery["recruitmentGroups"];

export async function getRecruitmentGroups(
  env: Env,
  opts: { endAfter?: Date; uids?: string[] } = {},
): Promise<RecruitmentGroupsResult> {
  const repository = new RecruitmentRepository(env);

  if (opts.uids) {
    let groups = await repository.getByUids(opts.uids);
    if (opts.endAfter) {
      const endAfterTime = opts.endAfter.getTime();
      groups = groups.filter((group) => !group.endAt || new Date(group.endAt).getTime() >= endAfterTime);
    }
    return groups;
  }

  if (opts.endAfter) {
    const endAfterTime = opts.endAfter.getTime();
    const groups = await repository.getAll();
    return groups.filter((group) => !group.endAt || new Date(group.endAt).getTime() >= endAfterTime);
  }

  return repository.getAll();
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
        uid resourceAmount paymentResourceAmount shopAmount
        resource { type uid name rarity }
        paymentResource { uid name }
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
    paymentResourceAmount: r.paymentResourceAmount,
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

export async function getEventShopContent(env: Env, timelineUid: string) {
  const metadata = await getEventMetadata(env, timelineUid);
  if (!metadata) {
    return null;
  }

  const shopContentUid = metadata.shopContentUid ?? metadata.contentUid;
  if (!shopContentUid) {
    return null;
  }

  const { runType } = metadata;

  return fetchCached(
    env,
    `event-content::shop::v2::${timelineUid}`,
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
    7 * 24 * 60 * 60,
  );
}
