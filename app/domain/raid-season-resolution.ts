/**
 * Which BAQL raid schedule a MolluLog raid row shows on the Korean server (BAQL's `gl` region).
 *
 * BAQL keeps a `gl` raid schedule only for client data and officially announced seasons. A raid row of a season the
 * Korean server has not announced yet keeps its own forecast: its JP season (`raid_type`, `jp_raid_season_index`), its
 * dates, and the predicted Korean-server season number (`gl_raid_season_index`). The JP schedule of that season then
 * supplies the boss, terrain, defense types and attack type.
 *
 * Records are found only by in-game values: a raid type and a season index. No uid is built or parsed here; a uid
 * carried by a result is the one BAQL returned.
 *
 * Every function takes its data as arguments and has no dependency, so the rule can move to a shared package.
 */

/** The raid columns of a timeline row. */
export type RaidRowSeason = {
  /** `timeline_contents.raid_type`. A raid type is the same in every region. */
  raidType: string | null;
  /** `timeline_contents.jp_raid_season_index`: the JP season the Korean server is expected to run. */
  jpRaidSeasonIndex: number | null;
  /** `timeline_contents.gl_raid_season_index`: the Korean-server season number, a prediction until BAQL lists it. */
  glRaidSeasonIndex: number | null;
};

/** A raid row as the rule reads it: its uid and its raid columns. */
export type RaidRowRef = { uid: string; raidSeason: RaidRowSeason };

/** The fields of a BAQL `gl` raid schedule the rule reads. */
export type GlRaidScheduleRef = { raidType: string; seasonIndex: number; jpSchedule: { seasonIndex: number } | null };

/** The fields of a BAQL JP raid schedule the rule reads. */
export type JpRaidScheduleRef = { raidType: string; seasonIndex: number };

export type RaidRowScheduleResolution<G, J> =
  /** The row has no raid type or JP season. The caller keeps its `content_uid` lookup. */
  | { kind: "unlinked" }
  /** BAQL has the `gl` schedule of the row's JP season. */
  | { kind: "gl"; schedule: G }
  /**
   * BAQL has no `gl` schedule of the row's JP season; the JP schedule and the row's own values stand in for it.
   * `seasonIndex` is the row's Korean-server season number only while the season owns it, otherwise null.
   */
  | { kind: "jp"; schedule: J; seasonIndex: number | null }
  /** Neither schedule can be chosen: none exists, or several claim the season. The row shows no schedule data. */
  | { kind: "unresolved" };

