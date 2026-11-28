import type { RaidRowSeason } from "@dtrippers/mollulog-sdk";
import { and, asc, type Column, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { pgTimelineContentsTable } from "~/db/postgres/schema";
import type {
  TimelineAutoSyncExistingRow,
  TimelineAutoSyncPlan,
  TimelineAutoSyncSchedule,
  TimelineAutoSyncUpdateMatch,
} from "~/domain/timeline-auto-sync";
import {
  type RunType,
  type TimelineContent,
  type TimelineContentType,
  toTimelineContent,
} from "~/domain/timeline-content";
import { normalizeTimelineContentNames } from "~/domain/timeline-content-name-i18n";
import { normalizeInstant, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type PostgresTimelineContentRow = typeof pgTimelineContentsTable.$inferSelect;

export type PostgresTimelineContentsOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

type TimelineDates = { startAt: UtcIsoString; endAt: UtcIsoString | null };

/** A raid row with its raid columns, which the general row shape leaves out. */
export type TimelineRaidRow = TimelineContent & { raidSeason: RaidRowSeason };

function normalizePostgresInstant(value: string | Date): UtcIsoString {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function toDomain(row: PostgresTimelineContentRow): TimelineContent {
  return toTimelineContent({
    uid: row.uid,
    nameI18n: normalizeTimelineContentNames(row.nameI18n),
    startAt: normalizePostgresInstant(row.startAt),
    endAt: row.endAt ? normalizePostgresInstant(row.endAt) : null,
    endless: row.endless,
    imageUrl: row.imageUrl,
    imageBlurhash: row.imageBlurhash,
    videos: row.videos,
    contentType: row.contentType as TimelineContentType,
    runType: row.runType as RunType,
    occurrence: row.occurrence,
    contentUid: row.contentUid,
    shopContentUid: row.shopContentUid,
    recruitmentGroupUid: row.recruitmentGroupUid,
    recruitmentStudentUids: row.recruitmentStudentUids,
    confirmed: row.confirmed,
    isSpoiler: row.isSpoiler,
    tags: row.tags,
    earnablePyroxene: row.earnablePyroxene,
    featuredUntil: row.featuredUntil ? normalizePostgresInstant(row.featuredUntil) : null,
    syncedAt: row.syncedAt ? normalizePostgresInstant(row.syncedAt) : null,
  });
}

async function selectRows<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  select: (db: NodePgDatabase) => Promise<T[]>,
  options: PostgresTimelineContentsOptions = {},
): Promise<T[]> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("db.collection.name", "timeline_contents");
        span?.setAttribute("timeline.query_name", queryName);
        const rows = await select(drizzle(client));
        span?.setAttribute("db.response.returned_rows", rows.length);
        return rows;
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.timeline_contents.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

function mapRows(rows: PostgresTimelineContentRow[]): TimelineContent[] {
  return rows.map(toDomain);
}

export async function getPostgresTimelineContent(
  env: Pick<Env, "HYPERDRIVE">,
  uid: string,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent | null> {
  const rows = await selectRows(
    env,
    "get_by_uid",
    (db) => db.select().from(pgTimelineContentsTable).where(eq(pgTimelineContentsTable.uid, uid)).limit(1),
    options,
  );
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function getPostgresTimelineContents(
  env: Pick<Env, "HYPERDRIVE">,
  now: UtcIsoString,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  return mapRows(
    await selectRows(
      env,
      "get_future_timeline_contents",
      (db) =>
        db
          .select()
          .from(pgTimelineContentsTable)
          .where(or(isNull(pgTimelineContentsTable.endAt), gte(pgTimelineContentsTable.endAt, new Date(now))))
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid)),
      options,
    ),
  );
}

export async function getPostgresUpcomingEvent(
  env: Pick<Env, "HYPERDRIVE">,
  now: UtcIsoString,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent | null> {
  const rows = await selectRows(
    env,
    "get_upcoming_event",
    (db) =>
      db
        .select()
        .from(pgTimelineContentsTable)
        .where(
          and(
            eq(pgTimelineContentsTable.contentType, "event"),
            ne(pgTimelineContentsTable.runType, "permanent"),
            gte(pgTimelineContentsTable.endAt, new Date(now)),
          ),
        )
        .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid))
        .limit(1),
    options,
  );
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function getPostgresTimelineContentsByUids(
  env: Pick<Env, "HYPERDRIVE">,
  uids: string[],
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  const uniqueUids = [...new Set(uids)];
  if (uniqueUids.length === 0) return [];
  return mapRows(
    await selectRows(
      env,
      "get_by_uids",
      (db) =>
        db
          .select()
          .from(pgTimelineContentsTable)
          .where(inArray(pgTimelineContentsTable.uid, uniqueUids))
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid)),
      options,
    ),
  );
}

