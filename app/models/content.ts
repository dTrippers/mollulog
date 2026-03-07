import dayjs from "dayjs";
import { graphql } from "~/graphql";
import type { IndexQuery } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import { getFavoritedCounts } from "./favorite-students";
import type { AttackType, DefenseType, EventType, RaidType, Role, Terrain } from "./content.d";
import { RecruitmentTypeEnum } from "~/graphql/graphql";
import { getLatestPostTime } from "./post";
import { getTimelineContents, type TimelineContent } from "./timeline-content";
import { getRecruitmentGroup } from "./event-content";
import { getRaidDetail } from "./raid";
import { getMainStories } from "./main-story";
import { campaignCategoryLocale, drillTypeLocale, pickupGroupTypeLocale } from "~/locales/ko";
export { contentComments, getUserComments, getContentComments, getContentsComments, createComment, createSubcomment, updateComment, deleteComment, getCommentIdByUid, pinComment, unpinComment, getPinnedComment, getNestedContentComments, nestComments } from "./content-comment";
export type { NestedComment } from "./content-comment";

export const CONTENT_ORDER: (EventType | RaidType)[] = [
  "update",
  "event",
  "immortal_event",
  "main_story",
  "fes",
  "pickup",
  "collab",
  "total_assault",
  "elimination",
  "unlimit",
  "campaign",
  "joint_firing_drill",
  "mini_event",
  "guide_mission",
  "battle_pass",
];

export const SHOW_LINK_CONTENT_TYPES: (EventType | RaidType)[] = [
  "update",
  "fes",
  "event",
  "immortal_event",
  "main_story",
  "pickup",
  "collab",
  "total_assault",
  "elimination",
  "battle_pass",
];

/**
 * Index Contents
 */

const indexQuery = graphql(`
  query Index($now: ISO8601DateTime!) {
    events(untilAfter: $now, first: 20) {
      nodes {
        __typename name since until endless uid type rerun imageUrl
        recruitments {
          recruitmentType pickup rerun since until studentName
          student { uid name }
        }
      }
    }
    raids(untilAfter: $now, first: 3) {
      nodes {
        name since until uid type boss attackType terrain
        defenseTypes { defenseType difficulty }
      }
    }
  }
`);

export async function getIndexContents(env: Env, forceRefresh = false) {
  return fetchCached(env, "index-contents::v2", async () => {
    const now = dayjs();
    const { data, error } = await runQuery(indexQuery, { now: now.toDate() });
    if (error || !data) {
      throw error ?? "failed to fetch events";
    }

    // ========== Events ==========
    const mainEventTypes = ["event", "main_story", "collab", "fes", "immortal_event"];
    const mainEvents = data.events.nodes.filter((event) => mainEventTypes.includes(event.type));

    // Priority 1: Find currently ongoing events (since <= now <= until)
    const ongoingEvents = mainEvents.filter((event) => {
      const since = dayjs(event.since);
      const until = dayjs(event.until);
      return !since.isAfter(now) && until.isAfter(now);
    });

    let mainEvent = null;
    if (ongoingEvents.length > 0) {
      // If there are ongoing events, prioritize by event type order
      mainEvent = ongoingEvents.sort((a, b) => {
        const aTypeIndex = mainEventTypes.indexOf(a.type);
        const bTypeIndex = mainEventTypes.indexOf(b.type);
        return aTypeIndex - bTypeIndex;
      })[0];
    } else {
      // Priority 2: Find the nearest starting event
      const futureEvents = mainEvents.filter((event) => dayjs(event.since).isAfter(now));
      if (futureEvents.length > 0) {
        // Sort by start date, then by event type priority for same date
        mainEvent = futureEvents.sort((a, b) => {
          const aSince = dayjs(a.since);
          const bSince = dayjs(b.since);
          const dateDiff = aSince.diff(bSince, "day");
          if (dateDiff !== 0) {
            return dateDiff;
          }

          // If same date, prioritize by event type order
          const aTypeIndex = mainEventTypes.indexOf(a.type);
          const bTypeIndex = mainEventTypes.indexOf(b.type);
          return aTypeIndex - bTypeIndex;
        })[0];
      }
    }

    // ========== Pickups ==========
    const currentRecruitments: { eventUid: string, recruitment: IndexQuery["events"]["nodes"][0]["recruitments"][0] }[] = data.events.nodes
      .flatMap((event) => event.recruitments.filter((recruitment) => recruitment.student !== null && recruitment.recruitmentType !== "recollect" && recruitment.recruitmentType !== "archive" && recruitment.recruitmentType !== "encore").map((recruitment) => ({ eventUid: event.uid, recruitment })))
      .filter(({ recruitment }) => !dayjs(recruitment.since).isAfter(now) && dayjs(recruitment.until).isAfter(now));

    // Get favorite counts for all students in current pickups (not just user's favorites)
    const allStudentUids = currentRecruitments.map(({ recruitment }) => recruitment.student?.uid).filter((uid) => uid !== null) as string[];
    const favoritedCounts = (await getFavoritedCounts(env, allStudentUids)).filter((favorited) => currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId));

    return {
      mainEvent,
      currentRaids: data.raids.nodes,
      currentEvents: data.events.nodes.filter((event) => !dayjs(event.since).isAfter(now)),
      currentRecruitments,
      favoritedCounts,
    };
  }, 60 * 60 * 24, forceRefresh);
}


