import dayjs from "dayjs";
import { and, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import {
  defaultPyroxenePlannerOptions,
  normalizePyroxenePlannerOptions,
  type PyroxenePlannerOptions,
  type StoredPyroxenePlannerOptions,
  type TimelineSourceType,
} from "~/domain/pyroxene-planner";
import {
  extractPyroxeneTimelineBaseUid,
  normalizePyroxeneTimelineEventAt,
  PYROXENE_AP_PACKAGE_CONFIG,
  PYROXENE_ATTENDANCE_CONFIG,
  PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
  PYROXENE_MONTHLY_PACKAGE_CONFIG,
  PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
  PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
  type PyroxeneMonthlyPackageType,
} from "~/domain/pyroxene-sources";
import { nowUtcIso } from "~/lib/date-time";

/**
 * Pyroxene Owned Resources
 */
export const pyroxeneOwnedResourcesTable = sqliteTable("pyroxene_owned_resources", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  inputAt: text().notNull(),
  pyroxene: int().notNull(),
  oneTimeTicket: int().notNull(),
  tenTimeTicket: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type PyroxeneOwnedResource = {
  uid: string;
  userId: number;
  inputAt: string;
  pyroxene: number;
  oneTimeTicket: number;
  tenTimeTicket: number;
};

function toOwnedResourceModel(resource: typeof pyroxeneOwnedResourcesTable.$inferSelect): PyroxeneOwnedResource {
  return {
    uid: resource.uid,
    userId: resource.userId,
    inputAt: resource.inputAt,
    pyroxene: resource.pyroxene,
    oneTimeTicket: resource.oneTimeTicket,
    tenTimeTicket: resource.tenTimeTicket,
  };
}

export async function getLatestPyroxeneOwnedResource(env: Env, userId: number): Promise<PyroxeneOwnedResource | null> {
  const db = drizzle(env.DB);
  const [resource] = await db
    .select()
    .from(pyroxeneOwnedResourcesTable)
    .where(eq(pyroxeneOwnedResourcesTable.userId, userId))
    .orderBy(sql`inputAt DESC`)
    .limit(1);

  return resource ? toOwnedResourceModel(resource) : null;
}

export async function createPyroxeneOwnedResource(
  env: Env,
  userId: number,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
  options: { uid?: string; inputAt?: string } = {},
): Promise<void> {
  const db = drizzle(env.DB);
  const uid = options.uid ?? nanoid(8);
  const inputAt = options.inputAt ?? new Date().toISOString();
  const { pyroxene, oneTimeTicket, tenTimeTicket } = resources;
  await db.insert(pyroxeneOwnedResourcesTable).values({ uid, userId, inputAt, pyroxene, oneTimeTicket, tenTimeTicket });
}

export async function deletePyroxeneOwnedResourceByUid(env: Env, userId: number, uid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .delete(pyroxeneOwnedResourcesTable)
    .where(and(eq(pyroxeneOwnedResourcesTable.userId, userId), eq(pyroxeneOwnedResourcesTable.uid, uid)));
}

/**
 * Pyroxene Collected Sources
 */
export const pyroxeneCollectedSourcesTable = sqliteTable(
  "pyroxene_collected_sources",
  {
    id: int().primaryKey({ autoIncrement: true }),
    uid: text().notNull(),
    userId: int().notNull(),
    sourceKey: text().notNull(),
    collectedAt: text().notNull(),
    createdAt: text().notNull().default(sql`current_timestamp`),
  },
  (table) => [
    uniqueIndex("pyroxene_collected_sources_uid").on(table.uid),
    uniqueIndex("pyroxene_collected_sources_userId_sourceKey").on(table.userId, table.sourceKey),
  ],
);

export async function getCollectedSourceKeys(env: Env, userId: number): Promise<Set<string>> {
  const db = drizzle(env.DB);
  const rows = await db
    .select({ sourceKey: pyroxeneCollectedSourcesTable.sourceKey })
    .from(pyroxeneCollectedSourcesTable)
    .where(eq(pyroxeneCollectedSourcesTable.userId, userId));

  return new Set(rows.map((row) => row.sourceKey));
}

export async function upsertCollectedSource(env: Env, userId: number, sourceKey: string): Promise<void> {
  const db = drizzle(env.DB);
  const collectedAt = nowUtcIso();
  await db
    .insert(pyroxeneCollectedSourcesTable)
    .values({ uid: nanoid(8), userId, sourceKey, collectedAt })
    .onConflictDoUpdate({
      target: [pyroxeneCollectedSourcesTable.userId, pyroxeneCollectedSourcesTable.sourceKey],
      set: { collectedAt },
    });
}

export async function ensureCollectedSource(env: Env, userId: number, sourceKey: string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .insert(pyroxeneCollectedSourcesTable)
    .values({ uid: nanoid(8), userId, sourceKey, collectedAt: nowUtcIso() })
    .onConflictDoNothing({
      target: [pyroxeneCollectedSourcesTable.userId, pyroxeneCollectedSourcesTable.sourceKey],
    });
}

export async function upsertCollectedSources(env: Env, userId: number, sourceKeys: string[]): Promise<void> {
  const uniqueSourceKeys = [...new Set(sourceKeys)].filter((sourceKey) => sourceKey.length > 0);
  if (uniqueSourceKeys.length === 0) {
    return;
  }

  await Promise.all(uniqueSourceKeys.map((sourceKey) => upsertCollectedSource(env, userId, sourceKey)));
}

export async function deleteCollectedSource(env: Env, userId: number, sourceKey: string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .delete(pyroxeneCollectedSourcesTable)
    .where(
      and(eq(pyroxeneCollectedSourcesTable.userId, userId), eq(pyroxeneCollectedSourcesTable.sourceKey, sourceKey)),
    );
}

/**
 * Pyroxene Timeline Items
 */
export const pyroxeneTimelineItemsTable = sqliteTable("pyroxene_timeline_items", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  eventAt: text().notNull(),
  source: text().notNull(),
  repeatType: text(),
  repeatIntervalDays: int(),
  repeatCount: int(),
  autoRepurchase: int().notNull().default(0),
  description: text().notNull(),
  pyroxeneDelta: int().notNull(),
  oneTimeTicketDelta: int().notNull(),
  tenTimeTicketDelta: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type PyroxeneTimelineRepeatType = "fixed_days" | "monthly_first";

export type PyroxeneTimelineItem = {
  uid: string;
  userId: number;
  eventAt: string;
  source: TimelineSourceType;
  repeatType: PyroxeneTimelineRepeatType;
  repeatIntervalDays: number | null;
  repeatCount: number | null;
  autoRepurchase: boolean;
  description: string;
  pyroxeneDelta: number;
  oneTimeTicketDelta: number;
  tenTimeTicketDelta: number;
};

function toTimelineRepeatType(repeatType: string | null): PyroxeneTimelineRepeatType {
  return repeatType === "monthly_first" ? "monthly_first" : "fixed_days";
}

function toTimelineItemModel(item: typeof pyroxeneTimelineItemsTable.$inferSelect): PyroxeneTimelineItem {
  return {
    uid: item.uid,
    userId: item.userId,
    eventAt: item.eventAt,
    source: item.source as TimelineSourceType,
    repeatType: toTimelineRepeatType(item.repeatType),
    repeatIntervalDays: item.repeatIntervalDays,
    repeatCount: item.repeatCount,
    autoRepurchase: item.autoRepurchase === 1,
    description: item.description,
    pyroxeneDelta: item.pyroxeneDelta,
    oneTimeTicketDelta: item.oneTimeTicketDelta,
    tenTimeTicketDelta: item.tenTimeTicketDelta,
  };
}

export async function getPyroxeneTimelineItems(env: Env, userId: number): Promise<PyroxeneTimelineItem[]> {
  const db = drizzle(env.DB);
  const items = await db
    .select()
    .from(pyroxeneTimelineItemsTable)
    .where(eq(pyroxeneTimelineItemsTable.userId, userId))
    .orderBy(sql`eventAt ASC`);
  return items.map(toTimelineItemModel);
}

type CreateBuyPyroxeneOptions = {
  repeatType?: PyroxeneTimelineRepeatType;
  monthlyCount?: number;
  uid?: string;
};

function normalizeMonthlyCount(monthlyCount: number | undefined): number {
  if (monthlyCount === undefined || !Number.isFinite(monthlyCount)) {
    return 1;
  }
  return Math.max(1, Math.floor(monthlyCount));
}

export async function createBuyPyroxene(
  env: Env,
  userId: number,
  date: Date | string,
  quantity: number,
  options: CreateBuyPyroxeneOptions = {},
): Promise<void> {
  const uid = options.uid ?? nanoid(8);
  const eventAt = normalizePyroxeneTimelineEventAt(date);
  const repeatType = options.repeatType ?? "fixed_days";
  const normalizedMonthlyCount = normalizeMonthlyCount(options.monthlyCount);
  const pyroxeneDelta = quantity * normalizedMonthlyCount;
  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable).values({
    uid,
    userId,
    eventAt,
    source: "buy",
    repeatType: repeatType === "fixed_days" ? null : repeatType,
    description: "청휘석 구매",
    pyroxeneDelta,
    oneTimeTicketDelta: 0,
    tenTimeTicketDelta: 0,
  });
}

export async function deletePyroxeneTimelineItem(env: Env, userId: number, uid: string): Promise<void> {
  const db = drizzle(env.DB);
  const parsedUid = extractPyroxeneTimelineBaseUid(uid);
  await db
    .delete(pyroxeneTimelineItemsTable)
    .where(
      and(
        eq(pyroxeneTimelineItemsTable.userId, userId),
        or(eq(pyroxeneTimelineItemsTable.uid, parsedUid), like(pyroxeneTimelineItemsTable.uid, `${parsedUid}%`)),
      ),
    );
}

export async function createPyroxeneMonthlyPackage(
  env: Env,
  userId: number,
  startDate: Date | string,
  packageType: PyroxeneMonthlyPackageType,
  autoRepurchase = false,
  uid = nanoid(8),
): Promise<void> {
  const eventAt = normalizePyroxeneTimelineEventAt(startDate);

  const {
    name: packageName,
    oneTime: oneTimePyroxene,
    daily: dailyPyroxene,
    repurchaseIntervalDays,
  } = PYROXENE_MONTHLY_PACKAGE_CONFIG[packageType];
  const autoRepurchaseValue = autoRepurchase ? 1 : 0;
  const packageItems: (typeof pyroxeneTimelineItemsTable.$inferInsert)[] = [
    {
      uid: `${uid}::onetime`,
      userId,
      eventAt,
      source: "package_onetime",
      repeatIntervalDays: autoRepurchase ? repurchaseIntervalDays : null,
      repeatCount: null,
      autoRepurchase: autoRepurchaseValue,
      description: `${packageName} (초회)`,
      pyroxeneDelta: oneTimePyroxene,
      oneTimeTicketDelta: 0,
      tenTimeTicketDelta: 0,
    },
  ];

  packageItems.push({
    uid: `${uid}::daily`,
    userId,
    eventAt,
    source: "package_daily",
    repeatIntervalDays: PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
    repeatCount: autoRepurchase ? null : PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
    autoRepurchase: autoRepurchaseValue,
    description: `${packageName} (일간)`,
    pyroxeneDelta: dailyPyroxene,
    oneTimeTicketDelta: 0,
    tenTimeTicketDelta: 0,
  });

  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable).values(packageItems);
}

export async function createPyroxeneApPackage(
  env: Env,
  userId: number,
  startDate: Date | string,
  autoRepurchase = false,
  uid = nanoid(8),
): Promise<void> {
  const eventAt = normalizePyroxeneTimelineEventAt(startDate);
  const autoRepurchaseValue = autoRepurchase ? 1 : 0;

  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable).values({
    uid: `${uid}::ap`,
    userId,
    eventAt,
    source: "package_ap",
    repeatIntervalDays: autoRepurchase ? PYROXENE_AP_PACKAGE_CONFIG.repurchaseIntervalDays : null,
    repeatCount: null,
    autoRepurchase: autoRepurchaseValue,
    description: `${PYROXENE_AP_PACKAGE_CONFIG.name} (초회)`,
    pyroxeneDelta: PYROXENE_AP_PACKAGE_CONFIG.oneTime,
    oneTimeTicketDelta: 0,
    tenTimeTicketDelta: 0,
  });
}

