import { nanoid } from "nanoid/non-secure";
import dayjs from "dayjs";
import { and, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import type { Env } from "~/env.server";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import type { PyroxenePlannerContentsQuery } from "~/graphql/graphql";
import { fetchCached } from "./base";


/**
 * Pyroxene Planner Contents
 */
export const pyroxenePlannerContentsQuery = graphql(`
  query PyroxenePlannerContents($now: ISO8601DateTime!) {
    contents(untilAfter: $now, first: 9999) {
      nodes {
        __typename uid name since until
        ... on Event {
          pickups {
            type rerun
            student { uid initialTier }
          }
        }
        ... on Raid {
          type
        }
      }
    }
  }
`);

export async function getPyroxenePlannerContents(env: Env, forceRefresh = false): Promise<PyroxenePlannerContentsQuery["contents"]["nodes"]> {
  const now = new Date();
  return fetchCached(env, "pyroxene-planner-contents", async () => {
    const { data, error } = await runQuery(pyroxenePlannerContentsQuery, { now });
    if (error || !data) {
      throw error ?? "failed to fetch pyroxene planner contents";
    }
    return data.contents.nodes;
  }, 60 * 10, forceRefresh);
}


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
  env: Env, userId: number, resources: { pyroxene: number, oneTimeTicket: number, tenTimeTicket: number },
): Promise<void> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);
  const inputAt = new Date().toISOString();
  const { pyroxene, oneTimeTicket, tenTimeTicket } = resources;
  await db.insert(pyroxeneOwnedResourcesTable)
    .values({ uid, userId, inputAt, pyroxene, oneTimeTicket, tenTimeTicket });
}

