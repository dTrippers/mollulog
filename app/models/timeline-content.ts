import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { resolveContentName } from "./content-name";

export type TimelineContentType =
  | "event"
  | "mini_event"
  | "pickup"
  | "main_story"
  | "campaign"
  | "joint_firing_drill"
  | "raid"
  | "total_assault"
  | "elimination"
  | "unlimit"
  | "allied"; // 하위 호환
export type RunType = "first" | "rerun" | "permanent";

export type TimelineContentVideo = {
  title: string;
  youtube: string;
  start: number | null;
};

export const timelineContentsTable = sqliteTable("timeline_contents", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at"),
  endless: int().notNull().default(0),
  imageUrl: text("image_url"),
  videos: text().notNull().default("[]"),
  contentType: text("content_type").notNull(),
  runType: text("run_type").notNull().default("first"),
  occurrence: int(),
  contentUid: text("content_uid"),
  shopContentUid: text("shop_content_uid"),
  recruitmentGroupUid: text("recruitment_group_uid"),
  confirmed: int().notNull().default(0),
  isSpoiler: int("is_spoiler").notNull().default(0),
  tags: text().notNull().default("[]"),
  earnablePyroxene: int("earnable_pyroxene"),
  createdAt: text("created_at").notNull().default(sql`current_timestamp`),
  updatedAt: text("updated_at").notNull().default(sql`current_timestamp`),
  syncedAt: text("synced_at"),
});

export type TimelineContent = {
  uid: string;
  name: string;
  startAt: Date;
  endAt: Date | null;
  endless: boolean;
  imageUrl: string | null;
  videos: TimelineContentVideo[];
  contentType: TimelineContentType;
  runType: RunType;
  occurrence: number | null;
  contentUid: string | null;
  shopContentUid: string | null;
  recruitmentGroupUid: string | null;
  confirmed: boolean;
  isSpoiler: boolean;
  tags: string[];
  earnablePyroxene: number | null;
  syncedAt: Date | null;
};

type RawTimelineContent = Omit<TimelineContent, "name">;
const IN_QUERY_BATCH_SIZE = 90;

function splitIntoBatches<T>(values: T[], batchSize = IN_QUERY_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < values.length; start += batchSize) {
    batches.push(values.slice(start, start + batchSize));
  }
  return batches;
}

function toRaw(row: typeof timelineContentsTable.$inferSelect): RawTimelineContent {
  return {
    uid: row.uid,
    startAt: new Date(row.startAt),
    endAt: row.endAt ? new Date(row.endAt) : null,
    endless: row.endless === 1,
    imageUrl: row.imageUrl ?? null,
    videos: JSON.parse(row.videos) as TimelineContentVideo[],
    contentType: row.contentType as TimelineContentType,
    runType: row.runType as RunType,
    occurrence: row.occurrence ?? null,
    contentUid: row.contentUid ?? null,
    shopContentUid: row.shopContentUid ?? null,
    recruitmentGroupUid: row.recruitmentGroupUid ?? null,
    confirmed: row.confirmed === 1,
    isSpoiler: row.isSpoiler === 1,
    tags: JSON.parse(row.tags) as string[],
    earnablePyroxene: row.earnablePyroxene ?? null,
    syncedAt: row.syncedAt ? new Date(row.syncedAt) : null,
  };
}

async function enrich(env: Env, raw: RawTimelineContent): Promise<TimelineContent> {
  const name = await resolveContentName(env, raw);
  return { ...raw, name };
}

async function enrichAll(env: Env, raws: RawTimelineContent[]): Promise<TimelineContent[]> {
  return Promise.all(raws.map((raw) => enrich(env, raw)));
}

export async function getTimelineContent(env: Env, uid: string): Promise<TimelineContent | null> {
  const db = drizzle(env.DB);
  const row = await db.select().from(timelineContentsTable).where(eq(timelineContentsTable.uid, uid)).get();
  return row ? enrich(env, toRaw(row)) : null;
}

export async function getTimelineContents(env: Env): Promise<TimelineContent[]> {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(timelineContentsTable)
    .where(
      and(
        or(isNull(timelineContentsTable.endAt), gte(timelineContentsTable.endAt, now)),
        or(lte(timelineContentsTable.startAt, now), isNotNull(timelineContentsTable.syncedAt)),
      ),
    )
    .orderBy(timelineContentsTable.startAt)
    .all();
  return enrichAll(env, rows.map(toRaw));
}

