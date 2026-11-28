import {
  findKoreanRaidSeason,
  findKoreanRaidSeasonOfJpSchedule,
  findNumberedForecastRaidSeason as findPackageNumberedForecastRaidSeason,
  findRaidRowSeasonPage,
  hasRaidRowNotEnded,
  isLinkedRaidRow,
  listKoreanRaidSchedules,
  listNumberedKoreanRaidSchedules,
  type ForecastRaidSeason as PackageForecastRaidSeason,
  type KoreanRaidSeasons as PackageKoreanRaidSeasons,
  type NumberedForecastRaidSeason as PackageNumberedForecastRaidSeason,
  type RaidRowResolution as PackageRaidRowResolution,
  type RaidRowSeason,
  toForecastRaidSchedule,
  toKoreanRaidSeasons,
  toRaidRowListSchedule as toPackageRaidRowListSchedule,
} from "@dtrippers/mollulog-sdk";
import type { UtcIsoString } from "~/lib/date-time";
import { getAllRaidSchedules, getRaidSchedule, type RaidSchedule, type RaidScheduleListItem, warmRaidCache } from "~/models/raid";
import { getAllRaidRows, getFutureRaidRows, type TimelineContent } from "~/models/timeline-content.server";

// Korean-server raid seasons: BAQL's `gl` schedules, plus the forecast seasons of MolluLog raid rows whose JP season has
// no `gl` schedule at BAQL. The rule and the season assembly are in `@dtrippers/mollulog-sdk`; this module reads the
// raid rows and BAQL's lists (with their caches) for them, and BAQL's schedule details for the screens.

/**
 * `seasons` passes the Korean-server seasons a request already read, so that one request reads the raid rows and BAQL's
 * lists once.
 */
type RaidSeasonReadOptions = { forceRefresh?: boolean; ctx?: ExecutionContext; seasons?: KoreanRaidSeasons };

/** A Korean-server season in the shape of a `gl` list item. A forecast season may have no season number yet. */
export type KoreanRaidScheduleListItem = Omit<RaidScheduleListItem, "seasonIndex"> & { seasonIndex: number | null };

/** A Korean-server season in the shape of a `gl` schedule detail. A forecast season may have no season number yet. */
export type KoreanRaidSchedule = Omit<RaidSchedule, "seasonIndex"> & { seasonIndex: number | null };

/** A timeline row; a raid row read with its raid columns carries them in `raidSeason`. */
export type RaidRowLike = TimelineContent & { raidSeason?: RaidRowSeason };

type RowDates = { startAt: UtcIsoString; endAt: UtcIsoString | null };

/** A raid row that has not ended whose JP season has no `gl` schedule at BAQL, shown from the JP schedule. */
export type ForecastRaidSeason = PackageForecastRaidSeason<RaidScheduleListItem>;

type NumberedForecastRaidSeason = PackageNumberedForecastRaidSeason<RaidScheduleListItem>;

export type RaidRowResolution = PackageRaidRowResolution<RaidScheduleListItem, RaidScheduleListItem>;

/** BAQL's `gl` schedules and the forecast seasons of the raid rows that have not ended, read once. */
export type KoreanRaidSeasons = PackageKoreanRaidSeasons<RaidScheduleListItem, RaidScheduleListItem>;

function loadRaidScheduleLists(env: Env, forceRefresh: boolean) {
  return Promise.all([
    getAllRaidSchedules(env, forceRefresh),
    getAllRaidSchedules(env, forceRefresh, { region: "jp" }),
  ]);
}

/** Reads the Korean-server seasons: the raid rows that have not ended, and BAQL's `gl` and JP lists. */
export async function loadKoreanRaidSeasons(
  env: Env,
  { forceRefresh = false, ctx }: Omit<RaidSeasonReadOptions, "seasons"> = {},
): Promise<KoreanRaidSeasons> {
  const [futureRows, [glSchedules, jpSchedules]] = await Promise.all([
    getFutureRaidRows(env, { ctx }),
    loadRaidScheduleLists(env, forceRefresh),
  ]);
  return toKoreanRaidSeasons(glSchedules, jpSchedules, futureRows);
}

function seasonsOf(env: Env, options: RaidSeasonReadOptions): Promise<KoreanRaidSeasons> {
  return options.seasons ? Promise.resolve(options.seasons) : loadKoreanRaidSeasons(env, options);
}

