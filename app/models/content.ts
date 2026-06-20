import type { Attack, Defense, RecruitmentTypeEnum, Terrain } from "~/graphql/graphql";
import {
  type UtcIsoString,
  compareInstantAsc,
  getInstantTime,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
  toUtcIso,
} from "~/lib/date-time";
import { RaidRepository, type RaidSchedule, RecruitmentRepository } from "~/repositories";
import { fetchCached } from "./base";
import type { RaidType, Role } from "./content.d";
import { getAllCoupons } from "./coupon";
import { getFavoritedCounts } from "./favorite-students";
import { normalizeFutureContentDates } from "./future-content";
import { getLatestPostTime } from "./post";
import { getRecruitmentFavoriteKey } from "./recruitment-identity";
import { getFutureRaidContents, getTimelineContents, getTimelineContentsByContentTypes } from "./timeline-content";
import type { TimelineContent, TimelineContentType } from "./timeline-content";
export { CONTENT_ORDER, SHOW_LINK_CONTENT_TYPES, SHOW_LINK_RAID_TYPES } from "./content-rules";
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

/**
 * Index Contents
 */

export type IndexRecruitment = {
  student: { uid: string; name: string; attackType: Attack; defenseType: Defense; role: Role } | null;
  favoriteKey: string;
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  studentName: string;
};

