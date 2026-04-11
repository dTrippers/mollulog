import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { RaidRepository, RecruitmentRepository } from "~/repositories";
import { fetchCached } from "./base";
import { raidTypeLocale } from "~/locales/ko";
import { getMainStories } from "./main-story";
import { campaignCategoryLocale, drillTypeLocale, pickupGroupTypeLocale } from "~/locales/ko";

type ContentInput = {
  uid: string;
  contentType: string;
  contentUid: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
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

async function getCampaignDetail(env: Env, uid: string, forceRefresh = false) {
  return fetchCached(env, `campaign-detail::v1::${uid}`, async () => {
    const { data, error } = await runQuery(campaignNameQuery, { uid });
    if (error || !data?.campaign) return null;
    return data.campaign;
  }, 7 * 24 * 60 * 60, forceRefresh);
}

// ============================================================
// EventContent
// ============================================================

const eventContentNameQuery = graphql(`
  query EventContentName($uid: String!) {
    eventContent(uid: $uid) { uid name }
  }
`);

export async function getEventContentName(env: Env, uid: string, forceRefresh = false): Promise<string | null> {
  return fetchCached(env, `event-content-name::v1::${uid}`, async () => {
    const { data, error } = await runQuery(eventContentNameQuery, { uid });
    if (error || !data?.eventContent) return null;
    return data.eventContent.name;
  }, 7 * 24 * 60 * 60, forceRefresh);
}

// ============================================================
// MiniEventContent
// ============================================================

const miniEventContentNameQuery = graphql(`
  query MiniEventContentName($uid: String!) {
    miniEventContent(uid: $uid) { uid name }
  }
`);

export async function getMiniEventContentName(env: Env, uid: string, forceRefresh = false): Promise<string | null> {
  return fetchCached(env, `mini-event-content-name::v1::${uid}`, async () => {
    const { data, error } = await runQuery(miniEventContentNameQuery, { uid });
    if (error || !data?.miniEventContent) return null;
    return data.miniEventContent.name;
  }, 7 * 24 * 60 * 60, forceRefresh);
}

// ============================================================
// JointFiringDrill
// ============================================================

const jointFiringDrillNameQuery = graphql(`
  query JointFiringDrillName($uid: String!) {
    jointFiringDrill(uid: $uid) { uid season drillType }
  }
`);

export async function getJointFiringDrillDetail(env: Env, uid: string, forceRefresh = false) {
  return fetchCached(env, `joint-firing-drill::v1::${uid}`, async () => {
    const { data, error } = await runQuery(jointFiringDrillNameQuery, { uid });
    if (error || !data?.jointFiringDrill) return null;
    return data.jointFiringDrill;
  }, 7 * 24 * 60 * 60, forceRefresh);
}

// ============================================================
// Cache warm-up
// ============================================================

export type ContentRef = {
  uid: string;
  contentType: string;
  contentUid: string | null;
  recruitmentGroupUid?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
};

const LEGACY_RAID_TYPES = ["total_assault", "elimination", "unlimit", "allied"];

type ContentRepositories = {
  raidRepository: RaidRepository;
  recruitmentRepository: RecruitmentRepository;
};

function createRepositories(env: Env): ContentRepositories {
  return {
    raidRepository: new RaidRepository(env),
    recruitmentRepository: new RecruitmentRepository(env),
  };
}

/**
 * Warms up KV cache for a single timeline content item with forceRefresh=true.
 * Returns true if the primary BAQL query returned data (item is confirmed to exist in BAQL).
 */
export async function warmUpSingleItemCache(
  env: Env,
  item: ContentRef,
  repositories: ContentRepositories = createRepositories(env),
): Promise<boolean> {
  const { uid, contentType, contentUid, recruitmentGroupUid } = item;
  const { raidRepository, recruitmentRepository } = repositories;
  let primarySuccess = false;

  if (contentType === "joint_firing_drill" && contentUid) {
    primarySuccess = (await getJointFiringDrillDetail(env, contentUid, true)) !== null;
  } else if (contentType === "raid" && contentUid) {
    primarySuccess = (await raidRepository.getSchedule(contentUid, true)) !== null;
  } else if (LEGACY_RAID_TYPES.includes(contentType) && contentUid) {
    primarySuccess = (await raidRepository.findSummaryByContent(item, true)) !== null;
  } else if (contentType === "campaign" && contentUid) {
    primarySuccess = (await getCampaignDetail(env, contentUid, true)) !== null;
  } else if (contentType === "pickup") {
    primarySuccess = (await recruitmentRepository.getByUid(uid, true)) !== null;
  } else if (contentType === "mini_event" && contentUid) {
    primarySuccess = (await getMiniEventContentName(env, contentUid, true)) !== null;
  } else if (contentUid) {
    primarySuccess = (await getEventContentName(env, contentUid, true)) !== null;
  } else {
    primarySuccess = true;
  }

  if (recruitmentGroupUid) {
    await recruitmentRepository.getByUid(recruitmentGroupUid, true);
  }

  return primarySuccess;
}

const SKIP_IN_BULK_WARM_UP = new Set(["raid", ...LEGACY_RAID_TYPES]);

export async function warmUpNameCaches(env: Env, contents: ContentRef[]) {
  const repositories = createRepositories(env);
  await Promise.all(
    contents
      .filter((item) => !SKIP_IN_BULK_WARM_UP.has(item.contentType))
      .map((item) => warmUpSingleItemCache(env, item, repositories)),
  );
}

// ============================================================
// Main resolver
// ============================================================

export async function resolveContentName(env: Env, content: ContentInput): Promise<string> {
  const { uid, contentType, contentUid } = content;
  const raidRepository = new RaidRepository(env);
  const recruitmentRepository = new RecruitmentRepository(env);

  if (contentType === "joint_firing_drill" && contentUid) {
    const drill = await getJointFiringDrillDetail(env, contentUid);
    if (!drill) return uid;
    return `${drill.season}차: ${drillTypeLocale[drill.drillType]}시험`;
  }

  if (contentType === "raid" && contentUid) {
    const schedule = await raidRepository.getSchedule(contentUid);
    if (!schedule) return uid;
    return `${(raidTypeLocale as Record<string, string>)[schedule.raidType] ?? schedule.raidType} ${schedule.raidBoss.name}`;
  }

  if (LEGACY_RAID_TYPES.includes(contentType) && contentUid) {
    const schedule = await raidRepository.findSummaryByContent(content);
    if (!schedule) {
      return uid;
    }

    return `${(raidTypeLocale as Record<string, string>)[schedule.raidType] ?? schedule.raidType} ${schedule.raidBoss.name}`;
  }

  if (contentType === "campaign" && contentUid) {
    const detail = await getCampaignDetail(env, contentUid);
    return detail ? buildCampaignName(detail.category, detail.multiplier) : uid;
  }

  if (contentType === "pickup") {
    const group = await recruitmentRepository.getByUid(uid);
    return group ? (pickupGroupTypeLocale[group.recruitmentType] ?? "픽업 모집") : "픽업 모집";
  }

  if (contentType === "main_story") {
    const volumes = await getMainStories(env);
    const candidates = contentUid ? [contentUid, uid] : [uid];
    for (const candidate of candidates) {
      for (const volume of volumes) {
        for (const chapter of volume.chapters) {
          for (const part of chapter.parts) {
            if (part.uid === candidate) {
              const volumeTitle = [volume.label, volume.name].filter(Boolean).join(" ");
              const chapterTitle = `제${chapter.chapterNumber}장: ${chapter.name}${part.name ? ` (${part.name})` : ""}`;
              return `${volumeTitle}\n${chapterTitle}`;
            }
          }
        }
      }
    }
    if (contentUid) {
      return (await getEventContentName(env, contentUid)) ?? uid;
    }
    return uid;
  }

  if (contentType === "mini_event" && contentUid) {
    return (await getMiniEventContentName(env, contentUid)) ?? uid;
  }

  if (contentUid) {
    return (await getEventContentName(env, contentUid)) ?? uid;
  }

  return uid;
}