export async function getUpcomingEvent(env: Env): Promise<TimelineContent | null> {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const row = await db
    .select()
    .from(timelineContentsTable)
    .where(
      and(
        eq(timelineContentsTable.contentType, "event"),
        sql`${timelineContentsTable.runType} != 'permanent'`,
        gte(timelineContentsTable.endAt, now),
        or(lte(timelineContentsTable.startAt, now), isNotNull(timelineContentsTable.syncedAt)),
      ),
    )
    .orderBy(timelineContentsTable.startAt)
    .limit(1)
    .get();
  return row ? enrich(env, toRaw(row)) : null;
}

export async function getTimelineContentsByUids(env: Env, uids: string[]): Promise<TimelineContent[]> {
  if (uids.length === 0) return [];
  const db = drizzle(env.DB);
  const rows = (
    await Promise.all(
      splitIntoBatches([...new Set(uids)]).map((batch) =>
        db.select().from(timelineContentsTable).where(inArray(timelineContentsTable.uid, batch)).all(),
      ),
    )
  ).flat();
  return enrichAll(env, rows.map(toRaw));
}

export async function getFutureRaidContents(env: Env, contentTypes: TimelineContentType[]): Promise<TimelineContent[]> {
  if (contentTypes.length === 0) return [];
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(timelineContentsTable)
    .where(
      and(
        inArray(timelineContentsTable.contentType, contentTypes),
        or(isNull(timelineContentsTable.endAt), gte(timelineContentsTable.endAt, now)),
      ),
    )
    .orderBy(timelineContentsTable.startAt)
    .all();
  return enrichAll(env, rows.map(toRaw));
}

export async function getTimelineContentsByContentTypes(
  env: Env,
  contentTypes: TimelineContentType[],
  endAfter?: Date,
): Promise<TimelineContent[]> {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const conditions = [
    inArray(timelineContentsTable.contentType, contentTypes),
    or(lte(timelineContentsTable.startAt, now), isNotNull(timelineContentsTable.syncedAt)),
  ];
  if (endAfter) {
    conditions.push(gte(timelineContentsTable.endAt, endAfter.toISOString()));
  }
  const rows = await db
    .select()
    .from(timelineContentsTable)
    .where(and(...conditions))
    .orderBy(timelineContentsTable.startAt)
    .all();
  return enrichAll(env, rows.map(toRaw));
}

export async function getTimelineContentDatesByContentUid(
  env: Env,
  contentUid: string,
): Promise<{ startAt: Date; endAt: Date | null } | null> {
  const db = drizzle(env.DB);
  const row = await db
    .select({ startAt: timelineContentsTable.startAt, endAt: timelineContentsTable.endAt })
    .from(timelineContentsTable)
    .where(eq(timelineContentsTable.contentUid, contentUid))
    .get();
  if (!row) return null;
  return { startAt: new Date(row.startAt), endAt: row.endAt ? new Date(row.endAt) : null };
}

export async function getTimelineContentDatesByContentUids(
  env: Env,
  contentUids: string[],
): Promise<Map<string, { startAt: Date; endAt: Date | null }>> {
  if (contentUids.length === 0) return new Map();
  const db = drizzle(env.DB);
  const rows = (
    await Promise.all(
      splitIntoBatches([...new Set(contentUids)]).map((batch) =>
        db
          .select({
            contentUid: timelineContentsTable.contentUid,
            startAt: timelineContentsTable.startAt,
            endAt: timelineContentsTable.endAt,
          })
          .from(timelineContentsTable)
          .where(inArray(timelineContentsTable.contentUid, batch))
          .all(),
      ),
    )
  ).flat();
  return new Map(
    rows
      .filter((r) => r.contentUid)
      .map((r) => [
        r.contentUid as string,
        { startAt: new Date(r.startAt), endAt: r.endAt ? new Date(r.endAt) : null },
      ]),
  );
}

