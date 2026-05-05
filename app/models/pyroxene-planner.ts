import { nanoid } from "nanoid/non-secure";
import dayjs from "dayjs";
import { and, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import { RecruitmentRepository, RaidRepository } from "~/repositories";
import type { TimelineContentType } from "./timeline-content";
import { fetchCached } from "./base";
import { getTimelineContents, getFutureRaidContents } from "./timeline-content";
import { getAllStudentsMap } from "./student";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { RaidType } from "./content.d";
import { compareInstantAsc, compareInstantDesc, nowUtcIso, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import {
  PYROXENE_ATTENDANCE_CONFIG,
  PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
  PYROXENE_AP_PACKAGE_CONFIG,
  PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
  PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
  PYROXENE_MONTHLY_PACKAGE_CONFIG,
  type PyroxeneMonthlyPackageType,
  extractPyroxeneTimelineBaseUid,
  normalizePyroxeneTimelineEventAt,
} from "./pyroxene-planner-source-config";
import {
  DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  type PyroxeneSourceType,
} from "./pyroxene-source-definitions";

/**
 * Pyroxene Planner Contents
 */
const EVENT_CONTENT_TYPES: TimelineContentType[] = ["event", "main_story", "pickup"];

export type PyroxenePlannerContent =
  | {
      kind: "event";
      uid: string;
      name: string;
      since: UtcIsoString;
      until: UtcIsoString;
      earnablePyroxene: number | null;
      tags: string[];
      recruitments: {
        recruitmentType: RecruitmentTypeEnum;
        pickup: boolean;
        rerun: boolean;
        until: UtcIsoString | null;
        student: { uid: string; name: string; initialTier: number } | null;
      }[];
    }
  | {
      kind: "raid";
      uid: string;
      name: string;
      type: RaidType;
      since: UtcIsoString;
      until: UtcIsoString;
    };

export async function getPyroxenePlannerContents(env: Env, forceRefresh = false): Promise<PyroxenePlannerContent[]> {
  return fetchCached(
    env,
    "pyroxene-planner-contents::v6",
    async () => {
      const recruitmentRepository = new RecruitmentRepository(env);
      const raidRepository = new RaidRepository(env);

      // Events require syncedAt (confirmed by BAQL); raids are fetched regardless of syncedAt
      const [eventContents, raidContents] = await Promise.all([
        getTimelineContents(env),
        getFutureRaidContents(env, ["raid"]),
      ]);
      const raidUids = new Set(raidContents.map((c) => c.uid));
      const allContents = [...eventContents.filter((c) => !raidUids.has(c.uid)), ...raidContents].sort((a, b) =>
        compareInstantAsc(a.startAt, b.startAt),
      );

      const recruitmentGroupUids = allContents
        .map((c) => c.recruitmentGroupUid)
        .filter((uid) => uid !== null) as string[];
      const [recruitmentGroups, studentsMap] = await Promise.all([
        recruitmentRepository.getByUids(recruitmentGroupUids, forceRefresh),
        getAllStudentsMap(env, true),
      ]);

      const recruitmentGroupMap = new Map(recruitmentGroups.map((g) => [g.uid, g]));
      const results = await Promise.all(
        allContents.map(async (content) => {
          if (EVENT_CONTENT_TYPES.includes(content.contentType)) {
            const group = content.recruitmentGroupUid
              ? recruitmentGroupMap.get(content.recruitmentGroupUid)
              : undefined;
            const recruitments = (group?.recruitments ?? []).map((r) => ({
              recruitmentType: r.recruitmentType,
              pickup: r.pickup,
              rerun: r.rerun,
              until: r.until ? toUtcIso(r.until) : null,
              student: r.student
                ? {
                    uid: r.student.uid,
                    name: r.student.name,
                    initialTier: studentsMap[r.student.uid]?.initialTier ?? 0,
                  }
                : null,
            }));

            // endAt이 없는 경우 recruitment의 최대 until 날짜를 사용
            const until =
              content.endAt ??
              group?.recruitments.reduce<UtcIsoString | null>(
                (max, r) => (r.until ? (max && compareInstantDesc(max, r.until) < 0 ? max : toUtcIso(r.until)) : max),
                null,
              );
            if (!until) return null;

            return {
              kind: "event" as const,
              uid: content.uid,
              name: content.name,
              since: content.startAt,
              until,
              earnablePyroxene: content.earnablePyroxene ?? null,
              tags: content.tags,
              recruitments,
            };
          }
          if (content.contentType === "raid") {
            let raidName = content.name;
            let raidType = content.contentType as RaidType;
            let until: UtcIsoString | null = content.endAt;

            if (content.contentUid) {
              const schedule = await raidRepository.getSchedule(content.contentUid, forceRefresh);
              if (schedule) {
                raidName = schedule.raidBoss.name;
                raidType = schedule.raidType as RaidType;
                until = until ?? schedule.endAt;
              }
            }

            if (!until) return null;

            return {
              kind: "raid" as const,
              uid: content.uid,
              name: raidName,
              type: raidType,
              since: content.startAt,
              until,
            };
          }
          return null;
        }),
      );

      return results.filter((r) => r !== null);
    },
    60 * 10,
    forceRefresh,
  );
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
  env: Env,
  userId: number,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
): Promise<void> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);
  const inputAt = new Date().toISOString();
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
  autoRepurchase: int().notNull().default(0),
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
  source: TimelineSourceType;
  repeatIntervalDays: number | null;
  repeatCount: number | null;
  autoRepurchase: boolean;
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
    source: item.source as TimelineSourceType,
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

export async function createBuyPyroxene(env: Env, userId: number, date: Date | string, quantity: number): Promise<void> {
  const uid = nanoid(8);
  const eventAt = normalizePyroxeneTimelineEventAt(date);
  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable).values({
    uid,
    userId,
    eventAt,
    source: "buy",
    description: "청휘석 구매",
    pyroxeneDelta: quantity,
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
): Promise<void> {
  const uid = nanoid(8);
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
): Promise<void> {
  const uid = nanoid(8);
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

export async function createAttendance(env: Env, userId: number, startDate: Date | string): Promise<void> {
  const db = drizzle(env.DB);
  await db
    .delete(pyroxeneTimelineItemsTable)
    .where(and(eq(pyroxeneTimelineItemsTable.userId, userId), eq(pyroxeneTimelineItemsTable.source, "attendance")));

  const uid = nanoid(8);
  const startAt = dayjs(normalizePyroxeneTimelineEventAt(startDate));
  await db.insert(pyroxeneTimelineItemsTable).values(
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
}

export async function createOtherPyroxeneGain(
  env: Env,
  userId: number,
  date: Date | string,
  pyroxene: number,
  oneTimeTicket: number,
  tenTimeTicket: number,
  description: string,
): Promise<void> {
  const db = drizzle(env.DB);
  await db.insert(pyroxeneTimelineItemsTable).values({
    uid: nanoid(8),
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
export type TimelineSourceType = PyroxeneSourceType;
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
  consumption: {
    apChargeCount: number;
  };
  timeline: {
    display: TimelineSourceType[];
  };
};

export const defaultPyroxenePlannerOptions: PyroxenePlannerOptions = {
  event: {
    pickupChance: "average",
  },
  raid: {
    tier: "platinum",
  },
  tactical: {
    level: "in100",
  },
  consumption: {
    apChargeCount: 0,
  },
  timeline: {
    display: DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  },
};

export type StoredPyroxenePlannerOptions = Partial<
  Omit<PyroxenePlannerOptions, "event" | "raid" | "tactical" | "consumption" | "timeline">
> & {
  event?: Partial<PyroxenePlannerOptions["event"]>;
  raid?: Partial<PyroxenePlannerOptions["raid"]>;
  tactical?: Partial<PyroxenePlannerOptions["tactical"]>;
  consumption?: Partial<PyroxenePlannerOptions["consumption"]>;
  timeline?: Partial<PyroxenePlannerOptions["timeline"]>;
};

export function normalizePyroxenePlannerOptions(
  options: StoredPyroxenePlannerOptions | null,
): PyroxenePlannerOptions {
  return {
    event: {
      ...defaultPyroxenePlannerOptions.event,
      ...options?.event,
    },
    raid: {
      ...defaultPyroxenePlannerOptions.raid,
      ...options?.raid,
    },
    tactical: {
      ...defaultPyroxenePlannerOptions.tactical,
      ...options?.tactical,
    },
    consumption: {
      ...defaultPyroxenePlannerOptions.consumption,
      ...options?.consumption,
    },
    timeline: {
      display: options?.timeline?.display ?? defaultPyroxenePlannerOptions.timeline.display,
    },
  };
}

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
