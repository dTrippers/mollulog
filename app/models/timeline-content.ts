import { and, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { type UtcIsoString, normalizeInstant, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { fetchCached } from "./base";
import {
  type TimelineContentNameI18n,
  parseTimelineContentNames,
  selectTimelineContentName,
} from "./timeline-content-name-i18n";

const ALL_TIMELINE_CONTENTS_META_CACHE_KEY = "timeline-contents-meta::v1";
const ALL_TIMELINE_CONTENTS_META_TTL = 60 * 30; // 30 minutes

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
  nameI18n: text("name_i18n").notNull().default("{}"),
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
  nameI18n: TimelineContentNameI18n;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
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
  syncedAt: UtcIsoString | null;
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
  const nameI18n = parseTimelineContentNames(row.nameI18n);

  return {
    uid: row.uid,
    nameI18n,
    startAt: normalizeInstant(row.startAt),
    endAt: row.endAt ? normalizeInstant(row.endAt) : null,
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
    syncedAt: row.syncedAt ? normalizeInstant(row.syncedAt) : null,
  };
}

function toTimelineContent(raw: RawTimelineContent): TimelineContent {
  const name = selectTimelineContentName(raw.nameI18n);
  if (!name) {
    throw new Error(
      `timeline content name is missing: uid=${raw.uid}, contentType=${raw.contentType}, contentUid=${raw.contentUid ?? "null"}`,
    );
  }

  return { ...raw, name };
}

export async function getTimelineContent(env: Env, uid: string): Promise<TimelineContent | null> {
  const db = drizzle(env.DB);
  const row = await db.select().from(timelineContentsTable).where(eq(timelineContentsTable.uid, uid)).get();
  return row ? toTimelineContent(toRaw(row)) : null;
}

export async function getTimelineContents(env: Env): Promise<TimelineContent[]> {
  const db = drizzle(env.DB);
  const now = nowUtcIso();
  const rows = await db
    .select()
    .from(timelineContentsTable)
    .where(or(isNull(timelineContentsTable.endAt), gte(timelineContentsTable.endAt, now)))
    .orderBy(timelineContentsTable.startAt)
    .all();
  return rows.map(toRaw).map(toTimelineContent);
}

export async function getUpcomingEvent(env: Env): Promise<TimelineContent | null> {
  const db = drizzle(env.DB);
  const now = nowUtcIso();
  const row = await db
    .select()
    .from(timelineContentsTable)
    .where(
      and(
        eq(timelineContentsTable.contentType, "event"),
        sql`${timelineContentsTable.runType} != 'permanent'`,
        gte(timelineContentsTable.endAt, now),
      ),
    )
    .orderBy(timelineContentsTable.startAt)
    .limit(1)
    .get();
  return row ? toTimelineContent(toRaw(row)) : null;
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
  return rows.map(toRaw).map(toTimelineContent);
}

export async function getFutureRaidContents(env: Env, contentTypes: TimelineContentType[]): Promise<TimelineContent[]> {
  if (contentTypes.length === 0) return [];
  const db = drizzle(env.DB);
  const now = nowUtcIso();
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
  return rows.map(toRaw).map(toTimelineContent);
}

export async function getTimelineContentsByContentTypes(
  env: Env,
  contentTypes: TimelineContentType[],
  endAfter?: Date | UtcIsoString,
): Promise<TimelineContent[]> {
  const db = drizzle(env.DB);
  const conditions = [inArray(timelineContentsTable.contentType, contentTypes)];
  if (endAfter) {
    conditions.push(gte(timelineContentsTable.endAt, toUtcIso(endAfter)));
  }
  const rows = await db
    .select()
    .from(timelineContentsTable)
    .where(and(...conditions))
    .orderBy(timelineContentsTable.startAt)
    .all();
  return rows.map(toRaw).map(toTimelineContent);
}

export async function getTimelineContentDatesByContentUid(
  env: Env,
  contentUid: string,
): Promise<{ startAt: UtcIsoString; endAt: UtcIsoString | null } | null> {
  return (await getTimelineContentDatesByContentUids(env, [contentUid])).get(contentUid) ?? null;
}

export async function getTimelineContentDatesByContentUids(
  env: Env,
  contentUids: string[],
): Promise<Map<string, { startAt: UtcIsoString; endAt: UtcIsoString | null }>> {
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
  const datesByContentUid = new Map<string, { startAt: UtcIsoString; endAt: UtcIsoString | null }>();
  for (const row of rows) {
    if (!row.contentUid) continue;

    const startAt = normalizeInstant(row.startAt);
    const endAt = row.endAt ? normalizeInstant(row.endAt) : null;
    const existing = datesByContentUid.get(row.contentUid);
    if (!existing) {
      datesByContentUid.set(row.contentUid, { startAt, endAt });
      continue;
    }

    datesByContentUid.set(row.contentUid, {
      startAt: startAt < existing.startAt ? startAt : existing.startAt,
      endAt: existing.endAt === null || endAt === null ? null : endAt > existing.endAt ? endAt : existing.endAt,
    });
  }
  return datesByContentUid;
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
  return rows.map(toRaw).map(toTimelineContent);
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
  return rows.map(toRaw).map(toTimelineContent);
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

async function fetchAllTimelineContentsMetaFromDb(env: Env): Promise<TimelineContent[]> {
  const db = drizzle(env.DB);
  const rows = await db.select().from(timelineContentsTable).orderBy(timelineContentsTable.startAt).all();
  return rows.map(toRaw).map(toTimelineContent);
}

export async function syncAllTimelineContentsMeta(env: Env): Promise<TimelineContent[]> {
  return fetchCached(
    env,
    ALL_TIMELINE_CONTENTS_META_CACHE_KEY,
    () => fetchAllTimelineContentsMetaFromDb(env),
    ALL_TIMELINE_CONTENTS_META_TTL,
    true,
  );
}

export async function getAllTimelineContentsMeta(env: Env): Promise<TimelineContent[]> {
  return fetchCached(
    env,
    ALL_TIMELINE_CONTENTS_META_CACHE_KEY,
    () => fetchAllTimelineContentsMetaFromDb(env),
    ALL_TIMELINE_CONTENTS_META_TTL,
  );
}

/**
 * Upserts a timeline content row keyed on (contentType, contentUid, runType).
 * - If a row with the same (contentType, contentUid, runType) exists → UPDATE.
 * - Otherwise → INSERT a new row.
 */
export async function upsertTimelineContent(
  env: Env,
  input: Omit<TimelineContent, "name" | "nameI18n"> & { nameI18n?: TimelineContentNameI18n },
): Promise<void> {
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
    nameI18n: JSON.stringify(input.nameI18n ?? {}),
    startAt: toUtcIso(input.startAt),
    endAt: input.endAt ? toUtcIso(input.endAt) : null,
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
      .set({ ...values, updatedAt: nowUtcIso() })
      .where(eq(timelineContentsTable.id, existing.id));
  } else {
    await db.insert(timelineContentsTable).values({ ...values, uid: input.uid });
  }
}
