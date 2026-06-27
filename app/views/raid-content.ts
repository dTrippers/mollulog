import type { Attack, Defense, Terrain } from "~/graphql/graphql";
import { compareInstantAsc, getInstantTime } from "~/lib/date-time";
import { getRaidSchedule, getRaidScheduleByTypeAndSeason, type RaidSchedule } from "~/models/raid";
import { getFutureRaidContents } from "~/models/timeline-content";
import type { TimelineContent } from "~/models/timeline-content";
import type { RaidType } from "~/models/content.d";

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

export type RaidScheduleMeta = RaidSchedule;

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
  const schedule = await getRaidScheduleByTypeAndSeason(env, raidType, seasonIndex);
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
