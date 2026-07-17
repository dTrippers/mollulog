import { getRecurringRaidStudents, type RaidPortalSeasonStudentUsage } from "~/domain/raid-portal";
import type { Defense } from "~/graphql/graphql";
import { cacheKey, cacheQuery, fetchRouteCached } from "~/lib/cache";
import { compareInstantAsc, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { fetchRaidOverviewStudentUsage } from "~/lib/ranks/overview";
import { fetchRaidVideos } from "~/lib/ranks/videos";
import type { RaidType } from "~/models/content.d";
import { getAllRaidSchedules, type RaidScheduleListItem } from "~/models/raid";
import { getRaidVideoParties, getVideoDateRange, type RaidVideoItem } from "~/models/raid-videos";
import { getAllStudentsMap, type Student } from "~/models/student";

const SUPPORTED_RAID_TYPES = new Set(["total_assault", "elimination"]);
const RECENT_VIDEO_LIMIT = 4;
const RECENT_VIDEO_FETCH_LIMIT = 100;

type LoadStatus = "ready" | "partial" | "unavailable" | "error";

export type RaidPortalCurrentRaid = {
  raid: RaidScheduleListItem;
  videos: RaidVideoItem[];
  videoStatus: LoadStatus;
  partyStudents: Record<string, Pick<Student, "name" | "attackType" | "defenseType" | "role">>;
};

export type RaidPortalUpcomingRaid = {
  raid: RaidScheduleListItem;
};

export type RaidPortalRecurringStudentItem = {
  studentUid: string;
  name: string;
  totalCount: number;
  raidKeys: string[];
  raidUsages: {
    raidKey: string;
    count: number;
    usageRate: number;
  }[];
};

export type RaidPortalData = {
  currentRaids: RaidPortalCurrentRaid[];
  upcomingRaids: RaidPortalUpcomingRaid[];
  recurringStudents: RaidPortalRecurringStudentItem[];
  recurringStudentsStatus: LoadStatus;
};

type RaidPortalSeasonUsage = RaidPortalSeasonStudentUsage & {
  sampleSize: number;
};

function raidKey(raid: Pick<RaidScheduleListItem, "raidType" | "seasonIndex">) {
  return `${raid.raidType}:${raid.seasonIndex}`;
}

function isOngoingRaid(raid: RaidScheduleListItem, now: string) {
  return Boolean(raid.startAt && raid.endAt && !isInstantAfter(raid.startAt, now) && isInstantAfter(raid.endAt, now));
}

function isUpcomingRaid(raid: RaidScheduleListItem, now: string) {
  return Boolean(raid.startAt && isInstantAfter(raid.startAt, now));
}

async function loadRecentPartyVideos(
  env: Env,
  ctx: ExecutionContext | undefined,
  raid: RaidScheduleListItem,
  forceRefresh: boolean,
): Promise<{
  videos: RaidVideoItem[];
  status: LoadStatus;
}> {
  try {
    return await fetchRouteCached(
      env,
      ctx,
      cacheKey("route", "raid-portal-videos", 2, cacheQuery({ uid: raid.uid })),
      async () => {
        const dateRange = await getVideoDateRange(env, raid, forceRefresh);
        if (!dateRange) {
          return { videos: [], status: "unavailable" as const };
        }

        const result = await fetchRaidVideos({
          raidType: raid.raidType,
          boss: raid.raidBoss.uid,
          from: dateRange.from,
          to: dateRange.to,
          limit: RECENT_VIDEO_FETCH_LIMIT,
          offset: 0,
          sort: "published_at_desc",
        });
        return {
          videos: result.videos.filter((video) => getRaidVideoParties(video).length > 0).slice(0, RECENT_VIDEO_LIMIT),
          status: "ready" as const,
        };
      },
      forceRefresh,
    );
  } catch {
    return { videos: [], status: "error" };
  }
}

async function loadUpcomingStudentUsage(upcomingRaids: RaidScheduleListItem[]): Promise<{
  usages: RaidPortalSeasonUsage[];
  status: LoadStatus;
}> {
  let attemptedCount = 0;
  let failedCount = 0;
  const usages = await Promise.all(
    upcomingRaids.map(async (raid): Promise<RaidPortalSeasonUsage | null> => {
      const jpSeason = raid.jpSchedule?.seasonIndex;
      const defenseTypes = [...new Set(raid.defenseTypeSets.map(({ primaryDefenseType }) => primaryDefenseType))];
      if (jpSeason == null || defenseTypes.length === 0) {
        return null;
      }

      attemptedCount += defenseTypes.length;
      const results = await Promise.allSettled(
        defenseTypes.map((defenseType) =>
          fetchRaidOverviewStudentUsage({
            raidType: raid.raidType as RaidType,
            season: jpSeason,
            defenseType: defenseType as Defense,
          }),
        ),
      );
      const overviews = results.flatMap((result) => {
        if (result.status === "fulfilled") {
          return [result.value];
        }
        failedCount += 1;
        return [];
      });
      if (overviews.length === 0) {
        return null;
      }

      const studentCounts: Record<string, number> = {};
      let sampleSize = 0;
      for (const overview of overviews) {
        sampleSize += overview.sampleSize;
        for (const [studentUid, count] of Object.entries(overview.studentCounts)) {
          studentCounts[studentUid] = (studentCounts[studentUid] ?? 0) + count;
        }
      }
      const key = raidKey(raid);
      return { raidKey: key, sampleSize, studentCounts };
    }),
  );

  const availableUsages = usages.filter((usage): usage is RaidPortalSeasonUsage => usage !== null);
  const status: LoadStatus =
    availableUsages.length > 0 ? (failedCount > 0 ? "partial" : "ready") : attemptedCount > 0 ? "error" : "unavailable";
  return { usages: availableUsages, status };
}

export async function getRaidPortalData(
  env: Env,
  ctx?: ExecutionContext,
  forceRefresh = false,
): Promise<RaidPortalData> {
  const now = nowUtcIso();
  const [allSchedules, rawAllStudents] = await Promise.all([
    getAllRaidSchedules(env, forceRefresh),
    getAllStudentsMap(env, forceRefresh),
  ]);
  const schedules = allSchedules.filter(({ raidType }) => SUPPORTED_RAID_TYPES.has(raidType));
  const current = schedules
    .filter((raid) => isOngoingRaid(raid, now))
    .sort((a, b) => compareInstantAsc(a.startAt ?? now, b.startAt ?? now));
  const futureSchedules = schedules
    .filter((raid) => isUpcomingRaid(raid, now))
    .sort((a, b) => compareInstantAsc(a.startAt ?? now, b.startAt ?? now));
  const upcoming = futureSchedules;

  const [currentVideoResults, upcomingUsage] = await Promise.all([
    Promise.all(current.map((raid) => loadRecentPartyVideos(env, ctx, raid, forceRefresh))),
    loadUpcomingStudentUsage(upcoming),
  ]);
  const currentRaids = current.map((raid, index) => {
    const videos = currentVideoResults[index]?.videos ?? [];
    const partyStudentUids = new Set(
      videos.flatMap((video) =>
        getRaidVideoParties(video).flatMap((party) => party.slots.flatMap(({ studentUid }) => studentUid ?? [])),
      ),
    );
    const partyStudents = Object.fromEntries(
      [...partyStudentUids].flatMap((studentUid) => {
        const student = rawAllStudents[studentUid];
        return student
          ? [
              [
                studentUid,
                {
                  name: student.name,
                  attackType: student.attackType,
                  defenseType: student.defenseType,
                  role: student.role,
                },
              ] as const,
            ]
          : [];
      }),
    );
    return {
      raid,
      videos,
      videoStatus: currentVideoResults[index]?.status ?? "error",
      partyStudents,
    };
  });
  const recurringStudents = getRecurringRaidStudents(upcomingUsage.usages).flatMap((student) => {
    const name = rawAllStudents[student.studentUid]?.name;
    if (!name) {
      return [];
    }
    const raidUsages = upcomingUsage.usages.flatMap((usage) => {
      const count = usage.studentCounts[student.studentUid] ?? 0;
      return count > 0
        ? [
            {
              raidKey: usage.raidKey,
              count,
              usageRate: usage.sampleSize > 0 ? count / usage.sampleSize : 0,
            },
          ]
        : [];
    });
    return [
      {
        studentUid: student.studentUid,
        name,
        totalCount: student.totalCount,
        raidKeys: student.raidKeys,
        raidUsages,
      },
    ];
  });

  return {
    currentRaids,
    upcomingRaids: upcoming.map((raid) => ({ raid })),
    recurringStudents,
    recurringStudentsStatus: upcomingUsage.status,
  };
}