/**
 * Resolves each of `futureRows`, the raid rows that have not ended, by the rule. BAQL's lists are read only when a row
 * has a JP season.
 */
export async function loadRaidRowResolver(
  env: Env,
  futureRows: readonly RaidRowLike[],
  { forceRefresh = false }: Omit<RaidSeasonReadOptions, "seasons"> = {},
): Promise<{
  resolve: (row: RaidRowLike) => RaidRowResolution;
  glSchedules: RaidScheduleListItem[] | null;
}> {
  if (!futureRows.some(isLinkedRaidRow)) {
    return { resolve: () => ({ kind: "unlinked" }), glSchedules: null };
  }
  const [glSchedules, jpSchedules] = await loadRaidScheduleLists(env, forceRefresh);
  const { resolve } = toKoreanRaidSeasons(glSchedules, jpSchedules, futureRows);
  return { resolve, glSchedules };
}

/**
 * The schedule detail a raid row shows. A row without a JP season keeps the lookup by its `content_uid`; a forecast
 * season is the JP schedule's detail with the row's dates and the season number it owns.
 */
export async function getRaidRowScheduleDetail(
  env: Env,
  row: RaidRowLike,
  resolution: RaidRowResolution,
  forceRefresh = false,
): Promise<KoreanRaidSchedule | null> {
  switch (resolution.kind) {
    case "unlinked":
      return row.contentUid ? getRaidSchedule(env, row.contentUid, forceRefresh) : null;
    case "gl":
      return getRaidSchedule(env, resolution.schedule.uid, forceRefresh);
    case "jp": {
      const detail = await getRaidSchedule(env, resolution.schedule.uid, forceRefresh);
      return detail ? toForecastRaidSchedule(detail, row, resolution.seasonIndex) : null;
    }
    case "unresolved":
      return null;
  }
}

/** The list item a resolved row shows, or null when the rule leaves it without one. Unlinked rows are the caller's. */
export function toRaidRowListSchedule(
  row: RowDates,
  resolution: Exclude<RaidRowResolution, { kind: "unlinked" }>,
): KoreanRaidScheduleListItem | null {
  return toPackageRaidRowListSchedule(row, resolution);
}

/** Every Korean-server season: BAQL's `gl` schedules, then the forecast seasons, with or without a number. */
export async function getKoreanRaidSchedules(
  env: Env,
  options: RaidSeasonReadOptions = {},
): Promise<KoreanRaidScheduleListItem[]> {
  return listKoreanRaidSchedules(await seasonsOf(env, options));
}

/** The Korean-server seasons that have a season page: BAQL's `gl` schedules, then the numbered forecast seasons. */
export async function getNumberedKoreanRaidSchedules(
  env: Env,
  options: RaidSeasonReadOptions = {},
): Promise<RaidScheduleListItem[]> {
  return listNumberedKoreanRaidSchedules(await seasonsOf(env, options));
}

/**
 * The forecast season that owns that raid type and Korean-server season number, or null. Its number is never a `gl`
 * season's, so a season BAQL lists has none.
 */
export async function findNumberedForecastRaidSeason(
  env: Env,
  raidType: string,
  seasonIndex: number,
  options: RaidSeasonReadOptions = {},
): Promise<NumberedForecastRaidSeason | null> {
  return findPackageNumberedForecastRaidSeason(await seasonsOf(env, options), raidType, seasonIndex);
}

async function toForecastDetail(
  env: Env,
  forecast: NumberedForecastRaidSeason,
  forceRefresh: boolean,
): Promise<RaidSchedule | null> {
  const detail = await getRaidSchedule(env, forecast.jpSchedule.uid, forceRefresh);
  return detail ? toForecastRaidSchedule(detail, forecast.row, forecast.seasonIndex) : null;
}

