import type { HomeCampaign, HomeJointFiringDrill } from "~/domain/home-content";
import { getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import { cacheKey, fetchRouteCached } from "~/lib/cache";
import { compareInstantAsc, isInstantAfter, nowUtcIso, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import type { Role } from "~/models/content.d";
import { getFavoritedCounts } from "~/models/favorite-students";
import { getHomeCampaigns, getHomeJointFiringDrills } from "~/models/home-overview";
import { getAllRecruitmentGroups } from "~/models/recruitment";
import type { TimelineContent, TimelineContentType } from "~/models/timeline-content";
import {
  findEventsForRecruitmentStudent,
  getHomeMainStoryContent,
  getTimelineContentsByContentTypes,
  groupTimelineContentsByRecruitmentGroupUid,
} from "~/models/timeline-content.server";
import { getUpcomingRaidContents, type RaidScheduleMeta } from "./raid-content";

function isOngoingContent(content: TimelineContent, now: UtcIsoString): boolean {
  return !isInstantAfter(content.startAt, now) && content.endAt !== null && isInstantAfter(content.endAt, now);
}

export function selectHomeMainEvent(contents: TimelineContent[], now: UtcIsoString): TimelineContent | null {
  const ongoingEvent = contents.find((content) => content.contentType === "event" && isOngoingContent(content, now));
  const upcomingEvent = contents
    .filter((content) => content.contentType === "event" && isInstantAfter(content.startAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt))[0];

  return ongoingEvent ?? upcomingEvent ?? null;
}

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

export type IndexContents = {
  mainEvent: TimelineContent | null;
  currentRaids: RaidScheduleMeta[];
  currentRecruitments: { eventUid: string; recruitment: IndexRecruitment }[];
  favoritedCounts: Awaited<ReturnType<typeof getFavoritedCounts>>;
};

export type HomeSourceResult<T> = { status: "success"; data: T } | { status: "error" };

export type HomeOverviewSources = {
  campaigns: HomeSourceResult<HomeCampaign[]>;
  jointFiringDrills: HomeSourceResult<HomeJointFiringDrill[]>;
  mainStoryContent: HomeSourceResult<TimelineContent | null>;
};

async function loadHomeSource<T>(
  load: () => Promise<T>,
  onError: (error: unknown) => void,
): Promise<HomeSourceResult<T>> {
  try {
    return { status: "success", data: await load() };
  } catch (error) {
    onError(error);
    return { status: "error" };
  }
}

export async function getHomeOverviewSources(env: Env, forceRefresh = false, ctx?: ExecutionContext) {
  const logger = getLogger(env, ctx, { route: "home.overview" });
  const now = nowUtcIso();
  const [campaigns, jointFiringDrills, mainStoryContent] = await Promise.all([
    loadHomeSource(
      () => getHomeCampaigns(env, forceRefresh),
      (error) => logger.error("Failed to load home campaigns", error),
    ),
    loadHomeSource(
      () => getHomeJointFiringDrills(env, forceRefresh),
      (error) => logger.error("Failed to load home joint firing drills", error),
    ),
    loadHomeSource(
      () => getHomeMainStoryContent(env, now, { ctx }),
      (error) => logger.error("Failed to load home main story contents", error),
    ),
  ]);

  return { campaigns, jointFiringDrills, mainStoryContent } satisfies HomeOverviewSources;
}

export async function getIndexContents(env: Env, forceRefresh = false, ctx?: ExecutionContext): Promise<IndexContents> {
  return fetchRouteCached<IndexContents>(
    env,
    ctx,
    cacheKey("route", "index", 4, "all"),
    async () => {
      const now = nowUtcIso();
      const nowDate = new Date(now);
      const eventContentTypes: TimelineContentType[] = ["event", "main_story", "mini_event", "campaign"];

      const [allEvents, currentRaids, allRecruitmentGroups] = await Promise.all([
        getTimelineContentsByContentTypes(env, eventContentTypes, now, { ctx }).then((events) =>
          events.filter((content) => !content.endAt || isInstantAfter(content.endAt, now)),
        ),
        getUpcomingRaidContents(env, {
          limit: 4,
          forceRefresh,
          raidTypes: ["total_assault", "elimination", "unlimit"],
          ctx,
        }).then((contents) => contents.flatMap((content) => (content.raidSchedule ? [content.raidSchedule] : []))),
        getAllRecruitmentGroups(env, forceRefresh),
      ]);

      const mainEvent = selectHomeMainEvent(allEvents, now);

      const recruitmentGroups = allRecruitmentGroups.filter((group) => {
        const startAt = new Date(group.startAt).getTime();
        const endAt = group.endAt ? new Date(group.endAt).getTime() : null;
        const nowTime = nowDate.getTime();
        return startAt <= nowTime && (endAt === null || endAt >= nowTime);
      });
      const eventsByRecruitmentGroupUid = groupTimelineContentsByRecruitmentGroupUid(allEvents);
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
              eventUid:
                findEventsForRecruitmentStudent(
                  eventsByRecruitmentGroupUid.get(group.uid) ?? [],
                  recruitment.student?.uid ?? null,
                )[0]?.uid ?? group.uid,
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
            !isInstantAfter(recruitment.since, now) &&
            recruitment.until !== null &&
            isInstantAfter(recruitment.until, now),
        );

      const allStudentUids = currentRecruitments.map(({ recruitment }) => recruitment.favoriteKey);
      const favoritedCounts = (await getFavoritedCounts(env, allStudentUids, { ctx })).filter((favorited) =>
        currentRecruitments.some((recruitment) => recruitment.eventUid === favorited.contentId),
      );

      return {
        mainEvent,
        currentRaids,
        currentRecruitments,
        favoritedCounts,
      };
    },
    forceRefresh,
  );
}
