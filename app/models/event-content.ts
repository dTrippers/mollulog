import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";

//
// Get Event Metadata
//
const eventMetadataQuery = graphql(`
  query EventMetadata($timelineUid: String!) {
    event(uid: $timelineUid) {
      name uid rerun
      shopResources { uid }
    }
  }
`);

export async function getEventMetadata(env: Env, timelineUid: string) {
  return fetchCached(env, `event-content::metadata::${timelineUid}`, async () => {
    const { data, error } = await runQuery(eventMetadataQuery, { timelineUid });
    if (error || !data?.event) {
      return null;
    }

    return {
      name: data.event.name,
      eventUid: data.event.uid,
      rerun: data.event.rerun,
      shopAvailable: data.event.shopResources.length > 0,
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
const eventShopContentQuery = graphql(`
  query EventShopContent($eventUid: String!) {
    event(uid: $eventUid) {
      uid
      stages {
        uid name entryAp index difficulty
        rewards(rewardType: "item") {
          amount rewardRequirement chance
          item { uid name category rarity }
        }
      }
      shopResources {
        uid resourceAmount paymentResourceAmount shopAmount
        resource { type uid name rarity }
        paymentResource { uid name }
      }
    }
  }
`);

const eventRewardBonusQuery = graphql(`
  query EventShopRewardBonus($itemUids: [String!]!) {
    items(uids: $itemUids) {
      uid name
      rewardBonuses { student { uid name role } ratio }
    }
  }
`);

export async function getEventShopContent(env: Env, timelineUid: string) {
  const { data, error } = await runQuery(eventShopContentQuery, { eventUid: timelineUid });
  if (error || !data?.event) {
    return null;
  }

  const { stages, shopResources } = data.event;

  const paymentResourceUids = [
    ...new Set(
      stages.flatMap((stage) =>
        stage.rewards.flatMap((reward) => reward.item?.uid).filter((uid) => uid !== undefined),
      ),
    ),
  ];

  const { data: bonusData } = await runQuery(eventRewardBonusQuery, { itemUids: paymentResourceUids });
  const eventRewardBonus = bonusData?.items ?? [];

  return { stages, shopResources, eventRewardBonus };
}
