import dayjs from "dayjs";
import type { Attack, Defense, RecruitmentTypeEnum, Terrain } from "~/graphql/graphql";
import { type RaidSchedule, RecruitmentRepository, RaidRepository } from "~/repositories";
import { fetchCached } from "./base";
import type { EventType, RaidType, Role } from "./content.d";
import { hasActiveCoupons } from "./coupon";
import { getFavoritedCounts } from "./favorite-students";
import { getLatestPostTime } from "./post";
import { getRaidDetail } from "./raid";
import {
  getFutureRaidContents,
  getTimelineContents,
  getTimelineContentsByContentTypes,
  getUpcomingEvent,
} from "./timeline-content";
import type { TimelineContent, TimelineContentType } from "./timeline-content";
export {
  contentComments,
  getUserComments,
  getContentComments,
  getContentsComments,
  createComment,
  createSubcomment,
  updateComment,
  deleteComment,
  getCommentIdByUid,
  pinComment,
  unpinComment,
  getPinnedComment,
  getNestedContentComments,
  nestComments,
} from "./content-comment";
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
  return fetchCached(
    env,
    "index-contents::v4",
    async () => {
      const now = dayjs();
      const nowDate = now.toDate();
      const recruitmentRepository = new RecruitmentRepository(env);

      // ========== Events (from D1) ==========
      const eventContentTypes: TimelineContentType[] = ["event", "main_story", "mini_event", "campaign"];
      const allEvents = await getTimelineContentsByContentTypes(env, eventContentTypes, nowDate);

      const ongoingEvents = allEvents.filter(
        (e) => e.contentType === "event" && !dayjs(e.startAt).isAfter(now) && e.endAt && dayjs(e.endAt).isAfter(now),
      );

      let mainEvent: (typeof allEvents)[0] | null = null;
      if (ongoingEvents.length > 0) {
        mainEvent = ongoingEvents[0];
      } else {
        const futureEvents = allEvents.filter((e) => e.contentType === "event" && dayjs(e.startAt).isAfter(now));
        if (futureEvents.length > 0) {
          mainEvent = futureEvents[0];
        }
      }

      // ========== Raids (from timeline_contents + BAQL metadata) ==========
      const currentRaids = (await getUpcomingRaidContents(env, { limit: 4 })).flatMap((content) =>
        content.raidSchedule ? [content.raidSchedule] : [],
      );

      // ========== Recruitments (from BAQL) ==========
      const recruitmentGroups = await recruitmentRepository.getActive(nowDate, forceRefresh);
      const currentRecruitments: { eventUid: string; recruitment: IndexRecruitment }[] = recruitmentGroups
        .flatMap((group) =>
          group.recruitments
            .filter(
              (r) =>
                r.student !== null &&
                r.recruitmentType !== "recollect" &&
                r.recruitmentType !== "archive" &&
                r.recruitmentType !== "encore",
            )
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
      const allStudentUids = currentRecruitments
        .map(({ recruitment }) => recruitment.student?.uid)
        .filter((uid) => uid !== null) as string[];
      const favoritedCounts = (await getFavoritedCounts(env, allStudentUids)).filter((favorited) =>
        currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId),
      );

      const currentEvents = allEvents.filter((e) => !dayjs(e.startAt).isAfter(now));

      return {
        mainEvent,
        currentRaids,
        currentEvents,
        currentRecruitments,
        favoritedCounts,
      };
    },
    60 * 60 * 24,
    forceRefresh,
  );
}

/**
 * Future Contents
 */

