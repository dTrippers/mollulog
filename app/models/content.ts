import dayjs from "dayjs";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "./base";
import { getFavoritedCounts } from "./favorite-students";
import type { EventType, RaidType, Role } from "./content.d";
import type { Attack, Defense, RecruitmentTypeEnum, Terrain } from "~/graphql/graphql";
import { getLatestPostTime } from "./post";
import { getTimelineContents, getUpcomingEvent, getTimelineContentsByContentTypes } from "./timeline-content";
import type { TimelineContent, TimelineContentType } from "./timeline-content";
import { getRecruitmentGroup, getRecruitmentGroups } from "./event-content";
import { getRaidDetail, getRaidSchedule } from "./raid";
import { hasActiveCoupons } from "./coupon";
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
  "raid",
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
  "raid",
  "total_assault",
  "elimination",
  "battle_pass",
];

/**
 * Index Contents
 */

const indexRaidsQuery = graphql(`
  query IndexRaids($endAfter: ISO8601DateTime!) {
    raidSchedules(region: "gl", endAfter: $endAfter) {
      nodes {
        uid raidType seasonIndex startAt endAt terrain attackType
        raidBoss { uid name }
        defenseTypes { defenseType difficulty }
        jpSchedule { uid seasonIndex }
      }
    }
  }
`);

export type IndexRecruitment = {
  student: { uid: string; name: string } | null;
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: Date;
  until: Date;
  studentName: string;
};

export async function getIndexContents(env: Env, forceRefresh = false) {
  return fetchCached(env, "index-contents::v3", async () => {
    const now = dayjs();
    const nowDate = now.toDate();

    // ========== Events (from D1) ==========
    const eventContentTypes: TimelineContentType[] = ["event", "main_story", "mini_event", "campaign"];
    const allEvents = await getTimelineContentsByContentTypes(env, eventContentTypes, nowDate);

    const ongoingEvents = allEvents.filter((e) => e.contentType === "event" && !dayjs(e.startAt).isAfter(now) && e.endAt && dayjs(e.endAt).isAfter(now));

    let mainEvent: typeof allEvents[0] | null = null;
    if (ongoingEvents.length > 0) {
      mainEvent = ongoingEvents[0];
    } else {
      const futureEvents = allEvents.filter((e) => e.contentType === "event" && dayjs(e.startAt).isAfter(now));
      if (futureEvents.length > 0) {
        mainEvent = futureEvents[0];
      }
    }

    // ========== Raids (from BAQL) ==========
    const { data: raidData, error: raidError } = await runQuery(indexRaidsQuery, { endAfter: nowDate });
    if (raidError || !raidData) {
      throw raidError ?? "failed to fetch raids";
    }
    const currentRaids = raidData.raidSchedules.nodes.map((schedule) => ({
      ...schedule,
      since: schedule.startAt ? dayjs(schedule.startAt).toDate() : null,
      until: schedule.endAt ? dayjs(schedule.endAt).toDate() : null,
    }));

    // ========== Recruitments (from BAQL) ==========
    const recruitmentGroups = await getRecruitmentGroups(env, { endAfter: nowDate });
    const currentRecruitments: { eventUid: string; recruitment: IndexRecruitment }[] = recruitmentGroups
      .flatMap((group) =>
        group.recruitments
          .filter((r) => r.student !== null && r.recruitmentType !== "recollect" && r.recruitmentType !== "archive" && r.recruitmentType !== "encore")
          .map((r) => ({
            eventUid: group.uid,
            recruitment: {
              student: r.student ? { uid: r.student.uid, name: r.student.name ?? "" } : null,
              recruitmentType: r.recruitmentType,
              pickup: r.pickup,
              rerun: r.rerun,
              since: dayjs(r.since).toDate(),
              until: dayjs(r.until).toDate(),
              studentName: r.studentName,
            } satisfies IndexRecruitment,
          })),
      )
      .filter(({ recruitment }) => !dayjs(recruitment.since).isAfter(now) && dayjs(recruitment.until).isAfter(now));

    // Get favorite counts for all students in current pickups
    const allStudentUids = currentRecruitments.map(({ recruitment }) => recruitment.student?.uid).filter((uid) => uid !== null) as string[];
    const favoritedCounts = (await getFavoritedCounts(env, allStudentUids)).filter((favorited) => currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId));

    const currentEvents = allEvents.filter((e) => !dayjs(e.startAt).isAfter(now));

    return {
      mainEvent,
      currentRaids,
      currentEvents,
      currentRecruitments,
      favoritedCounts,
    };
  }, 60 * 60 * 24, forceRefresh);
}