/** Raid rows with their raid columns. With `endAfter`, only rows that have not ended by then, as the futures read. */
export async function getPostgresRaidRows(
  env: Pick<Env, "HYPERDRIVE">,
  endAfter: UtcIsoString | null,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineRaidRow[]> {
  const table = pgTimelineContentsTable;
  const isRaid = eq(table.contentType, "raid");
  const rows = await selectRows(
    env,
    endAfter === null ? "get_raid_rows" : "get_future_raid_rows",
    (db) =>
      db
        .select()
        .from(table)
        .where(
          endAfter === null ? isRaid : and(isRaid, or(isNull(table.endAt), gte(table.endAt, new Date(endAfter)))),
        )
        .orderBy(asc(table.startAt), asc(table.uid)),
    options,
  );
  return rows.map((row) => ({
    ...toDomain(row),
    raidSeason: {
      raidType: row.raidType,
      jpRaidSeasonIndex: row.jpRaidSeasonIndex,
      glRaidSeasonIndex: row.glRaidSeasonIndex,
    },
  }));
}

export async function getPostgresHomeMainStoryContent(
  env: Pick<Env, "HYPERDRIVE">,
  now: Date | UtcIsoString,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent | null> {
  const [row] = await selectRows(
    env,
    "get_latest_published_home_main_story",
    (db) =>
      db
        .select()
        .from(pgTimelineContentsTable)
        .where(
          and(
            eq(pgTimelineContentsTable.contentType, "main_story"),
            lte(pgTimelineContentsTable.startAt, new Date(toUtcIso(now))),
          ),
        )
        .orderBy(desc(pgTimelineContentsTable.startAt), desc(pgTimelineContentsTable.uid))
        .limit(1),
    options,
  );
  return row ? toDomain(row) : null;
}

export async function getPostgresTimelineContentsByContentTypes(
  env: Pick<Env, "HYPERDRIVE">,
  contentTypes: TimelineContentType[],
  endAfter?: Date | UtcIsoString,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  if (contentTypes.length === 0) return [];
  const conditions = [inArray(pgTimelineContentsTable.contentType, contentTypes)];
  if (endAfter) conditions.push(gte(pgTimelineContentsTable.endAt, new Date(toUtcIso(endAfter))));
  return mapRows(
    await selectRows(
      env,
      "get_by_content_types",
      (db) =>
        db
          .select()
          .from(pgTimelineContentsTable)
          .where(and(...conditions))
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid)),
      options,
    ),
  );
}

export async function getPostgresTimelineContentDatesByContentUids(
  env: Pick<Env, "HYPERDRIVE">,
  contentUids: string[],
  options: PostgresTimelineContentsOptions = {},
): Promise<Map<string, TimelineDates>> {
  const uniqueContentUids = [...new Set(contentUids)];
  if (uniqueContentUids.length === 0) return new Map();
  const rows = await selectRows(
    env,
    "get_dates_by_content_uids",
    (db) =>
      db
        .select({
          contentUid: pgTimelineContentsTable.contentUid,
          startAt: pgTimelineContentsTable.startAt,
          endAt: pgTimelineContentsTable.endAt,
        })
        .from(pgTimelineContentsTable)
        .where(inArray(pgTimelineContentsTable.contentUid, uniqueContentUids))
        .orderBy(asc(pgTimelineContentsTable.contentUid), asc(pgTimelineContentsTable.startAt)),
    options,
  );
  const datesByContentUid = new Map<string, TimelineDates>();
  for (const row of rows) {
    if (!row.contentUid) continue;
    const startAt = normalizePostgresInstant(row.startAt);
    const endAt = row.endAt ? normalizePostgresInstant(row.endAt) : null;
    const existing = datesByContentUid.get(row.contentUid);
    datesByContentUid.set(row.contentUid, {
      startAt: !existing || startAt < existing.startAt ? startAt : existing.startAt,
      endAt: !existing
        ? endAt
        : existing.endAt === null || endAt === null
          ? null
          : endAt > existing.endAt
            ? endAt
            : existing.endAt,
    });
  }
  return datesByContentUid;
}

export async function getPostgresTimelineContentsByContentUids(
  env: Pick<Env, "HYPERDRIVE">,
  contentUids: string[],
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  const uniqueContentUids = [...new Set(contentUids)];
  if (uniqueContentUids.length === 0) return [];
  return mapRows(
    await selectRows(
      env,
      "get_by_content_uids",
      (db) =>
        db
          .select()
          .from(pgTimelineContentsTable)
          .where(inArray(pgTimelineContentsTable.contentUid, uniqueContentUids))
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid)),
      options,
    ),
  );
}