export async function deletePyroxeneOwnedResourceByUid(env: Env, userId: number, uid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.delete(pyroxeneOwnedResourcesTable)
    .where(and(eq(pyroxeneOwnedResourcesTable.userId, userId), eq(pyroxeneOwnedResourcesTable.uid, uid)));
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
  repeatIntervalDays: int(),
  repeatCount: int(),
  description: text().notNull(),
  pyroxeneDelta: int().notNull(),
  oneTimeTicketDelta: int().notNull(),
  tenTimeTicketDelta: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type PyroxeneTimelineItem = {
  uid: string;
  userId: number;
  eventAt: string;
  source: string;
  repeatIntervalDays: number | null;
  repeatCount: number | null;
  description: string;
  pyroxeneDelta: number;
  oneTimeTicketDelta: number;
  tenTimeTicketDelta: number;
};

function toTimelineItemModel(item: typeof pyroxeneTimelineItemsTable.$inferSelect): PyroxeneTimelineItem {
  return {
    uid: item.uid,
    userId: item.userId,
    eventAt: item.eventAt,
    source: item.source,
    repeatIntervalDays: item.repeatIntervalDays,
    repeatCount: item.repeatCount,
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

export async function createBuyPyroxene(env: Env, userId: number, date: Date, quantity: number): Promise<void> {
  const uid = nanoid(8);
  const eventAt = dayjs(date).utcOffset(9).hour(4).toISOString(); // KST 4:00 on the given date
  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable)
    .values({
      uid, userId, eventAt,
      source: "buy",
      description: "청휘석 구매",
      pyroxeneDelta: quantity,
      oneTimeTicketDelta: 0,
      tenTimeTicketDelta: 0,
    });
}

export async function deletePyroxeneTimelineItem(env: Env, userId: number, uid: string): Promise<void> {
  const db = drizzle(env.DB);
  const parsedUid = uid.split("::")[0];
  await db.delete(pyroxeneTimelineItemsTable)
    .where(and(
      eq(pyroxeneTimelineItemsTable.userId, userId),
      or(eq(pyroxeneTimelineItemsTable.uid, parsedUid), like(pyroxeneTimelineItemsTable.uid, `${parsedUid}%`)),
    ));
}

export async function createPyroxenePackage(env: Env, userId: number, startDate: Date, packageType: "half" | "full"): Promise<void> {
  const uid = nanoid(8);
  const eventAt = dayjs(startDate).utcOffset(9).hour(4).toISOString(); // KST 4:00 on the given date

  const packageName = packageType === "half" ? "하프 패키지" : "월간 패키지";
  const oneTimePyroxene = packageType === "half" ? 176 : 392;
  const dailyPyroxene = packageType === "half" ? 20 : 40;

  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable)
    .values([
      {
        uid: `${uid}::onetime`,
        userId, eventAt,
        source: "package_onetime",
        description: `${packageName} (초회)`,
        pyroxeneDelta: oneTimePyroxene,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
      },
      {
        uid: `${uid}::daily`,
        userId, eventAt,
        source: "package_daily",
        description: `${packageName} (일간)`,
        pyroxeneDelta: dailyPyroxene,
        repeatIntervalDays: 1,
        repeatCount: 30,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
      },
    ]);
}

export async function createAttendance(env: Env, userId: number, startDate: Date): Promise<void> {
  const db = drizzle(env.DB);
  await db.delete(pyroxeneTimelineItemsTable)
    .where(and(eq(pyroxeneTimelineItemsTable.userId, userId), eq(pyroxeneTimelineItemsTable.source, "attendance")));

  const uid = nanoid(8);
  const startAt = dayjs(startDate).utcOffset(9).hour(4); // KST 4:00 on the given date
  await db.insert(pyroxeneTimelineItemsTable)
    .values([
      {
        uid: `${uid}::5`,
        userId,
        eventAt: startAt.add(4, "day").toISOString(),
        source: "attendance",
        description: "출석 5일차",
        pyroxeneDelta: 50,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
        repeatIntervalDays: 10,
        repeatCount: null,
      },
      {
        uid: `${uid}::10`,
        userId,
        eventAt: startAt.add(9, "day").toISOString(),
        source: "attendance",
        description: "출석 10일차",
        pyroxeneDelta: 100,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
        repeatIntervalDays: 10,
        repeatCount: null
      },
    ]);
}

export async function createOtherPyroxeneGain(env: Env, userId: number, date: Date, pyroxene: number, oneTimeTicket: number, tenTimeTicket: number, description: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable)
    .values({
      uid: nanoid(8),
      userId,
      eventAt: dayjs(date).utcOffset(9).hour(4).toISOString(),
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
export type TimelineSourceType = "event" | "raid" | "daily_mission" | "weekly_mission" | "buy" | "package_onetime" | "package_daily" | "attendance" | "tactical" | "other";
export type PyroxenePlannerOptions = {
  event: {
    pickupChance: "ceil" | "average";
  };
  raid: {
    tier: "platinum" | "gold" | "silver" | "bronze";
  };
  tactical: {
    level: "in10" | "in100" | "in200" | "over200";
  };
  timeline: {
    display: TimelineSourceType[];
  };
};

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

export async function getPyroxenePlannerOptions(env: Env, userId: number): Promise<PyroxenePlannerOptions | null> {
  const db = drizzle(env.DB);
  const [record] = await db
    .select()
    .from(pyroxenePlannerOptionsTable)
    .where(eq(pyroxenePlannerOptionsTable.userId, userId))
    .limit(1);

  if (!record) {
    return null;
  }

  try {
    return JSON.parse(record.options) as PyroxenePlannerOptions;
  } catch {
    return null;
  }
}

export async function upsertPyroxenePlannerOptions(env: Env, userId: number, options: PyroxenePlannerOptions): Promise<void> {
  const db = drizzle(env.DB);
  const optionsJson = JSON.stringify(options);
  const updatedAt = new Date().toISOString();

  await db.insert(pyroxenePlannerOptionsTable)
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

export async function getPyroxeneEventData(env: Env, userId: number, eventUid: string): Promise<PyroxeneEventData | null> {
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
  const data = await db
    .select()
    .from(pyroxeneEventDataTable)
    .where(eq(pyroxeneEventDataTable.userId, userId));

  return data.map(toEventDataModel);
}

export async function upsertPyroxeneEventData(
  env: Env,
  userId: number,
  eventUid: string,
  data: { completed?: boolean; expectedTrials?: number | null },
): Promise<void> {
  const db = drizzle(env.DB);
  const updatedAt = new Date().toISOString();

  const existing = await getPyroxeneEventData(env, userId, eventUid);

  if (existing) {
    await db
      .update(pyroxeneEventDataTable)
      .set({
        completed: data.completed !== undefined ? (data.completed ? 1 : 0) : existing.completed ? 1 : 0,
        expectedTrials: data.expectedTrials !== undefined ? data.expectedTrials : existing.expectedTrials,
        updatedAt,
      })
      .where(and(eq(pyroxeneEventDataTable.userId, userId), eq(pyroxeneEventDataTable.eventUid, eventUid)));
  } else {
    const uid = nanoid(8);
    await db.insert(pyroxeneEventDataTable).values({
      uid,
      userId,
      eventUid,
      completed: data.completed !== undefined ? (data.completed ? 1 : 0) : 0,
      expectedTrials: data.expectedTrials !== undefined ? data.expectedTrials : null,
      updatedAt,
    });
  }
}

export async function deletePyroxeneEventData(env: Env, userId: number, eventUid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .delete(pyroxeneEventDataTable)
    .where(and(eq(pyroxeneEventDataTable.userId, userId), eq(pyroxeneEventDataTable.eventUid, eventUid)));
}
