import type { MinigameConfig } from "~/components/features/events/shop/constants";
import { graphql } from "~/graphql";
import type { EventContentShopContentQuery, RecruitmentGroupQuery, RecruitmentGroupsListQuery } from "~/graphql/graphql";
import { RunTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import { resolveContentName } from "./content-name";
import { getTimelineContent } from "./timeline-content";
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

  const name = await resolveContentName(env, {
    uid: timelineUid,
    contentType: content.contentType,
    contentUid: content.contentUid,
  });

  return {
    name,
    runType: content.runType,
    since: content.startAt,
    until: content.endAt,
    contentUid: content.contentUid,
    recruitmentGroupUid: content.recruitmentGroupUid,
    shopAvailable: content.contentType === "event" && content.contentUid != null && content.runType !== "permanent",
  };
}

//
// Get Recruitment Group
//
const recruitmentGroupQuery = graphql(`
  query RecruitmentGroup($uid: String!) {
    recruitmentGroup(uid: $uid) {
      uid contentType contentUid startAt endAt recruitmentType
      recruitments {
        recruitmentType pickup rerun studentName since until
        student { uid attackType defenseType role schaleDbId }
      }
    }
  }
`);

type RecruitmentGroupResult = NonNullable<RecruitmentGroupQuery["recruitmentGroup"]>;

export async function getRecruitmentGroup(
  env: Env,
  uid: string,
  forceRefresh = false,
): Promise<RecruitmentGroupResult | null> {
  return fetchCached(
    env,
    `recruitment-group::v1::${uid}`,
    async () => {
      const { data, error } = await runQuery(recruitmentGroupQuery, { uid });
      if (error || !data?.recruitmentGroup) {
        return null;
      }
      return data.recruitmentGroup;
    },
    7 * 24 * 60 * 60,
    forceRefresh,
  );
}

//
// Get Recruitment Groups (plural)
//
const recruitmentGroupsQuery = graphql(`
  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {
    recruitmentGroups(endAfter: $endAfter, uids: $uids) {
      uid contentType contentUid startAt endAt recruitmentType
      recruitments {
        recruitmentType pickup rerun since until studentName
        student { uid attackType defenseType role name schaleDbId }
      }
    }
  }
`);

export type RecruitmentGroupsResult = RecruitmentGroupsListQuery["recruitmentGroups"];

export async function getRecruitmentGroups(
  env: Env,
  opts: { endAfter?: Date; uids?: string[] } = {},
): Promise<RecruitmentGroupsResult> {
  const { data, error } = await runQuery(recruitmentGroupsQuery, {
    endAfter: opts.endAfter ?? null,
    uids: opts.uids ?? null,
  });
  if (error || !data) {
    console.error("[getRecruitmentGroups] Failed", error);
    return [];
  }
  return data.recruitmentGroups;
}

//
// Get Event Content Summary
//
export async function getEventContentSummary(env: Env, timelineUid: string) {
  const content = await getTimelineContent(env, timelineUid);
  if (!content) {
    return null;
  }

  const [name, recruitments] = await Promise.all([
    resolveContentName(env, {
      uid: timelineUid,
      contentType: content.contentType,
      contentUid: content.contentUid,
    }),
    content.recruitmentGroupUid
      ? getRecruitmentGroup(env, content.recruitmentGroupUid).then((g) => g?.recruitments ?? [])
      : Promise.resolve([]),
  ]);

  return {
    name,
    since: content.startAt,
    until: content.endAt,
    imageUrl: content.imageUrl,
    type: content.contentType,
    runType: content.runType,
    endless: content.endless,
    videos: content.videos,
    recruitments,
  };
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
        rewardGroups {
          condition { type value values divisor remainders }
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

function transformShopResources(shopResources: NonNullable<EventContentData>["shopResources"]) {
  return shopResources.filter((r) => r.resource && r.paymentResource).map((r) => ({
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

function transformMinigameConfigs(
  configs: NonNullable<EventContentData>["minigameConfigs"],
): MinigameConfig | null {
  if (configs.length === 0) return null;
  const serverConfig = configs[0];
  const paymentResource = serverConfig.payment.resource;
  if (!paymentResource) return null;

  return {
    minigameType: serverConfig.minigameType as MinigameConfig["minigameType"],
    payment: {
      resourceType: paymentResource.type,
      resourceUid: paymentResource.uid,
      resourceName: paymentResource.name,
      quantity: serverConfig.payment.quantity,
    },
    rewardGroups: serverConfig.rewardGroups.map((group) => ({
      rounds: resolveRounds(group.condition),
      rewards: group.rewards.flatMap((r) =>
        r.resource
          ? [{ resourceType: r.resource.type, resourceUid: r.resource.uid, quantity: r.quantity, rarity: r.resource.rarity ?? undefined }]
          : [],
      ),
    })),
  };
}

export async function getEventShopContent(env: Env, timelineUid: string) {
  const metadata = await getEventMetadata(env, timelineUid);
  if (!metadata?.contentUid) {
    return null;
  }

  const { contentUid, runType } = metadata;

  return fetchCached(
    env,
    `event-content::shop::v1::${timelineUid}`,
    async () => {
      const { data, error } = await runQuery(eventContentShopContentQuery, {
        eventUid: contentUid,
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
