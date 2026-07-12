import { asc, gte, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTimelineContentsTable } from "~/db/postgres/schema";
import {
  type RunType,
  type TimelineContent,
  type TimelineContentType,
  toTimelineContent,
} from "~/domain/timeline-content";
import { normalizeTimelineContentNames } from "~/domain/timeline-content-name-i18n";
import { normalizeInstant, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

type PostgresTimelineContentRow = typeof pgTimelineContentsTable.$inferSelect;

type PostgresTimelineContentsOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

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

export async function getPostgresTimelineContents(
  env: Pick<Env, "HYPERDRIVE">,
  now: UtcIsoString,
  options: PostgresTimelineContentsOptions = {},
): Promise<TimelineContent[]> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const select = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("db.collection.name", "timeline_contents");
        const rows = await drizzle(client)
          .select()
          .from(pgTimelineContentsTable)
          .where(or(isNull(pgTimelineContentsTable.endAt), gte(pgTimelineContentsTable.endAt, new Date(now))))
          .orderBy(asc(pgTimelineContentsTable.startAt), asc(pgTimelineContentsTable.uid));
        span?.setAttribute("db.response.returned_rows", rows.length);
        return rows;
      };
      const rows = ctx ? await ctx.tracing.enterSpan("postgres.timeline_contents.select", select) : await select();
      return rows.map(toDomain);
    },
    createClient,
    ctx,
  );
}
