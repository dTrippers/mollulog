import type { Attack, Defense, Terrain } from "~/graphql/graphql";
import { compareInstantAsc, getInstantTime } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";
import {
  type RaidSchedule,
  type RaidScheduleListItem,
  getAllRaidSchedules,
  getRaidSchedule,
  getRaidScheduleByTypeAndSeason,
} from "~/models/raid";
import { getFutureRaidContents } from "~/models/timeline-content";
import type { TimelineContent } from "~/models/timeline-content";

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

export type RaidScheduleMeta = RaidSchedule | RaidScheduleListItem;

export type TimelineRaidContent = TimelineContent & {
  raidInfo?: RaidInfo;
  raidSchedule?: RaidScheduleMeta;
};

export function toRaidInfo(schedule: RaidScheduleMeta): RaidInfo {
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

export function withTimelineDates(schedule: RaidScheduleMeta, content: TimelineContent): RaidScheduleMeta {
  return {
    ...schedule,
    startAt: content.startAt,
    endAt: content.endAt,
  };
}

export async function enrichRaidContents(
  env: Env,
  contents: TimelineContent[],
  forceRefresh = false,
): Promise<TimelineRaidContent[]> {
  return Promise.all(
    contents.map(async (content) => {
      if (!content.contentUid) {
        return { ...content };
      }

      const schedule = await getRaidSchedule(env, content.contentUid, forceRefresh);
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

export async function getUpcomingRaidContents(
  env: Env,
  {
    limit,
    forceRefresh = false,
    raidTypes,
  }: { limit?: number; forceRefresh?: boolean; raidTypes?: readonly RaidType[] } = {},
): Promise<TimelineRaidContent[]> {
  const raidContents = await getFutureRaidContents(env, ["raid"]);
  const sortedRaidContents = [...raidContents].sort((a, b) => compareInstantAsc(a.startAt, b.startAt));

  if (raidTypes?.length) {
    const raidTypeSet = new Set(raidTypes);
    const schedules = (await getAllRaidSchedules(env, forceRefresh)).filter((schedule) =>
      raidTypeSet.has(schedule.raidType as RaidType),
    );
    const filteredRaidContents = schedules
      .flatMap((schedule) => {
        const matchingContent = findRaidContentForSchedule(sortedRaidContents, schedule);
        if (!matchingContent) {
          return [];
        }

        return [
          {
            ...matchingContent,
            raidInfo: toRaidInfo(schedule),
            raidSchedule: withTimelineDates(schedule, matchingContent),
          },
        ];
      })
      .sort((a, b) => compareInstantAsc(a.startAt, b.startAt));

    return limit ? filteredRaidContents.slice(0, limit) : filteredRaidContents;
  }

  const enrichedRaidContents = await enrichRaidContents(env, sortedRaidContents, forceRefresh);
  return limit ? enrichedRaidContents.slice(0, limit) : enrichedRaidContents;
}

function findRaidContentForSchedule(contents: TimelineContent[], schedule: RaidScheduleMeta) {
  const scheduleStartAt = schedule.startAt ? getInstantTime(schedule.startAt) : null;
  const matchingContentByUid = contents.find((content) => content.contentUid === schedule.uid);
  if (matchingContentByUid) {
    return matchingContentByUid;
  }

  if (scheduleStartAt === null) {
    return undefined;
  }

  const matchingContentsByStartAt = contents.filter((content) => getInstantTime(content.startAt) === scheduleStartAt);
  return matchingContentsByStartAt.length === 1 ? matchingContentsByStartAt[0] : undefined;
}

export async function getUpcomingRaidContentByTypeAndSeason(
  env: Env,
  raidType: RaidType,
  seasonIndex: number,
): Promise<TimelineRaidContent | null> {
  const schedule = await getRaidScheduleByTypeAndSeason(env, raidType, seasonIndex);
  if (!schedule) {
    return null;
  }

  const raidContents = await getFutureRaidContents(env, ["raid"]);
  const matchingContent = findRaidContentForSchedule(raidContents, schedule);

  if (!matchingContent) {
    return null;
  }

  return {
    ...matchingContent,
    raidInfo: toRaidInfo(schedule),
    raidSchedule: withTimelineDates(schedule, matchingContent),
  };
}
