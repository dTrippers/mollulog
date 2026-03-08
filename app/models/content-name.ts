import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import { getRaidDetail } from "./raid";
import { getMainStories } from "./main-story";
import { getRecruitmentGroup } from "./event-content";
import { campaignCategoryLocale, drillTypeLocale, pickupGroupTypeLocale } from "~/locales/ko";

type ContentInput = {
  uid: string;
  contentType: string;
  contentUid: string | null;
};

// ============================================================
// Campaign
// ============================================================

function buildCampaignName(categories: string[], multiplier: number): string {
  const categoryNames = categories.map((c) => campaignCategoryLocale[c] ?? c).join("/");
  return `${categoryNames} 보상량 ${multiplier}배`;
}

const campaignNameQuery = graphql(`
  query CampaignName($uid: String!) {
    campaign(uid: $uid) { uid category multiplier }
  }
`);

async function getCampaignDetail(env: Env, uid: string) {
  return fetchCached(env, `campaign-detail::v1::${uid}`, async () => {
    const { data, error } = await runQuery(campaignNameQuery, { uid });
    if (error || !data?.campaign) return null;
    return data.campaign;
  }, 7 * 24 * 60 * 60);
}

// ============================================================
// EventContent
// ============================================================

const eventContentNameQuery = graphql(`
  query EventContentName($uid: String!) {
    eventContent(uid: $uid) { uid name }
  }
`);

export async function getEventContentName(env: Env, uid: string): Promise<string | null> {
  return fetchCached(env, `event-content-name::v1::${uid}`, async () => {
    const { data, error } = await runQuery(eventContentNameQuery, { uid });
    if (error || !data?.eventContent) return null;
    return data.eventContent.name;
  }, 7 * 24 * 60 * 60);
}

// ============================================================
// MiniEventContent
// ============================================================

const miniEventContentNameQuery = graphql(`
  query MiniEventContentName($uid: String!) {
    miniEventContent(uid: $uid) { uid name }
  }
`);

export async function getMiniEventContentName(env: Env, uid: string): Promise<string | null> {
  return fetchCached(env, `mini-event-content-name::v1::${uid}`, async () => {
    const { data, error } = await runQuery(miniEventContentNameQuery, { uid });
    if (error || !data?.miniEventContent) return null;
    return data.miniEventContent.name;
  }, 7 * 24 * 60 * 60);
}

// ============================================================
// JointFiringDrill
// ============================================================

const jointFiringDrillNameQuery = graphql(`
  query JointFiringDrillName($uid: String!) {
    jointFiringDrill(uid: $uid) { uid season drillType }
  }
`);

export async function getJointFiringDrillDetail(env: Env, uid: string) {
  return fetchCached(env, `joint-firing-drill::v1::${uid}`, async () => {
    const { data, error } = await runQuery(jointFiringDrillNameQuery, { uid });
    if (error || !data?.jointFiringDrill) return null;
    return data.jointFiringDrill;
  }, 7 * 24 * 60 * 60);
}

// ============================================================
// Main resolver
// ============================================================

const RAID_TYPES = ["total_assault", "elimination", "unlimit", "allied"];

export async function resolveContentName(env: Env, content: ContentInput): Promise<string> {
  const { uid, contentType, contentUid } = content;

  if (contentType === "joint_firing_drill" && contentUid) {
    const drill = await getJointFiringDrillDetail(env, contentUid);
    if (!drill) return uid;
    return `${drill.season}차: ${drillTypeLocale[drill.drillType]}시험`;
  }

  if (RAID_TYPES.includes(contentType) && contentUid) {
    const raid = await getRaidDetail(env, contentUid);
    return raid?.name ?? uid;
  }

  if (contentType === "campaign" && contentUid) {
    const detail = await getCampaignDetail(env, contentUid);
    return detail ? buildCampaignName(detail.category, detail.multiplier) : uid;
  }

  if (contentType === "pickup") {
    const group = await getRecruitmentGroup(env, uid);
    return group ? (pickupGroupTypeLocale[group.recruitmentType] ?? "픽업 모집") : "픽업 모집";
  }

  if (contentType === "main_story" && contentUid) {
    const volumes = await getMainStories(env);
    for (const volume of volumes) {
      for (const chapter of volume.chapters) {
        for (const part of chapter.parts) {
          if (part.uid === contentUid) {
            const volumeTitle = [volume.label, volume.name].filter(Boolean).join(" ");
            const chapterTitle = `제${chapter.chapterNumber}장: ${chapter.name}${part.name ? ` (${part.name})` : ""}`;
            return `${volumeTitle}\n${chapterTitle}`;
          }
        }
      }
    }
    return (await getEventContentName(env, contentUid)) ?? uid;
  }

  if (contentType === "mini_event" && contentUid) {
    return (await getMiniEventContentName(env, contentUid)) ?? uid;
  }

  if (contentUid) {
    return (await getEventContentName(env, contentUid)) ?? uid;
  }

  return uid;
}