/**
 * Joint Firing Drill
 */

const jointFiringDrillQuery = graphql(`
  query JointFiringDrill($uid: String!) {
    jointFiringDrill(uid: $uid) {
      uid season drillType
    }
  }
`);

async function getJointFiringDrill(env: Env, uid: string) {
  return fetchCached(env, `joint-firing-drill::v1::${uid}`, async () => {
    const { data, error } = await runQuery(jointFiringDrillQuery, { uid });
    if (error || !data?.jointFiringDrill) {
      return null;
    }
    return data.jointFiringDrill;
  }, 7 * 24 * 60 * 60);
}


/**
 * Campaign name helper
 */

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
    if (error || !data?.campaign) {
      return null;
    }
    return data.campaign;
  }, 7 * 24 * 60 * 60);
}


/**
 * EventContent name helper
 */

const eventContentNameQuery = graphql(`
  query EventContentName($uid: String!) {
    eventContent(uid: $uid) { uid name }
  }
`);

export async function getEventContentName(env: Env, uid: string): Promise<string | null> {
  return fetchCached(env, `event-content-name::v1::${uid}`, async () => {
    const { data, error } = await runQuery(eventContentNameQuery, { uid });
    if (error || !data?.eventContent) {
      return null;
    }
    return data.eventContent.name;
  }, 7 * 24 * 60 * 60);
}


/**
 * MiniEventContent name helper
 */

const miniEventContentNameQuery = graphql(`
  query MiniEventContentName($uid: String!) {
    miniEventContent(uid: $uid) { uid name }
  }
`);

export async function getMiniEventContentName(env: Env, uid: string): Promise<string | null> {
  return fetchCached(env, `mini-event-content-name::v1::${uid}`, async () => {
    const { data, error } = await runQuery(miniEventContentNameQuery, { uid });
    if (error || !data?.miniEventContent) {
      return null;
    }
    return data.miniEventContent.name;
  }, 7 * 24 * 60 * 60);
}


/**
 * Future Contents
 */

export type RecruitmentInfo = {  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: Date;
  until: Date | null;
  studentName: string;
  student: {
    uid: string;
    attackType?: AttackType;
    defenseType?: DefenseType;
    role?: Role;
  } | null;
};

export type RaidInfo = {
  uid: string;
  boss: string;
  terrain: Terrain;
  attackType: AttackType;
  defenseTypes: { defenseType: DefenseType; difficulty: string | null }[];
  rankVisible: boolean;
};

export type FutureContent = TimelineContent & {
  name: string;
  recruitments: RecruitmentInfo[];
  raidInfo?: RaidInfo;
};

export const RAID_CONTENT_TYPES = ["total_assault", "elimination", "unlimit", "allied"] as const;

function toRecruitmentInfos(group: Awaited<ReturnType<typeof getRecruitmentGroup>>): RecruitmentInfo[] {
  return (group?.recruitments ?? []).sort((a, b) => Number(a.rerun) - Number(b.rerun)).map((r) => ({
    recruitmentType: r.recruitmentType,
    pickup: r.pickup,
    rerun: r.rerun,
    since: new Date(r.since),
    until: r.until ? new Date(r.until) : null,
    studentName: r.studentName,
    student: r.student
      ? {
          uid: r.student.uid,
          attackType: r.student.attackType as AttackType | undefined,
          defenseType: r.student.defenseType as DefenseType | undefined,
          role: r.student.role as Role | undefined,
        }
      : null,
  }));
}

