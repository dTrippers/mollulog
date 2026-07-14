import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { pgTimelineContentsTable } from "~/db/postgres/schema";
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

export async function getPostgresFutureRaidContents(
  env: Pick<Env, "HYPERDRIVE">,
  contentTypes: TimelineContentType[],
  now: UtcIsoString,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  if (contentTypes.length === 0) return [];
  return mapRows(
    await selectRows(
      env,
      "get_future_by_content_types",
      (db) =>
        db
          .select()
          .from(pgTimelineContentsTable)
          .where(
            and(
              inArray(pgTimelineContentsTable.contentType, contentTypes),
              or(isNull(pgTimelineContentsTable.endAt), gte(pgTimelineContentsTable.endAt, new Date(now))),
            ),
          )
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid)),
      options,
    ),
  );
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
