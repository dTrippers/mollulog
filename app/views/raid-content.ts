import type { Attack, Defense, Terrain } from "~/graphql/graphql";
import { compareInstantAsc, getInstantTime } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";
import { getAllRaidSchedules, type RaidSchedule, type RaidScheduleListItem } from "~/models/raid";
import {
  getRaidRowScheduleDetail,
  type KoreanRaidSchedule,
  type KoreanRaidScheduleListItem,
  loadRaidRowResolver,
  type RaidRowLike,
  toRaidRowListSchedule,
} from "~/models/raid-season.server";
import type { TimelineContent } from "~/models/timeline-content";
import { getFutureRaidRows, type TimelineRaidRow } from "~/models/timeline-content.server";

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
  /** Set only for a season with a Korean-server season number, because screens print and link that number. */
  raidSchedule?: RaidScheduleMeta;
};

type KoreanRaidScheduleMeta = KoreanRaidSchedule | KoreanRaidScheduleListItem;

export function toRaidInfo(schedule: KoreanRaidScheduleMeta): RaidInfo {
  return {
    raidType: schedule.raidType as RaidType,
    boss: schedule.raidBoss.uid,
    name: schedule.raidBoss.name,
    seasonIndex: schedule.seasonIndex ?? undefined,
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

function hasSeasonNumber<S extends KoreanRaidScheduleMeta>(schedule: S): schedule is S & { seasonIndex: number } {
  return schedule.seasonIndex !== null;
}

function toTimelineRaidContent(content: TimelineContent, schedule: KoreanRaidScheduleMeta): TimelineRaidContent {
  return {
    ...content,
    raidInfo: toRaidInfo(schedule),
    ...(hasSeasonNumber(schedule) ? { raidSchedule: withTimelineDates(schedule, content) } : {}),
  };
}

/** The row as the general row shape, without the raid columns, so the payload keeps its shape. */
function withoutRaidSeason({ raidSeason: _raidSeason, ...content }: RaidRowLike): TimelineContent {
  return content;
}

export async function enrichRaidContents(
  env: Env,
  rows: RaidRowLike[],
  forceRefresh = false,
): Promise<TimelineRaidContent[]> {
  const { resolve } = await loadRaidRowResolver(env, rows, { forceRefresh });
  return Promise.all(
    rows.map(async (row) => {
      const content = withoutRaidSeason(row);
      const schedule = await getRaidRowScheduleDetail(env, row, resolve(row), forceRefresh);
      return schedule ? toTimelineRaidContent(content, schedule) : { ...content };
    }),
  );
}

export async function getUpcomingRaidContents(
  env: Env,
  {
    limit,
    forceRefresh = false,
    raidTypes,
    ctx,
  }: { limit?: number; forceRefresh?: boolean; raidTypes?: readonly RaidType[]; ctx?: ExecutionContext } = {},
): Promise<TimelineRaidContent[]> {
  const raidContents = await getFutureRaidRows(env, { ctx });
  const sortedRaidContents = [...raidContents].sort((a, b) => compareInstantAsc(a.startAt, b.startAt));

  if (raidTypes?.length) {
    const filteredRaidContents = await selectRaidContentsOfTypes(env, sortedRaidContents, raidTypes, forceRefresh);
    return limit ? filteredRaidContents.slice(0, limit) : filteredRaidContents;
  }

  const enrichedRaidContents = await enrichRaidContents(env, sortedRaidContents, forceRefresh);
  return limit ? enrichedRaidContents.slice(0, limit) : enrichedRaidContents;
}

/**
 * The rows of the raid types that have a season with a Korean-server season number. A row with a JP season shows the
 * schedule the rule resolves; a row without one keeps the lookup by its `content_uid` or, failing that, by its start.
 * Seasons come in BAQL's order, then forecast seasons in row order, each stably sorted by start.
 */
async function selectRaidContentsOfTypes(
  env: Env,
  sortedRows: TimelineRaidRow[],
  raidTypes: readonly RaidType[],
  forceRefresh: boolean,
): Promise<TimelineRaidContent[]> {
  const raidTypeSet = new Set<string>(raidTypes);
  const { resolve, glSchedules: linkedGlSchedules } = await loadRaidRowResolver(env, sortedRows, { forceRefresh });
  const glSchedules = linkedGlSchedules ?? (await getAllRaidSchedules(env, forceRefresh));

  const rowsByGlUid = new Map<string, TimelineRaidRow[]>();
  const forecastContents: TimelineRaidContent[] = [];
  for (const row of sortedRows) {
    const resolution = resolve(row);
    if (resolution.kind === "gl") {
      rowsByGlUid.set(resolution.schedule.uid, [...(rowsByGlUid.get(resolution.schedule.uid) ?? []), row]);
    } else if (resolution.kind === "jp") {
      const schedule = toRaidRowListSchedule(row, resolution);
      if (schedule && hasSeasonNumber(schedule) && raidTypeSet.has(schedule.raidType)) {
        forecastContents.push(toTimelineRaidContent(withoutRaidSeason(row), schedule));
      }
    }
  }

  const scheduledContents = glSchedules
    .filter((schedule) => raidTypeSet.has(schedule.raidType))
    .flatMap((schedule) => {
      const linkedRows = rowsByGlUid.get(schedule.uid);
      if (linkedRows) {
        return linkedRows.map((row) => toTimelineRaidContent(withoutRaidSeason(row), schedule));
      }
      const matchingContent = findRaidContentForSchedule(sortedRows, schedule);
      if (!matchingContent || resolve(matchingContent).kind !== "unlinked") {
        return [];
      }
      return [toTimelineRaidContent(withoutRaidSeason(matchingContent), schedule)];
    });

  return [...scheduledContents, ...forecastContents].sort((a, b) => compareInstantAsc(a.startAt, b.startAt));
}

/** How a row without a JP season finds its `gl` schedule: by its `content_uid`, otherwise by a unique start. */
function findRaidContentForSchedule<T extends TimelineContent>(contents: T[], schedule: RaidScheduleMeta) {
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