export async function getPostgresTimelineContentsByRecruitmentGroupUids(
  env: Pick<Env, "HYPERDRIVE">,
  recruitmentGroupUids: string[],
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  const uniqueUids = [...new Set(recruitmentGroupUids)];
  if (uniqueUids.length === 0) return [];
  return mapRows(
    await selectRows(
      env,
      "get_by_recruitment_group_uids",
      (db) =>
        db
          .select()
          .from(pgTimelineContentsTable)
          .where(inArray(pgTimelineContentsTable.recruitmentGroupUid, uniqueUids))
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid)),
      options,
    ),
  );
}

export async function getPostgresContentUidsByRecruitmentGroup(
  env: Pick<Env, "HYPERDRIVE">,
  options: PostgresTimelineContentsOptions = {},
): Promise<Map<string, { contentType: string; contentUid: string | null }>> {
  const rows = await selectRows(
    env,
    "get_content_uids_by_recruitment_group",
    (db) =>
      db
        .select({
          uid: pgTimelineContentsTable.uid,
          contentType: pgTimelineContentsTable.contentType,
          contentUid: pgTimelineContentsTable.contentUid,
        })
        .from(pgTimelineContentsTable)
        .where(isNotNull(pgTimelineContentsTable.recruitmentGroupUid))
        .orderBy(asc(pgTimelineContentsTable.uid)),
    options,
  );
  return new Map(rows.map((row) => [row.uid, { contentType: row.contentType, contentUid: row.contentUid }]));
}

export async function getPostgresAllTimelineContentsMeta(
  env: Pick<Env, "HYPERDRIVE">,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  return mapRows(
    await selectRows(
      env,
      "get_all_meta",
      (db) =>
        db
          .select()
          .from(pgTimelineContentsTable)
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid)),
      options,
    ),
  );
}