function parseSeasonIndex(seasonIndex: number | string): number | null {
  const parsed = typeof seasonIndex === "number" ? seasonIndex : Number.parseInt(String(seasonIndex), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The season of `/raids/:raidType/:seasonIndex`: BAQL's `gl` season with that number, otherwise the forecast season of
 * a raid row that has not ended and owns that raid type and number.
 */
export async function getKoreanRaidScheduleByTypeAndSeason(
  env: Env,
  raidType: string,
  seasonIndex: number | string,
  options: RaidSeasonReadOptions = {},
): Promise<RaidSchedule | null> {
  const { forceRefresh = false } = options;
  const parsedSeasonIndex = parseSeasonIndex(seasonIndex);
  if (parsedSeasonIndex === null) return null;

  const glSchedules = options.seasons?.glSchedules ?? (await getAllRaidSchedules(env, forceRefresh));
  // BAQL's `gl` list alone decides a `gl` season, so the raid rows and the JP list are read only when it has none.
  const glMatch = findKoreanRaidSeason(toKoreanRaidSeasons(glSchedules, [], []), raidType, parsedSeasonIndex);
  if (glMatch?.kind === "gl") return getRaidSchedule(env, glMatch.schedule.uid, forceRefresh);

  // The `gl` list was read just above; read only the rest of the seasons.
  const seasons =
    options.seasons ??
    toKoreanRaidSeasons(
      glSchedules,
      ...(await Promise.all([
        getAllRaidSchedules(env, forceRefresh, { region: "jp" }),
        getFutureRaidRows(env, { ctx: options.ctx }),
      ])),
    );
  const match = findKoreanRaidSeason(seasons, raidType, parsedSeasonIndex);
  return match?.kind === "forecast" ? toForecastDetail(env, match.forecast, forceRefresh) : null;
}

/**
 * The season a raid uid from a season list names, such as the compare route's `?from=`. A forecast season is named by
 * its JP schedule's uid. For a JP schedule's uid this follows the rule: the `gl` schedule of that JP season, otherwise
 * the numbered forecast season shown from it, otherwise the JP schedule itself.
 */
export async function getKoreanRaidScheduleByUid(
  env: Env,
  uid: string,
  options: RaidSeasonReadOptions = {},
): Promise<RaidSchedule | null> {
  const { forceRefresh = false } = options;
  const schedule = await getRaidSchedule(env, uid, forceRefresh);
  if (schedule?.region !== "jp") return schedule;

  const match = findKoreanRaidSeasonOfJpSchedule(await seasonsOf(env, options), schedule);
  if (match?.kind === "gl") return getRaidSchedule(env, match.schedule.uid, forceRefresh);
  if (match?.kind === "forecast") {
    return toForecastRaidSchedule(schedule, match.forecast.row, match.forecast.seasonIndex);
  }
  return schedule;
}

/**
 * The Korean-server season page each raid row among `contents` links to, by row uid. A row resolved to a forecast
 * season links only while that season owns its number; a row without a JP season keeps the lookup by its `content_uid`.
 */
export async function getRaidRowSeasonPages(
  env: Env,
  contents: readonly TimelineContent[],
  { forceRefresh = false, ctx }: Omit<RaidSeasonReadOptions, "seasons"> = {},
): Promise<Map<string, { raidType: string; seasonIndex: number }>> {
  const pages = new Map<string, { raidType: string; seasonIndex: number }>();
  const raidContents = contents.filter((content) => content.contentType === "raid");
  if (raidContents.length === 0) return pages;

  const [rows, [glSchedules, jpSchedules]] = await Promise.all([
    getAllRaidRows(env, { ctx }),
    loadRaidScheduleLists(env, forceRefresh),
  ]);
  const now = new Date();
  const seasons = toKoreanRaidSeasons(
    glSchedules,
    jpSchedules,
    rows.filter((row) => hasRaidRowNotEnded(row, now)),
  );
  const rowsByUid = new Map<string, RaidRowLike>(rows.map((row) => [row.uid, row]));

  for (const content of raidContents) {
    // The raid columns are the raid row's; a row without a JP season keeps the lookup by the listed `content_uid`.
    const row = { ...(rowsByUid.get(content.uid) ?? content), contentUid: content.contentUid };
    const page = findRaidRowSeasonPage(seasons, row);
    if (page) pages.set(content.uid, page);
  }
  return pages;
}

/**
 * Warms BAQL's raid schedules as `warmRaidCache` does, and the JP schedule details that forecast seasons show.
 * Returns BAQL's `gl` schedules.
 */
export async function warmKoreanRaidCache(env: Env, forceRefresh = true, ctx?: ExecutionContext) {
  const schedules = await warmRaidCache(env, forceRefresh);
  // The lists were refreshed just above.
  const { forecasts } = await loadKoreanRaidSeasons(env, { ctx });
  await Promise.all(forecasts.map((forecast) => getRaidSchedule(env, forecast.jpSchedule.uid, forceRefresh)));
  return schedules;
}