export async function createAttendance(
  env: Env,
  userId: number,
  startDate: Date | string,
  uid = nanoid(8),
): Promise<void> {
  const db = drizzle(env.DB);
  const deleteExisting = db
    .delete(pyroxeneTimelineItemsTable)
    .where(and(eq(pyroxeneTimelineItemsTable.userId, userId), eq(pyroxeneTimelineItemsTable.source, "attendance")));

  const startAt = dayjs(normalizePyroxeneTimelineEventAt(startDate));
  const insertReplacement = db.insert(pyroxeneTimelineItemsTable).values(
    PYROXENE_ATTENDANCE_CONFIG.map(({ day, pyroxene }) => ({
      uid: `${uid}::${day}`,
      userId,
      eventAt: startAt.add(day - 1, "day").toISOString(),
      source: "attendance",
      description: `출석 ${day}일차`,
      pyroxeneDelta: pyroxene,
      oneTimeTicketDelta: 0,
      tenTimeTicketDelta: 0,
      repeatIntervalDays: PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
      repeatCount: null,
    })),
  );
  await db.batch([deleteExisting, insertReplacement]);
}

export async function createOtherPyroxeneGain(
  env: Env,
  userId: number,
  date: Date | string,
  pyroxene: number,
  oneTimeTicket: number,
  tenTimeTicket: number,
  description: string,
  uid = nanoid(8),
): Promise<void> {
  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable).values({
    uid,
    userId,
    eventAt: normalizePyroxeneTimelineEventAt(date),
    source: "other",
    description,
    pyroxeneDelta: pyroxene,
    oneTimeTicketDelta: oneTimeTicket,
    tenTimeTicketDelta: tenTimeTicket,
  });
}