export async function getFutureContents(env: Env): Promise<FutureContent[]> {
  const contents = await getTimelineContents(env);
  const enriched = await Promise.all(
    contents.map(async (content) => {
      // joint_firing_drill — name derived from season + drillType
      if (content.contentType === "joint_firing_drill" && content.contentUid) {
        const drill = await getJointFiringDrill(env, content.contentUid);
        if (!drill) {
          return null;
        }
        const name = `${drill.season}차: ${drillTypeLocale[drill.drillType]}시험`;
        return { ...content, name, recruitments: [] };
      }

      // Raid types — name and raidInfo from getRaidDetail
      if ((RAID_CONTENT_TYPES as readonly string[]).includes(content.contentType) && content.contentUid) {
        const raid = await getRaidDetail(env, content.contentUid);
        const name = raid?.name ?? content.uid;
        const raidInfo: RaidInfo | undefined = raid
          ? {
              uid: raid.uid,
              boss: raid.boss,
              terrain: raid.terrain as Terrain,
              attackType: raid.attackType as AttackType,
              defenseTypes: raid.defenseTypes.map((d) => ({
                defenseType: d.defenseType as DefenseType,
                difficulty: d.difficulty ?? null,
              })),
              rankVisible: raid.rankVisible,
            }
          : undefined;
        return { ...content, name, recruitments: [], raidInfo };
      }

      // campaign — name derived from category + multiplier
      if (content.contentType === "campaign" && content.contentUid) {
        const detail = await getCampaignDetail(env, content.contentUid);
        const name = detail ? buildCampaignName(detail.category, detail.multiplier) : content.uid;
        return { ...content, name, recruitments: [] };
      }

      // pickup — name derived from recruitmentGroup.recruitmentType
      if (content.contentType === "pickup") {
        const group = await getRecruitmentGroup(env, content.uid);
        const name = group ? (pickupGroupTypeLocale[group.recruitmentType] ?? "픽업 모집") : "픽업 모집";
        return { ...content, name, recruitments: toRecruitmentInfos(group) };
      }

      // main_story — name derived from volume + chapter + part info
      if (content.contentType === "main_story" && content.contentUid) {
        const [volumes, group] = await Promise.all([
          getMainStories(env),
          getRecruitmentGroup(env, content.uid),
        ]);
        let name = content.uid;
        outer: for (const volume of volumes) {
          for (const chapter of volume.chapters) {
            for (const part of chapter.parts) {
              if (part.uid === content.contentUid) {
                const volumeTitle = [volume.label, volume.name].filter(Boolean).join(" ");
                const chapterTitle = `제${chapter.chapterNumber}장: ${chapter.name}${part.name ? ` (${part.name})` : ""}`;
                name = `${volumeTitle}\n${chapterTitle}`;
                break outer;
              }
            }
          }
        }
        return { ...content, name, recruitments: toRecruitmentInfos(group) };
      }

      // mini_event — name from miniEventContent(uid:)
      if (content.contentType === "mini_event" && content.contentUid) {
        const [miniEventName, group] = await Promise.all([
          getMiniEventContentName(env, content.contentUid),
          getRecruitmentGroup(env, content.uid),
        ]);
        const name = miniEventName ?? content.uid;
        return { ...content, name, recruitments: toRecruitmentInfos(group) };
      }

      // event and others — name from eventContent(uid:)
      if (content.contentUid) {
        const [eventName, group] = await Promise.all([
          getEventContentName(env, content.contentUid),
          getRecruitmentGroup(env, content.uid),
        ]);
        const name = eventName ?? content.uid;
        return { ...content, name, recruitments: toRecruitmentInfos(group) };
      }

      return { ...content, name: content.uid, recruitments: [] };
    }),
  );

  return enriched.filter((content) => content !== null) as FutureContent[];
}


/**
 * Navigation Bar Contents
 */
const upcomingEventQuery = graphql(`
  query UpcomingEvent($now: ISO8601DateTime!) {
    events(untilAfter: $now, first: 1, types: [event]) {
      nodes { uid since until }
    }
  }
`);

type NavigationBarContents = {
  upcomingEvent: {
    uid: string;
    since: Date;
    until: Date;
  } | null;
  hasRecentNews: boolean;
};

export async function getNavigationBarContents(env: Env, forceRefresh = false): Promise<NavigationBarContents> {
  return fetchCached(env, "navigation-bar-contents::v1", async () => {
    const now = dayjs();
    const { data, error } = await runQuery(upcomingEventQuery, { now: now.toDate() });
    if (error || !data) {
      throw error ?? "failed to fetch upcoming event";
    }

    const upcomingEvent = data.events.nodes[0] ?? null;
    if (upcomingEvent) {
      upcomingEvent.since = dayjs(upcomingEvent.since).toDate();
      upcomingEvent.until = dayjs(upcomingEvent.until).toDate();
    }

    const latestNewsTime = await getLatestPostTime(env, "news");
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return {
      upcomingEvent,
      hasRecentNews: latestNewsTime !== null && latestNewsTime > threeDaysAgo,
    };
  }, 60 * 60 * 24, forceRefresh);
}