export async function getTimelineContentsByContentUids(env: Env, contentUids: string[]): Promise<TimelineContent[]> {
  if (contentUids.length === 0) return [];
  const db = drizzle(env.DB);
  const rows = (
    await Promise.all(
      splitIntoBatches([...new Set(contentUids)]).map((batch) =>
        db.select().from(timelineContentsTable).where(inArray(timelineContentsTable.contentUid, batch)).all(),
      ),
    )
  ).flat();
  return enrichAll(env, rows.map(toRaw));
}

export async function getTimelineContentsByRecruitmentGroupUids(
  env: Env,
  recruitmentGroupUids: string[],
): Promise<TimelineContent[]> {
  if (recruitmentGroupUids.length === 0) return [];
  const db = drizzle(env.DB);
  const rows = (
    await Promise.all(
      splitIntoBatches([...new Set(recruitmentGroupUids)]).map((batch) =>
        db.select().from(timelineContentsTable).where(inArray(timelineContentsTable.recruitmentGroupUid, batch)).all(),
      ),
    )
  ).flat();
  return enrichAll(env, rows.map(toRaw));
}

export async function getContentUidsByRecruitmentGroup(
  env: Env,
): Promise<Map<string, { contentType: string; contentUid: string | null }>> {
  const db = drizzle(env.DB);
  const rows = await db
    .select({
      uid: timelineContentsTable.uid,
      contentType: timelineContentsTable.contentType,
      contentUid: timelineContentsTable.contentUid,
    })
    .from(timelineContentsTable)
    .where(isNotNull(timelineContentsTable.recruitmentGroupUid))
    .all();
  return new Map(rows.map((row) => [row.uid, { contentType: row.contentType, contentUid: row.contentUid ?? null }]));
}

export async function getAllTimelineContentsMeta(env: Env): Promise<TimelineContent[]> {
  const db = drizzle(env.DB);
  const rows = await db.select().from(timelineContentsTable).orderBy(timelineContentsTable.startAt).all();
  return enrichAll(env, rows.map(toRaw));
}

export async function getUnsyncedUnstartedContents(env: Env): Promise<RawTimelineContent[]> {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(timelineContentsTable)
    .where(and(isNull(timelineContentsTable.syncedAt), gte(timelineContentsTable.startAt, now)))
    .all();
  return rows.map(toRaw);
}

export async function markSyncedAt(env: Env, uid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .update(timelineContentsTable)
    .set({ syncedAt: sql`current_timestamp`, updatedAt: sql`current_timestamp` })
    .where(eq(timelineContentsTable.uid, uid));
}

/**
 * Upserts a timeline content row keyed on (contentType, contentUid, runType).
 * - If a row with the same (contentType, contentUid, runType) exists → UPDATE.
 * - Otherwise → INSERT a new row.
 */
export async function upsertTimelineContent(env: Env, input: Omit<TimelineContent, "name">): Promise<void> {
  const db = drizzle(env.DB);
  const existing = await db
    .select({ id: timelineContentsTable.id })
    .from(timelineContentsTable)
    .where(
      or(
        eq(timelineContentsTable.uid, input.uid),
        and(
          eq(timelineContentsTable.contentType, input.contentType),
          eq(timelineContentsTable.contentUid, input.contentUid ?? ""),
          eq(timelineContentsTable.runType, input.runType),
          input.occurrence != null
            ? eq(timelineContentsTable.occurrence, input.occurrence)
            : isNull(timelineContentsTable.occurrence),
        ),
      ),
    )
    .get();

  const values = {
    startAt: input.startAt.toISOString(),
    endAt: input.endAt?.toISOString() ?? null,
    endless: input.endless ? 1 : 0,
    imageUrl: input.imageUrl,
    videos: JSON.stringify(input.videos),
    contentType: input.contentType,
    runType: input.runType,
    occurrence: input.occurrence,
    contentUid: input.contentUid,
    shopContentUid: input.shopContentUid,
    recruitmentGroupUid: input.recruitmentGroupUid,
    confirmed: input.confirmed ? 1 : 0,
    tags: JSON.stringify(input.tags),
  };

  if (existing) {
    await db
      .update(timelineContentsTable)
      .set({ ...values, updatedAt: sql`current_timestamp` })
      .where(eq(timelineContentsTable.id, existing.id));
  } else {
    await db.insert(timelineContentsTable).values({ ...values, uid: input.uid });
  }
}