/**
 * Pyroxene Planner Options
 */
export const pyroxenePlannerOptionsTable = sqliteTable("pyroxene_planner_options", {
  id: int().primaryKey({ autoIncrement: true }),
  userId: int().notNull(),
  options: text().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type PyroxenePlannerOptionsModel = {
  userId: number;
  options: string;
};

export async function getPyroxenePlannerOptions(env: Env, userId: number): Promise<PyroxenePlannerOptions> {
  const db = drizzle(env.DB);
  const [record] = await db
    .select()
    .from(pyroxenePlannerOptionsTable)
    .where(eq(pyroxenePlannerOptionsTable.userId, userId))
    .limit(1);

  if (!record) {
    return defaultPyroxenePlannerOptions;
  }

  try {
    return normalizePyroxenePlannerOptions(JSON.parse(record.options) as StoredPyroxenePlannerOptions);
  } catch {
    return defaultPyroxenePlannerOptions;
  }
}

export async function upsertPyroxenePlannerOptions(
  env: Env,
  userId: number,
  options: PyroxenePlannerOptions,
): Promise<void> {
  const db = drizzle(env.DB);
  const optionsJson = JSON.stringify(options);
  const updatedAt = new Date().toISOString();

  await db
    .insert(pyroxenePlannerOptionsTable)
    .values({ userId, options: optionsJson, updatedAt })
    .onConflictDoUpdate({
      target: pyroxenePlannerOptionsTable.userId,
      set: { options: optionsJson, updatedAt },
    });
}

/**
 * Pyroxene Event Data
 */
export const pyroxeneEventDataTable = sqliteTable("pyroxene_event_data", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  eventUid: text().notNull(),
  completed: int().notNull().default(0), // boolean (0 or 1)
  expectedTrials: int(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type PyroxeneEventData = {
  uid: string;
  userId: number;
  eventUid: string;
  completed: boolean;
  expectedTrials: number | null;
};

function toEventDataModel(data: typeof pyroxeneEventDataTable.$inferSelect): PyroxeneEventData {
  return {
    uid: data.uid,
    userId: data.userId,
    eventUid: data.eventUid,
    completed: data.completed === 1,
    expectedTrials: data.expectedTrials,
  };
}

export async function getPyroxeneEventData(
  env: Env,
  userId: number,
  eventUid: string,
): Promise<PyroxeneEventData | null> {
  const db = drizzle(env.DB);
  const [data] = await db
    .select()
    .from(pyroxeneEventDataTable)
    .where(and(eq(pyroxeneEventDataTable.userId, userId), eq(pyroxeneEventDataTable.eventUid, eventUid)))
    .limit(1);

  return data ? toEventDataModel(data) : null;
}

export async function getAllPyroxeneEventData(env: Env, userId: number): Promise<PyroxeneEventData[]> {
  const db = drizzle(env.DB);
  const data = await db.select().from(pyroxeneEventDataTable).where(eq(pyroxeneEventDataTable.userId, userId));

  return data.map(toEventDataModel);
}

export async function upsertPyroxeneEventData(
  env: Env,
  userId: number,
  eventUid: string,
  data: { completed?: boolean; expectedTrials?: number | null },
): Promise<void> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);
  const updatedAt = new Date().toISOString();

  // Only overwrite fields that were explicitly provided; omitted fields preserve their existing value on conflict.
  await db
    .insert(pyroxeneEventDataTable)
    .values({
      uid,
      userId,
      eventUid,
      completed: data.completed ? 1 : 0,
      expectedTrials: data.expectedTrials ?? null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [pyroxeneEventDataTable.userId, pyroxeneEventDataTable.eventUid],
      set: {
        ...(data.completed !== undefined && { completed: data.completed ? 1 : 0 }),
        ...(data.expectedTrials !== undefined && { expectedTrials: data.expectedTrials }),
        updatedAt,
      },
    });
}

export async function deletePyroxeneEventData(env: Env, userId: number, eventUid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .delete(pyroxeneEventDataTable)
    .where(and(eq(pyroxeneEventDataTable.userId, userId), eq(pyroxeneEventDataTable.eventUid, eventUid)));
}