async function enrichRaidContents(
  env: Env,
  contents: TimelineContent[],
  forceRefresh = false,
): Promise<TimelineRaidContent[]> {
  const raidRepository = new RaidRepository(env);
  return Promise.all(
    contents.map(async (content) => {
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

export async function getIndexContents(env: Env, forceRefresh = false) {
  const now = nowUtcIso();
  const nowDate = new Date(now);
  const eventContentTypes: TimelineContentType[] = ["event", "main_story", "mini_event", "campaign"];

  const recruitmentRepository = new RecruitmentRepository(env);
  const [allEvents, currentRaids, allRecruitmentGroups] = await Promise.all([
    getTimelineContentsByContentTypes(env, eventContentTypes, now).then((events) =>
      events.filter((content) => !content.endAt || isInstantAfter(content.endAt, now)),
    ),
    getUpcomingRaidContents(env, { limit: 4, forceRefresh }).then((contents) =>
      contents.flatMap((content) => (content.raidSchedule ? [content.raidSchedule] : [])),
    ),
    recruitmentRepository.getAll(forceRefresh),
  ]);

  const ongoingEvents = allEvents.filter(
    (event) =>
      event.contentType === "event" &&
      !isInstantAfter(event.startAt, now) &&
      event.endAt &&
      isInstantAfter(event.endAt, now),
  );
  const mainEvent =
    ongoingEvents[0] ??
    allEvents.find((event) => event.contentType === "event" && isInstantAfter(event.startAt, now)) ??
    null;

  const recruitmentGroups = allRecruitmentGroups.filter((group) => {
    const startAt = new Date(group.startAt).getTime();
    const endAt = group.endAt ? new Date(group.endAt).getTime() : null;
    const nowTime = nowDate.getTime();
    return startAt <= nowTime && (endAt === null || endAt >= nowTime);
  });
  const timelineUidByRecruitmentGroupUid = new Map(
    allEvents
      .filter((event) => event.recruitmentGroupUid)
      .map((event) => [event.recruitmentGroupUid as string, event.uid]),
  );
  const currentRecruitments: { eventUid: string; recruitment: IndexRecruitment }[] = recruitmentGroups
    .flatMap((group) =>
      group.recruitments
        .filter(
          (recruitment) =>
            recruitment.recruitmentType !== "recollect" &&
            recruitment.recruitmentType !== "archive" &&
            recruitment.recruitmentType !== "encore",
        )
        .map((recruitment) => ({
          eventUid: timelineUidByRecruitmentGroupUid.get(group.uid) ?? group.uid,
          recruitment: {
            student: recruitment.student
              ? {
                  uid: recruitment.student.uid,
                  name: recruitment.student.name ?? "",
                  attackType: recruitment.student.attackType,
                  defenseType: recruitment.student.defenseType,
                  role: recruitment.student.role,
                }
              : null,
            favoriteKey: getRecruitmentFavoriteKey(recruitment),
            recruitmentType: recruitment.recruitmentType,
            pickup: recruitment.pickup,
            rerun: recruitment.rerun,
            since: toUtcIso(recruitment.since),
            until: recruitment.until ? toUtcIso(recruitment.until) : null,
            studentName: recruitment.studentName,
          } satisfies IndexRecruitment,
        })),
    )
    .filter(
      ({ recruitment }) =>
        !isInstantAfter(recruitment.since, now) && recruitment.until !== null && isInstantAfter(recruitment.until, now),
    );

  const allStudentUids = currentRecruitments.map(({ recruitment }) => recruitment.favoriteKey);
  const favoritedCounts = (await getFavoritedCounts(env, allStudentUids)).filter((favorited) =>
    currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId),
  );

  return {
    mainEvent,
    currentRaids,
    currentRecruitments,
    favoritedCounts,
  };
}

/**
 * Future Contents
 */

export type RecruitmentInfo = {
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  studentName: string;
  favoriteKey: string;
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
  defenseTypeSets?: {
    difficulty: string | null;
    defenseTypes: Defense[];
    primaryDefenseType: Defense;
    secondaryDefenseTypes: Defense[];
  }[];
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
    defenseTypeSets: schedule.defenseTypeSets.map((set) => ({
      difficulty: set.difficulty ?? null,
      defenseTypes: set.defenseTypes,
      primaryDefenseType: set.primaryDefenseType,
      secondaryDefenseTypes: set.secondaryDefenseTypes,
    })),
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
  const raidContents = await getFutureRaidContents(env, ["raid"]);
  const sortedRaidContents = [...raidContents].sort((a, b) => compareInstantAsc(a.startAt, b.startAt));
  const selectedRaidContents = limit ? sortedRaidContents.slice(0, limit) : sortedRaidContents;
  return enrichRaidContents(env, selectedRaidContents, forceRefresh);
}

export async function getUpcomingRaidContentByTypeAndSeason(
  env: Env,
  raidType: RaidType,
  seasonIndex: number,
): Promise<TimelineRaidContent | null> {
  const raidRepository = new RaidRepository(env);
  const schedule = await raidRepository.getByTypeAndSeason(raidType, seasonIndex);
  if (!schedule) {
    return null;
  }

  const scheduleStartAt = schedule.startAt ? getInstantTime(schedule.startAt) : null;
  const raidContents = await getFutureRaidContents(env, ["raid"]);
  const matchingContent =
    raidContents.find((content) => content.contentUid === schedule.uid) ??
    (scheduleStartAt !== null
      ? raidContents.find((content) => getInstantTime(content.startAt) === scheduleStartAt)
      : undefined);

  if (!matchingContent) {
    return null;
  }

  return {
    ...matchingContent,
    raidInfo: toRaidInfo(schedule),
    raidSchedule: withTimelineDates(schedule, matchingContent),
  };
}

export type FutureContent = TimelineContent & {
  recruitments: RecruitmentInfo[];
  raidInfo?: RaidInfo;
};

function toRecruitmentInfos(group: Awaited<ReturnType<RecruitmentRepository["getByUid"]>>): RecruitmentInfo[] {
  return (group?.recruitments ?? [])
    .sort((a, b) => Number(a.rerun) - Number(b.rerun))
    .map((r) => ({
      recruitmentType: r.recruitmentType,
      pickup: r.pickup,
      rerun: r.rerun,
      since: toUtcIso(r.since),
      until: r.until ? toUtcIso(r.until) : null,
      studentName: r.studentName,
      favoriteKey: getRecruitmentFavoriteKey(r),
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
  const allEnriched = await fetchCached(
    env,
    "future-contents::v2",
    async () => {
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
          if (content.contentType === "raid") {
            return { ...content, recruitments: [], raidInfo: upcomingRaidMap.get(content.uid)?.raidInfo };
          }

          if (content.recruitmentGroupUid) {
            const group = recruitmentGroupMap.get(content.recruitmentGroupUid) ?? null;
            return { ...content, recruitments: toRecruitmentInfos(group) };
          }

          return { ...content, recruitments: [] };
        }),
      );
    },
    24 * 60 * 60,
    forceRefresh,
  );

  const now = nowUtcIso();
  return allEnriched
    .map(normalizeFutureContentDates)
    .filter((content) => (content.endAt ? isInstantAfter(content.endAt, now) : isInstantAfter(content.startAt, now)));
}

/**
 * Navigation Bar Contents
 */
type NavigationBarContents = {
  upcomingEvent: {
    uid: string;
    since: UtcIsoString;
    until: UtcIsoString;
  } | null;
  hasRecentNews: boolean;
  hasActiveCoupons: boolean;
};

type NavigationBarContentsRaw = {
  eventCandidates: {
    uid: string;
    startAt: UtcIsoString;
    endAt: UtcIsoString | null;
    runType: TimelineContent["runType"];
  }[];
  latestNewsTime: UtcIsoString | null;
  couponActivePeriods: { endAt: UtcIsoString | null }[];
};

export async function getNavigationBarContentsRaw(env: Env, forceRefresh = false): Promise<NavigationBarContentsRaw> {
  return fetchCached(
    env,
    "navigation-bar-contents-raw::v2",
    async () => {
      const now = nowUtcIso();
      const [contents, latestNewsTime, coupons] = await Promise.all([
        // Limit D1 results to active and future events (endAt >= now).
        getTimelineContentsByContentTypes(env, ["event"], now),
        getLatestPostTime(env, "news"),
        getAllCoupons(env),
      ]);

      return {
        eventCandidates: contents
          .filter((content) => content.runType !== "permanent")
          .map((content) => ({
            uid: content.uid,
            startAt: content.startAt,
            endAt: content.endAt,
            runType: content.runType,
          })),
        latestNewsTime: latestNewsTime ? toUtcIso(latestNewsTime) : null,
        couponActivePeriods: coupons.map((coupon) => ({
          endAt: coupon.expiresAt ? toUtcIso(coupon.expiresAt) : null,
        })),
      };
    },
    60 * 60 * 24,
    forceRefresh,
  );
}

export async function getNavigationBarContents(env: Env, forceRefresh = false): Promise<NavigationBarContents> {
  const now = nowUtcIso();
  const raw = await getNavigationBarContentsRaw(env, forceRefresh);
  const upcomingEventContent = raw.eventCandidates
    .filter((content) => content.endAt && isInstantAfter(content.endAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt))[0];
  const upcomingEvent = upcomingEventContent
    ? {
        uid: upcomingEventContent.uid,
        since: upcomingEventContent.startAt,
        until: upcomingEventContent.endAt ?? upcomingEventContent.startAt,
      }
    : null;

  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  return {
    upcomingEvent,
    hasRecentNews: raw.latestNewsTime !== null && !isInstantBefore(raw.latestNewsTime, threeDaysAgo),
    hasActiveCoupons: raw.couponActivePeriods.some(
      (period) => period.endAt === null || isInstantAfter(period.endAt, now),
    ),
  };
}