export type RecruitmentInfo = {
  recruitmentType: RecruitmentTypeEnum;
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

type RaidScheduleMeta = RaidSchedule;

export type TimelineRaidContent = TimelineContent & {
  raidInfo?: RaidInfo;
  raidSchedule?: RaidScheduleMeta;
};

function toRaidInfo(schedule: RaidScheduleMeta): RaidInfo {
  return {
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
  };
}

function withTimelineDates(schedule: RaidScheduleMeta, content: TimelineContent): RaidScheduleMeta {
  return {
    ...schedule,
    startAt: content.startAt,
    endAt: content.endAt,
  };
}

export async function getUpcomingRaidContents(
  env: Env,
  { limit, forceRefresh = false }: { limit?: number; forceRefresh?: boolean } = {},
): Promise<TimelineRaidContent[]> {
  const raidRepository = new RaidRepository(env);
  const raidContents = await getFutureRaidContents(env, ["raid"]);
  const sortedRaidContents = [...raidContents].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const selectedRaidContents = limit ? sortedRaidContents.slice(0, limit) : sortedRaidContents;

  return Promise.all(
    selectedRaidContents.map(async (content) => {
      if (!content.contentUid) {
        return { ...content };
      }

      const schedule = await raidRepository.getSchedule(content.contentUid, forceRefresh);
      if (!schedule) {
        return { ...content };
      }

      return {
        ...content,
        raidInfo: toRaidInfo(schedule),
        raidSchedule: withTimelineDates(schedule, content),
      };
    }),
  );
}

export async function getUpcomingRaidContentByTypeAndSeason(
  env: Env,
  raidType: RaidType,
  seasonIndex: number,
): Promise<TimelineRaidContent | null> {
  const upcomingRaidContents = await getUpcomingRaidContents(env);
  return (
    upcomingRaidContents.find(
      (content) => content.raidInfo?.raidType === raidType && content.raidInfo.seasonIndex === seasonIndex,
    ) ?? null
  );
}

export type FutureContent = TimelineContent & {
  recruitments: RecruitmentInfo[];
  raidInfo?: RaidInfo;
};

export const RAID_CONTENT_TYPES = ["total_assault", "elimination", "unlimit", "allied", "raid"] as const;

function toRecruitmentInfos(group: Awaited<ReturnType<RecruitmentRepository["getByUid"]>>): RecruitmentInfo[] {
  return (group?.recruitments ?? [])
    .sort((a, b) => Number(a.rerun) - Number(b.rerun))
    .map((r) => ({
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

export async function getFutureContents(env: Env, forceRefresh = false): Promise<FutureContent[]> {
  const allEnriched = await fetchCached(env, "future-contents::v1", async () => {
    const recruitmentRepository = new RecruitmentRepository(env);
    const [contents, upcomingRaidContents] = await Promise.all([
      getTimelineContents(env),
      getUpcomingRaidContents(env, { forceRefresh }),
    ]);
    const upcomingRaidMap = new Map(upcomingRaidContents.map((content) => [content.uid, content]));
    const recruitmentGroupUids = contents
      .map((content) => content.recruitmentGroupUid)
      .filter((uid) => uid !== null) as string[];
    const recruitmentGroups = await recruitmentRepository.getByUids(recruitmentGroupUids, forceRefresh);
    const recruitmentGroupMap = new Map(recruitmentGroups.map((group) => [group.uid, group]));

    return Promise.all(
      contents.map(async (content) => {
        // New raid type — raidInfo from timeline-first upcoming raid lookup
        if (content.contentType === "raid") {
          return { ...content, recruitments: [], raidInfo: upcomingRaidMap.get(content.uid)?.raidInfo };
        }

        // Legacy raid types — raidInfo from deprecated getRaidDetail
        if (
          (["total_assault", "elimination", "unlimit", "allied"] as readonly string[]).includes(content.contentType) &&
          content.contentUid
        ) {
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
          const group = recruitmentGroupMap.get(content.recruitmentGroupUid) ?? null;
          return { ...content, recruitments: toRecruitmentInfos(group) };
        }

        return { ...content, recruitments: [] };
      }),
    );
  }, 24 * 60 * 60, forceRefresh);

  const now = new Date();
  return allEnriched.filter((content) =>
    content.endAt ? dayjs(content.endAt).isAfter(now) : dayjs(content.startAt).isAfter(now),
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
  return fetchCached(
    env,
    "navigation-bar-contents::v3",
    async () => {
      const content = await getUpcomingEvent(env);
      const upcomingEvent = content
        ? { uid: content.uid, since: content.startAt, until: content.endAt ?? content.startAt }
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
    },
    60 * 60 * 24,
    forceRefresh,
  );
}