export { getEventContentName, getMiniEventContentName } from "./content-name";


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
    attackType?: Attack;
    defenseType?: Defense;
    role?: Role;
    schaleDbId?: string | null;
  } | null;
};

export type RaidInfo = {
  raidType: RaidType;
  boss: string;
  name: string;
  seasonIndex?: number;
  terrain: Terrain;
  attackType: Attack | null;
  defenseTypes: { defenseType: Defense; difficulty: string | null }[];
};

export type FutureContent = TimelineContent & {
  recruitments: RecruitmentInfo[];
  raidInfo?: RaidInfo;
};

export const RAID_CONTENT_TYPES = ["total_assault", "elimination", "unlimit", "allied", "raid"] as const;

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
          attackType: r.student.attackType,
          defenseType: r.student.defenseType,
          role: r.student.role as Role | undefined,
          schaleDbId: r.student.schaleDbId,
        }
      : null,
  }));
}

export async function getFutureContents(env: Env): Promise<FutureContent[]> {
  const contents = await getTimelineContents(env);
  return Promise.all(
    contents.map(async (content) => {
      // New raid type — raidInfo from getRaidSchedule
      if (content.contentType === "raid" && content.contentUid) {
        const schedule = await getRaidSchedule(env, content.contentUid);
        const raidInfo: RaidInfo | undefined = schedule
          ? {
              raidType: schedule.raidType as RaidType,
              boss: schedule.raidBoss.uid,
              name: schedule.raidBoss.name,
              seasonIndex: schedule.seasonIndex,
              terrain: schedule.terrain,
              attackType: schedule.attackType,
              defenseTypes: schedule.defenseTypes.map((d) => ({
                defenseType: d.defenseType,
                difficulty: d.difficulty ?? null,
              })),
            }
          : undefined;
        return { ...content, recruitments: [], raidInfo };
      }

      // Legacy raid types — raidInfo from deprecated getRaidDetail
      if ((["total_assault", "elimination", "unlimit", "allied"] as readonly string[]).includes(content.contentType) && content.contentUid) {
        const raid = await getRaidDetail(env, content.contentUid);
        const raidInfo: RaidInfo | undefined = raid
          ? {
              raidType: raid.type as RaidType,
              boss: raid.boss,
              name: raid.name,
              terrain: raid.terrain,
              attackType: raid.attackType,
              defenseTypes: raid.defenseTypes.map((d) => ({
                defenseType: d.defenseType,
                difficulty: d.difficulty ?? null,
              })),
            }
          : undefined;
        return { ...content, recruitments: [], raidInfo };
      }

      // Event types with a recruitment group
      if (content.recruitmentGroupUid) {
        const group = await getRecruitmentGroup(env, content.recruitmentGroupUid);
        return { ...content, recruitments: toRecruitmentInfos(group) };
      }

      return { ...content, recruitments: [] };
    }),
  );
}


/**
 * Navigation Bar Contents
 */
type NavigationBarContents = {
  upcomingEvent: {
    uid: string;
    since: Date;
    until: Date;
  } | null;
  hasRecentNews: boolean;
  hasActiveCoupons: boolean;
};

export async function getNavigationBarContents(env: Env, forceRefresh = false): Promise<NavigationBarContents> {
  return fetchCached(env, "navigation-bar-contents::v3", async () => {
    const content = await getUpcomingEvent(env);
    const upcomingEvent = content
      ? { uid: content.uid, since: content.startAt, until: content.endAt! }
      : null;

    const latestNewsTime = await getLatestPostTime(env, "news");
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const hasActiveCouponsValue = await hasActiveCoupons(env);
    return {
      upcomingEvent,
      hasRecentNews: latestNewsTime !== null && latestNewsTime > threeDaysAgo,
      hasActiveCoupons: hasActiveCouponsValue,
    };
  }, 60 * 60 * 24, forceRefresh);
}