/** Rows the auto sync compares against: every row of the content type, and the rows holding `uids`. */
export async function getPostgresTimelineAutoSyncRows(
  env: Pick<Env, "HYPERDRIVE">,
  contentType: TimelineContentType,
  uids: readonly string[],
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineAutoSyncExistingRow[]> {
  const ofType = eq(pgTimelineContentsTable.contentType, contentType);
  const rows = await selectRows(
    env,
    "get_auto_sync_rows",
    (db) =>
      db
        .select({
          uid: pgTimelineContentsTable.uid,
          contentType: pgTimelineContentsTable.contentType,
          contentUid: pgTimelineContentsTable.contentUid,
          runType: pgTimelineContentsTable.runType,
          occurrence: pgTimelineContentsTable.occurrence,
          startAt: pgTimelineContentsTable.startAt,
          endAt: pgTimelineContentsTable.endAt,
          endless: pgTimelineContentsTable.endless,
          raidType: pgTimelineContentsTable.raidType,
          jpRaidSeasonIndex: pgTimelineContentsTable.jpRaidSeasonIndex,
          glRaidSeasonIndex: pgTimelineContentsTable.glRaidSeasonIndex,
        })
        .from(pgTimelineContentsTable)
        .where(uids.length > 0 ? or(ofType, inArray(pgTimelineContentsTable.uid, [...uids])) : ofType),
    options,
  );
  return rows.map((row) => ({
    ...row,
    startAt: normalizePostgresInstant(row.startAt),
    endAt: row.endAt ? normalizePostgresInstant(row.endAt) : null,
  }));
}

/** The row is updated only while it still has the key the sync found it by. */
function updateMatchCondition(match: TimelineAutoSyncUpdateMatch) {
  const table = pgTimelineContentsTable;
  if (match.kind === "jpRaidSeason") {
    return and(
      eq(table.contentType, match.contentType),
      eq(table.raidType, match.raidType),
      eq(table.jpRaidSeasonIndex, match.seasonIndex),
    );
  }
  return and(
    eq(table.contentType, match.contentType),
    eq(table.contentUid, match.contentUid),
    eq(table.runType, match.runType),
    match.occurrence === null ? isNull(table.occurrence) : eq(table.occurrence, match.occurrence),
  );
}

/**
 * The row is updated only while it still has the schedule the plan was computed from. Compared at millisecond
 * precision, the precision the read keeps.
 */
function readScheduleCondition(schedule: TimelineAutoSyncSchedule) {
  const table = pgTimelineContentsTable;
  const sameInstant = (column: Column, value: UtcIsoString) =>
    sql`date_trunc('milliseconds', ${column}) = ${new Date(value).toISOString()}::timestamptz`;
  return and(
    sameInstant(table.startAt, schedule.startAt),
    schedule.endAt === null ? isNull(table.endAt) : sameInstant(table.endAt, schedule.endAt),
    eq(table.endless, schedule.endless),
  );
}

/**
 * Applies a plan and returns the uids of the rows it actually created and updated, and of the future rows without a
 * JP raid season that kept it from creating raid rows.
 */
export async function applyPostgresTimelineAutoSyncPlan(
  env: Pick<Env, "HYPERDRIVE">,
  plan: Pick<TimelineAutoSyncPlan, "creates" | "updates" | "updateStartedRows" | "matchBy">,
  now: UtcIsoString,
  options: PostgresTimelineContentsOptions = {},
): Promise<{ createdUids: string[]; updatedUids: string[]; creationBlockedByUids: string[] }> {
  if (plan.creates.length === 0 && plan.updates.length === 0) {
    return { createdUids: [], updatedUids: [], creationBlockedByUids: [] };
  }

  const { ctx, createClient = createPostgresClient } = options;
  const syncedAt = new Date(now);
  return withPostgresClient(
    env,
    (client) =>
      drizzle(client).transaction(async (tx) => {
        let creates = plan.creates;
        let creationBlockedByUids: string[] = [];
        if (plan.matchBy === "jpRaidSeason" && creates.length > 0) {
          // An admin may have added a raid row since the read. This narrows the window to the transaction; no lock.
          const contentTypes = [...new Set(creates.map((row) => row.contentType))];
          const futureRows = await tx
            .select({
              uid: pgTimelineContentsTable.uid,
              raidType: pgTimelineContentsTable.raidType,
              jpRaidSeasonIndex: pgTimelineContentsTable.jpRaidSeasonIndex,
            })
            .from(pgTimelineContentsTable)
            .where(
              and(
                inArray(pgTimelineContentsTable.contentType, contentTypes),
                gt(pgTimelineContentsTable.startAt, syncedAt),
              ),
            );
          creationBlockedByUids = futureRows
            .filter((row) => row.raidType === null || row.jpRaidSeasonIndex === null)
            .map((row) => row.uid);
          if (creationBlockedByUids.length > 0) {
            creates = [];
          } else {
            const seasons = new Set(futureRows.map((row) => JSON.stringify([row.raidType, row.jpRaidSeasonIndex])));
            creates = creates.filter((row) => !seasons.has(JSON.stringify([row.raidType, row.jpRaidSeasonIndex])));
          }
        }

        let createdUids: string[] = [];
        if (creates.length > 0) {
          const inserted = await tx
            .insert(pgTimelineContentsTable)
            .values(
              creates.map((row) => ({
                uid: row.uid,
                contentType: row.contentType,
                contentUid: row.contentUid,
                runType: row.runType,
                occurrence: row.occurrence,
                nameI18n: row.nameI18n,
                startAt: new Date(row.startAt),
                endAt: row.endAt ? new Date(row.endAt) : null,
                endless: row.endless,
                confirmed: row.confirmed,
                raidType: row.raidType,
                jpRaidSeasonIndex: row.jpRaidSeasonIndex,
                glRaidSeasonIndex: row.glRaidSeasonIndex,
                syncedAt,
                createdAt: syncedAt,
                updatedAt: syncedAt,
              })),
            )
            // An admin may create the same uid between the read and this write; their row wins.
            .onConflictDoNothing({ target: pgTimelineContentsTable.uid })
            .returning({ uid: pgTimelineContentsTable.uid });
          createdUids = inserted.map((row) => row.uid);
        }

        const updatedUids: string[] = [];
        for (const row of plan.updates) {
          const conditions = [
            eq(pgTimelineContentsTable.uid, row.uid),
            updateMatchCondition(row.match),
            readScheduleCondition(row.readSchedule),
          ];
          // Unless the source updates started rows, a row that started meanwhile is history and stays as it is.
          if (!plan.updateStartedRows) conditions.push(gt(pgTimelineContentsTable.startAt, syncedAt));
          const updated = await tx
            .update(pgTimelineContentsTable)
            .set({
              startAt: new Date(row.startAt),
              endAt: row.endAt ? new Date(row.endAt) : null,
              endless: row.endless,
              ...(row.contentUid !== undefined ? { contentUid: row.contentUid } : {}),
              ...(row.glRaidSeasonIndex !== undefined ? { glRaidSeasonIndex: row.glRaidSeasonIndex } : {}),
              syncedAt,
              updatedAt: syncedAt,
            })
            .where(and(...conditions))
            .returning({ uid: pgTimelineContentsTable.uid });
          updatedUids.push(...updated.map((updatedRow) => updatedRow.uid));
        }
        return { createdUids, updatedUids, creationBlockedByUids };
      }),
    createClient,
    ctx,
  );
}
