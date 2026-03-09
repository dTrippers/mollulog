import { graphql } from "~/graphql";
import type { RecruitmentGroupQuery, RecruitmentGroupsListQuery } from "~/graphql/graphql";
import { RunTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import { getTimelineContent } from "./timeline-content";
import type { RunType, TimelineContentType } from "./timeline-content";
import type { EventType } from "./content.d";
import { resolveContentName } from "./content-name";
import type { MinigameConfig } from "~/components/event/shop/constants";

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

  const name = await resolveContentName(env, { uid: timelineUid, contentType: content.contentType, contentUid: content.contentUid });

  return {
    name,
    runType: content.runType,
    since: content.startAt,
    until: content.endAt,
    contentUid: content.contentUid,
    recruitmentGroupUid: content.recruitmentGroupUid,
    shopAvailable: content.contentType === "event" && content.contentUid != null,
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
        recruitmentType pickup rerun since until studentName
        student { uid attackType defenseType role schaleDbId }
      }
    }
  }
`);

type RecruitmentGroupResult = NonNullable<RecruitmentGroupQuery["recruitmentGroup"]>;

export async function getRecruitmentGroup(env: Env, uid: string, forceRefresh = false): Promise<RecruitmentGroupResult | null> {
  return fetchCached(env, `recruitment-group::v1::${uid}`, async () => {
    const { data, error } = await runQuery(recruitmentGroupQuery, { uid });
    if (error || !data?.recruitmentGroup) {
      return null;
    }
    return data.recruitmentGroup;
  }, 7 * 24 * 60 * 60, forceRefresh);
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
    resolveContentName(env, { uid: timelineUid, contentType: content.contentType, contentUid: content.contentUid }),
    content.recruitmentGroupUid
      ? (getRecruitmentGroup(env, content.recruitmentGroupUid).then((g) => g?.recruitments ?? []))
      : Promise.resolve([]),
  ]);

  return {
    name,
    since: content.startAt,
    until: content.endAt,
    imageUrl: content.imageUrl,
    type: content.contentType as EventType,
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

export async function getEventShopContent(env: Env, timelineUid: string) {
  const metadata = await getEventMetadata(env, timelineUid);
  if (!metadata?.contentUid) {
    return null;
  }

  return fetchCached(env, `event-content::shop::v1::${timelineUid}`, async () => {
    const runType = toRunTypeEnum(metadata.runType);
    const { data, error } = await runQuery(eventContentShopContentQuery, { eventUid: metadata.contentUid!, runType });
    if (error || !data?.eventContent) {
      return null;
    }

    const stages = data.eventContent.stages.map((stage) => ({
      uid: stage.uid,
      entryAp: stage.enterCostAmount,
      index: stage.stageNumber,
      difficulty: stage.stageType === "story" ? 0 : stage.stageType === "stage" ? 1 : 2,
      rewards: stage.rewards.map((reward) => ({
        amount: reward.amount,
        rewardRequirement: reward.tag === "Event" ? null : reward.tag || null,
        chance: reward.probability || null,
        item: reward.resource
          ? { uid: reward.resource.uid, name: reward.resource.name, category: 'category' in reward.resource ? (reward.resource as { category: string }).category : '', rarity: reward.resource.rarity }
          : null,
      })),
    }));

    const shopResources = data.eventContent.shopResources
      .filter((r) => r.resource != null && r.paymentResource != null)
      .map((r) => ({
        uid: r.uid,
        resourceAmount: r.resourceAmount,
        paymentResourceAmount: r.paymentResourceAmount,
        shopAmount: r.shopAmount,
        resource: r.resource!,
        paymentResource: r.paymentResource!,
      }));

    // Group bonuses by resource uid to build EventRewardBonus[]
    const bonusByResource = new Map<string, { uid: string; name: string; rewardBonuses: { student: { uid: string; name: string; role: string }; ratio: string }[] }>();
    for (const bonus of data.eventContent.bonuses) {
      if (!bonus.resource || !bonus.student) continue;
      const { uid, name } = bonus.resource;
      if (!bonusByResource.has(uid)) {
        bonusByResource.set(uid, { uid, name, rewardBonuses: [] });
      }
      bonusByResource.get(uid)!.rewardBonuses.push({
        student: { uid: bonus.student.uid, name: bonus.student.name, role: bonus.student.role },
        ratio: bonus.percentage,
      });
    }
    const eventRewardBonus = [...bonusByResource.values()];

    // Convert server minigame configs to local MinigameConfig format
    const serverMinigameConfigs = data.eventContent.minigameConfigs;
    let minigameConfig: MinigameConfig | null = null;
    if (serverMinigameConfigs.length > 0) {
      const serverConfig = serverMinigameConfigs[0];
      const paymentResource = serverConfig.payment.resource;
      if (paymentResource) {
        minigameConfig = {
          minigameType: serverConfig.minigameType as MinigameConfig["minigameType"],
          payment: {
            resourceType: paymentResource.type,
            resourceUid: paymentResource.uid,
            resourceName: paymentResource.name,
            quantity: serverConfig.payment.quantity,
          },
          rewardGroups: serverConfig.rewardGroups.map((group) => {
            const { condition } = group;
            let rounds: MinigameConfig["rewardGroups"][number]["rounds"];
            if (condition.type === "Subsequent") {
              rounds = "subsequent";
            } else if (condition.type === "Values" && condition.values) {
              rounds = condition.values;
            } else if (condition.type === "Divisor" && condition.divisor != null && condition.remainders) {
              rounds = { divisor: condition.divisor, remainders: condition.remainders };
            } else {
              rounds = "subsequent";
            }
            return {
              rounds,
              rewards: group.rewards
                .filter((r) => r.resource != null)
                .map((r) => ({
                  resourceType: r.resource!.type,
                  resourceUid: r.resource!.uid,
                  quantity: r.quantity,
                  rarity: r.resource!.rarity ?? undefined,
                })),
            };
          }),
        };
      }
    }

    return { stages, shopResources, eventRewardBonus, minigameConfig };
  }, 7 * 24 * 60 * 60);
}