function seasonKey(raidType: string, seasonIndex: number): string {
  return JSON.stringify([raidType, seasonIndex]);
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

/**
 * The `gl` schedule BAQL lists for a JP season, found by raid type and JP season index. Null when there is none, or
 * when several claim the season.
 */
export function findGlScheduleOfJpSeason<G extends GlRaidScheduleRef>(
  glSchedules: readonly G[],
  raidType: string,
  jpSeasonIndex: number,
): G | null {
  const matches = glSchedules.filter(
    (schedule) => schedule.raidType === raidType && schedule.jpSchedule?.seasonIndex === jpSeasonIndex,
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * Returns a function that resolves a raid row to the schedule it shows:
 *
 * 1. the `gl` schedule whose JP schedule is the row's JP season;
 * 2. otherwise the JP schedule of that season, shown with the row's dates and `gl_raid_season_index`;
 * 3. otherwise nothing.
 *
 * The `content_uid` of a row with a JP season is never read: once the forecast `gl` schedule is gone, it may hold a
 * predicted number that later belongs to another season.
 *
 * A forecast season (rule 2) owns its Korean-server season number only when it is the season of one of `forecastRows`
 * (the raid rows that have not ended, the ones with a season page), no `gl` schedule of its raid type has that number,
 * and no other of those rows' forecast seasons claims it. Otherwise it is resolved as if the row had no number, so
 * no reader can show or link a number the season does not own.
 */
export function createRaidRowScheduleResolver<G extends GlRaidScheduleRef, J extends JpRaidScheduleRef>(
  glSchedules: readonly G[],
  jpSchedules: readonly J[],
  forecastRows: readonly RaidRowRef[],
): (row: RaidRowRef) => RaidRowScheduleResolution<G, J> {
  // A `gl` schedule's raid type is its JP schedule's raid type.
  const glByJpSeason = groupBy(glSchedules, (schedule) =>
    schedule.jpSchedule ? seasonKey(schedule.raidType, schedule.jpSchedule.seasonIndex) : null,
  );
  const jpBySeason = groupBy(jpSchedules, (schedule) => seasonKey(schedule.raidType, schedule.seasonIndex));

  const resolveSchedule = (season: RaidRowSeason): RaidRowScheduleResolution<G, J> => {
    if (season.raidType === null || season.jpRaidSeasonIndex === null) return { kind: "unlinked" };
    const key = seasonKey(season.raidType, season.jpRaidSeasonIndex);

    const glMatches = glByJpSeason.get(key) ?? [];
    if (glMatches.length === 1 && glMatches[0]) return { kind: "gl", schedule: glMatches[0] };
    if (glMatches.length > 1) return { kind: "unresolved" };

    const jpMatches = jpBySeason.get(key) ?? [];
    if (jpMatches.length === 1 && jpMatches[0]) {
      return { kind: "jp", schedule: jpMatches[0], seasonIndex: season.glRaidSeasonIndex };
    }
    return { kind: "unresolved" };
  };

  const numberKeyOf = (resolution: RaidRowScheduleResolution<G, J>): string | null =>
    resolution.kind === "jp" && resolution.seasonIndex !== null
      ? seasonKey(resolution.schedule.raidType, resolution.seasonIndex)
      : null;
  const glNumberKeys = new Set(glSchedules.map((schedule) => seasonKey(schedule.raidType, schedule.seasonIndex)));
  const claimsByNumber = groupBy(forecastRows, (row) => numberKeyOf(resolveSchedule(row.raidSeason)));
  const ownerUids = new Set(
    [...claimsByNumber]
      .filter(([key, claims]) => !glNumberKeys.has(key) && claims.length === 1)
      .flatMap(([, claims]) => claims.map((row) => row.uid)),
  );

  return (row) => {
    const resolution = resolveSchedule(row.raidSeason);
    if (resolution.kind !== "jp" || resolution.seasonIndex === null || ownerUids.has(row.uid)) return resolution;
    return { ...resolution, seasonIndex: null };
  };
}

/**
 * Boss uids that BAQL spells differently in its JP schedules. A forecast season shows the `gl` spelling, so that
 * boss images, walkthrough boss keys and videos find the same boss as on a `gl` schedule.
 */
export const JP_TO_GL_RAID_BOSS_UIDS: Readonly<Record<string, string>> = {
  nightmare_train: "nightmare",
};

export function toGlRaidBossUid(jpBossUid: string): string {
  return JP_TO_GL_RAID_BOSS_UIDS[jpBossUid] ?? jpBossUid;
}

type ForecastSourceSchedule<T> = {
  uid: string;
  seasonIndex: number;
  region: string;
  startAt: T | null;
  endAt: T | null;
  raidBoss: { uid: string };
  jpSchedule: unknown;
};

/**
 * A forecast Korean-server season, shown in the shape of a `gl` schedule. Its schedule data is the JP schedule's; its
 * dates and season number are the raid row's. Its uid stays the JP schedule's uid as BAQL returned it, and
 * `jpSchedule` points to that JP schedule, as a `gl` schedule's does.
 */
export type ForecastRaidSchedule<J extends ForecastSourceSchedule<T>, T, N extends number | null> = Omit<
  J,
  "seasonIndex" | "region" | "startAt" | "endAt" | "jpSchedule" | "raidBoss"
> & {
  seasonIndex: N;
  region: "gl";
  startAt: T;
  endAt: T | null;
  raidBoss: J["raidBoss"];
  jpSchedule: { uid: string; seasonIndex: number; startAt: T | null };
};

export function toForecastRaidSchedule<J extends ForecastSourceSchedule<T>, T, N extends number | null>(
  jpSchedule: J,
  row: { startAt: T; endAt: T | null },
  seasonIndex: N,
): ForecastRaidSchedule<J, T, N> {
  return {
    ...jpSchedule,
    seasonIndex,
    region: "gl",
    startAt: row.startAt,
    endAt: row.endAt,
    raidBoss: { ...jpSchedule.raidBoss, uid: toGlRaidBossUid(jpSchedule.raidBoss.uid) },
    jpSchedule: { uid: jpSchedule.uid, seasonIndex: jpSchedule.seasonIndex, startAt: jpSchedule.startAt },
  };
}

/**
 * The uid that names a Korean-server season whether BAQL lists its `gl` schedule or MolluLog shows it as a forecast
 * season: the uid of its JP schedule as BAQL returned it (`jpSchedule.uid` of a `gl` schedule or of a forecast
 * season), or the schedule's own uid when a `gl` schedule has no JP schedule.
 */
export function getRaidSeasonIdentityUid(schedule: { uid: string; jpSchedule: { uid: string } | null }): string {
  return schedule.jpSchedule?.uid ?? schedule.uid;
}
