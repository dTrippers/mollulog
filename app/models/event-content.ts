import { graphql } from "~/graphql";
import { RunTypeEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import type { MinigameConfig } from "~/components/event/shop/constants";

//
// Get Event Metadata
//
const eventMetadataQuery = graphql(`
  query EventMetadata($timelineUid: String!) {
    event(uid: $timelineUid) {
      name type rerun since until eventIndex
    }
  }
`);

export async function getEventMetadata(env: Env, timelineUid: string) {
  return fetchCached(env, `event-content::metadata:::v2::${timelineUid}`, async () => {
    const { data, error } = await runQuery(eventMetadataQuery, { timelineUid });
    if (error || !data?.event) {
      return null;
    }

    const { name, rerun, since, until } = data.event;
    return {
      name, rerun, since, until,
      eventUid: data.event.eventIndex?.toString() ?? null,
      shopAvailable: data.event.eventIndex != null && data.event.type === "event",
    };
  }, 7 * 24 * 60 * 60);
}

//
// Get Event Content Summary
//
const legacyEventSummaryQuery = graphql(`
  query LegacyEventSummary($timelineUid: String!) {
    legacyEvent: event(uid: $timelineUid) {
      name since until imageUrl type rerun endless
      videos { title youtube start }
      recruitments {
        recruitmentType pickup rerun since until studentName
        student { uid attackType defenseType role }
      }
    }
  }
`);

const eventContentSummaryQuery = graphql(`
  query EventContentSummary($timelineUid: String!, $uid: String!) {
    legacyEvent: event(uid: $timelineUid) {
      name since until imageUrl type rerun endless
      videos { title youtube start }
      recruitments {
        recruitmentType pickup rerun since until studentName
        student { uid attackType defenseType role }
      }
    }
    eventContent(uid: $uid) {
      name
      schedules { region runType startAt endAt }
    }
  }
`);

export async function getEventContentSummary(env: Env, timelineUid: string) {
  const eventUid = (await getEventMetadata(env, timelineUid))?.eventUid;
  return fetchCached(env, `event-content::summary::${timelineUid}`, async () => {
    if (!eventUid) {
      const { data, error } = await runQuery(legacyEventSummaryQuery, { timelineUid });
      if (error || !data?.legacyEvent) {
        return null;
      }
      return data.legacyEvent;
    }

    const { data, error } = await runQuery(eventContentSummaryQuery, { timelineUid, uid: eventUid });
    if (error || !data?.legacyEvent) {
      return null;
    }
    return {
      ...data.eventContent,
      ...data.legacyEvent,
    };
  }, 7 * 24 * 60 * 60);
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
  if (!metadata?.eventUid) {
    return null;
  }

  return fetchCached(env, `event-content::shop::v1::${timelineUid}`, async () => {
    const runType = metadata.rerun ? RunTypeEnum.Rerun : RunTypeEnum.First;
    const { data, error } = await runQuery(eventContentShopContentQuery, { eventUid: metadata.eventUid!, runType });
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
