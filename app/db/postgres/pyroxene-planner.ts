import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
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
import { normalizeInstant, nowUtcIso } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import {
  pgPyroxeneCollectedSourcesTable,
  pgPyroxeneEventDataTable,
  pgPyroxeneOwnedResourcesTable,
  pgPyroxenePlannerOptionsTable,
  pgPyroxeneTimelineItemsTable,
} from "./schema";

export type PyroxeneDatabase = NodePgDatabase;

export type PostgresPyroxeneOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

export type PyroxeneOwnedResource = {
  uid: string;
  userId: number;
  inputAt: string;
  pyroxene: number;
  oneTimeTicket: number;
  tenTimeTicket: number;
};

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

export type PyroxeneEventData = {
  uid: string;
  userId: number;
  eventUid: string;
  completed: boolean;
  expectedTrials: number | null;
};

export type PostgresPyroxeneUserState = {
  latestResources: PyroxeneOwnedResource | null;
  options: PyroxenePlannerOptions;
  eventData: PyroxeneEventData[];
  timelineItems: PyroxeneTimelineItem[];
  collectedSourceKeys: Set<string>;
};

type OwnedResourceWriteOptions = {
  uid?: string;
  inputAt?: string;
  ignoreUidConflict?: boolean;
};

type TimelineWriteOptions = {
  uid?: string;
  ignoreUidConflict?: boolean;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string): string {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function toOwnedResourceModel(resource: typeof pgPyroxeneOwnedResourcesTable.$inferSelect): PyroxeneOwnedResource {
  return {
    uid: resource.uid,
    userId: resource.userId,
    inputAt: toIso(resource.inputAt),
    pyroxene: resource.pyroxene,
    oneTimeTicket: resource.oneTimeTicket,
    tenTimeTicket: resource.tenTimeTicket,
  };
}

function toTimelineRepeatType(repeatType: string | null): PyroxeneTimelineRepeatType {
  return repeatType === "monthly_first" ? "monthly_first" : "fixed_days";
}

function toTimelineItemModel(item: typeof pgPyroxeneTimelineItemsTable.$inferSelect): PyroxeneTimelineItem {
  return {
    uid: item.uid,
    userId: item.userId,
    eventAt: toIso(item.eventAt),
    source: item.source as TimelineSourceType,
    repeatType: toTimelineRepeatType(item.repeatType),
    repeatIntervalDays: item.repeatIntervalDays,
    repeatCount: item.repeatCount,
    autoRepurchase: item.autoRepurchase,
    description: item.description,
    pyroxeneDelta: item.pyroxeneDelta,
    oneTimeTicketDelta: item.oneTimeTicketDelta,
    tenTimeTicketDelta: item.tenTimeTicketDelta,
  };
}

function toEventDataModel(data: typeof pgPyroxeneEventDataTable.$inferSelect): PyroxeneEventData {
  return {
    uid: data.uid,
    userId: data.userId,
    eventUid: data.eventUid,
    completed: data.completed,
    expectedTrials: data.expectedTrials,
  };
}

export function withPyroxeneDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: PyroxeneDatabase) => Promise<T>,
  options: PostgresPyroxeneOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "pyroxene");
        span?.setAttribute("pyroxene.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.pyroxene.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getLatestPyroxeneOwnedResourceInDatabase(
  db: PyroxeneDatabase,
  userId: number,
): Promise<PyroxeneOwnedResource | null> {
  const [resource] = await db
    .select()
    .from(pgPyroxeneOwnedResourcesTable)
    .where(eq(pgPyroxeneOwnedResourcesTable.userId, userId))
    .orderBy(desc(pgPyroxeneOwnedResourcesTable.inputAt))
    .limit(1);
  return resource ? toOwnedResourceModel(resource) : null;
}

export async function createPyroxeneOwnedResourceInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
  options: OwnedResourceWriteOptions = {},
): Promise<void> {
  const values = {
    uid: options.uid ?? nanoid(8),
    userId,
    inputAt: toDate(options.inputAt ?? nowUtcIso()),
    pyroxene: resources.pyroxene,
    oneTimeTicket: resources.oneTimeTicket,
    tenTimeTicket: resources.tenTimeTicket,
  };
  const insert = db.insert(pgPyroxeneOwnedResourcesTable).values(values);
  if (options.ignoreUidConflict) {
    await insert.onConflictDoNothing({ target: pgPyroxeneOwnedResourcesTable.uid });
    return;
  }
  await insert;
}

export async function getPostgresLatestPyroxeneOwnedResource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<PyroxeneOwnedResource | null> {
  return withPyroxeneDatabase(
    env,
    "owned_resources.latest",
    (db) => getLatestPyroxeneOwnedResourceInDatabase(db, userId),
    options,
  );
}

export async function createPostgresPyroxeneOwnedResource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
  options: OwnedResourceWriteOptions & PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "owned_resources.create",
    (db) => createPyroxeneOwnedResourceInDatabase(db, userId, resources, options),
    options,
  );
}

export async function deletePostgresPyroxeneOwnedResourceByUid(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  uid: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  await withPyroxeneDatabase(
    env,
    "owned_resources.delete",
    async (db) => {
      await db
        .delete(pgPyroxeneOwnedResourcesTable)
        .where(and(eq(pgPyroxeneOwnedResourcesTable.userId, userId), eq(pgPyroxeneOwnedResourcesTable.uid, uid)));
    },
    options,
  );
}

export async function getCollectedSourceKeysInDatabase(db: PyroxeneDatabase, userId: number): Promise<Set<string>> {
  const rows = await db
    .select({ sourceKey: pgPyroxeneCollectedSourcesTable.sourceKey })
    .from(pgPyroxeneCollectedSourcesTable)
    .where(eq(pgPyroxeneCollectedSourcesTable.userId, userId));
  return new Set(rows.map((row) => row.sourceKey));
}

export async function upsertCollectedSourceInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  sourceKey: string,
): Promise<void> {
  const collectedAt = toDate(nowUtcIso());
  await db
    .insert(pgPyroxeneCollectedSourcesTable)
    .values({ uid: nanoid(8), userId, sourceKey, collectedAt })
    .onConflictDoUpdate({
      target: [pgPyroxeneCollectedSourcesTable.userId, pgPyroxeneCollectedSourcesTable.sourceKey],
      set: { collectedAt },
    });
}

export async function ensureCollectedSourceInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  sourceKey: string,
): Promise<void> {
  await db
    .insert(pgPyroxeneCollectedSourcesTable)
    .values({ uid: nanoid(8), userId, sourceKey, collectedAt: toDate(nowUtcIso()) })
    .onConflictDoNothing({
      target: [pgPyroxeneCollectedSourcesTable.userId, pgPyroxeneCollectedSourcesTable.sourceKey],
    });
}

export async function upsertCollectedSourcesInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  sourceKeys: string[],
): Promise<void> {
  const uniqueSourceKeys = [...new Set(sourceKeys)].filter((sourceKey) => sourceKey.length > 0);
  if (uniqueSourceKeys.length === 0) return;
  const collectedAt = toDate(nowUtcIso());
  await db
    .insert(pgPyroxeneCollectedSourcesTable)
    .values(
      uniqueSourceKeys.map((sourceKey) => ({
        uid: nanoid(8),
        userId,
        sourceKey,
        collectedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [pgPyroxeneCollectedSourcesTable.userId, pgPyroxeneCollectedSourcesTable.sourceKey],
      set: { collectedAt },
    });
}

export async function getPostgresCollectedSourceKeys(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<Set<string>> {
  return withPyroxeneDatabase(
    env,
    "collected_sources.list",
    (db) => getCollectedSourceKeysInDatabase(db, userId),
    options,
  );
}

export async function upsertPostgresCollectedSource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "collected_sources.upsert",
    (db) => upsertCollectedSourceInDatabase(db, userId, sourceKey),
    options,
  );
}

export async function ensurePostgresCollectedSource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "collected_sources.ensure",
    (db) => ensureCollectedSourceInDatabase(db, userId, sourceKey),
    options,
  );
}

export async function upsertPostgresCollectedSources(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKeys: string[],
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  const uniqueSourceKeys = [...new Set(sourceKeys)].filter((sourceKey) => sourceKey.length > 0);
  if (uniqueSourceKeys.length === 0) return;
  await withPyroxeneDatabase(
    env,
    "collected_sources.bulk_upsert",
    (db) => upsertCollectedSourcesInDatabase(db, userId, uniqueSourceKeys),
    options,
  );
}

export async function deletePostgresCollectedSource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  await withPyroxeneDatabase(
    env,
    "collected_sources.delete",
    async (db) => {
      await db
        .delete(pgPyroxeneCollectedSourcesTable)
        .where(
          and(
            eq(pgPyroxeneCollectedSourcesTable.userId, userId),
            eq(pgPyroxeneCollectedSourcesTable.sourceKey, sourceKey),
          ),
        );
    },
    options,
  );
}

export async function getPyroxeneTimelineItemsInDatabase(
  db: PyroxeneDatabase,
  userId: number,
): Promise<PyroxeneTimelineItem[]> {
  const items = await db
    .select()
    .from(pgPyroxeneTimelineItemsTable)
    .where(eq(pgPyroxeneTimelineItemsTable.userId, userId))
    .orderBy(asc(pgPyroxeneTimelineItemsTable.eventAt));
  return items.map(toTimelineItemModel);
}

export async function createBuyPyroxeneInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  date: Date | string,
  quantity: number,
  options: TimelineWriteOptions & { repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number } = {},
): Promise<void> {
  const uid = options.uid ?? nanoid(8);
  const repeatType = options.repeatType ?? "fixed_days";
  const monthlyCount =
    options.monthlyCount === undefined || !Number.isFinite(options.monthlyCount)
      ? 1
      : Math.max(1, Math.floor(options.monthlyCount));
  const insert = db.insert(pgPyroxeneTimelineItemsTable).values({
    uid,
    userId,
    eventAt: toDate(normalizePyroxeneTimelineEventAt(date)),
    source: "buy",
    repeatType: repeatType === "fixed_days" ? null : repeatType,
    description: "청휘석 구매",
    pyroxeneDelta: quantity * monthlyCount,
    oneTimeTicketDelta: 0,
    tenTimeTicketDelta: 0,
  });
  if (options.ignoreUidConflict) {
    await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid });
    return;
  }
  await insert;
}

export async function deletePyroxeneTimelineItemInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  uid: string,
): Promise<void> {
  const parsedUid = extractPyroxeneTimelineBaseUid(uid);
  await db
    .delete(pgPyroxeneTimelineItemsTable)
    .where(
      and(
        eq(pgPyroxeneTimelineItemsTable.userId, userId),
        or(eq(pgPyroxeneTimelineItemsTable.uid, parsedUid), like(pgPyroxeneTimelineItemsTable.uid, `${parsedUid}%`)),
      ),
    );
}

export async function createPyroxeneMonthlyPackageInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  startDate: Date | string,
  packageType: PyroxeneMonthlyPackageType,
  autoRepurchase = false,
  uid = nanoid(8),
  ignoreUidConflict = false,
): Promise<void> {
  const eventAt = toDate(normalizePyroxeneTimelineEventAt(startDate));
  const {
    name: packageName,
    oneTime: oneTimePyroxene,
    daily: dailyPyroxene,
    repurchaseIntervalDays,
  } = PYROXENE_MONTHLY_PACKAGE_CONFIG[packageType];
  const autoRepurchaseValue = autoRepurchase;
  const values = [
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
    {
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
    },
  ];
  const insert = db.insert(pgPyroxeneTimelineItemsTable).values(values);
  if (ignoreUidConflict) {
    await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid });
    return;
  }
  await insert;
}

export async function createPyroxeneApPackageInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  startDate: Date | string,
  autoRepurchase = false,
  uid = nanoid(8),
  ignoreUidConflict = false,
): Promise<void> {
  const insert = db.insert(pgPyroxeneTimelineItemsTable).values({
    uid: `${uid}::ap`,
    userId,
    eventAt: toDate(normalizePyroxeneTimelineEventAt(startDate)),
    source: "package_ap",
    repeatIntervalDays: autoRepurchase ? PYROXENE_AP_PACKAGE_CONFIG.repurchaseIntervalDays : null,
    repeatCount: null,
    autoRepurchase,
    description: `${PYROXENE_AP_PACKAGE_CONFIG.name} (초회)`,
    pyroxeneDelta: PYROXENE_AP_PACKAGE_CONFIG.oneTime,
    oneTimeTicketDelta: 0,
    tenTimeTicketDelta: 0,
  });
  if (ignoreUidConflict) {
    await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid });
    return;
  }
  await insert;
}

export async function createAttendanceInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  startDate: Date | string,
  uid = nanoid(8),
  ignoreUidConflict = false,
): Promise<void> {
  const startAt = new Date(normalizePyroxeneTimelineEventAt(startDate));
  await db.transaction(async (tx) => {
    await tx
      .delete(pgPyroxeneTimelineItemsTable)
      .where(
        and(eq(pgPyroxeneTimelineItemsTable.userId, userId), eq(pgPyroxeneTimelineItemsTable.source, "attendance")),
      );
    const insert = tx.insert(pgPyroxeneTimelineItemsTable).values(
      PYROXENE_ATTENDANCE_CONFIG.map(({ day, pyroxene }) => ({
        uid: `${uid}::${day}`,
        userId,
        eventAt: new Date(startAt.getTime() + (day - 1) * 24 * 60 * 60 * 1000),
        source: "attendance",
        description: `출석 ${day}일차`,
        pyroxeneDelta: pyroxene,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
        repeatIntervalDays: PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
        repeatCount: null,
      })),
    );
    if (ignoreUidConflict) {
      await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid });
    } else {
      await insert;
    }
  });
}

export async function createOtherPyroxeneGainInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  date: Date | string,
  pyroxene: number,
  oneTimeTicket: number,
  tenTimeTicket: number,
  description: string,
  uid = nanoid(8),
  ignoreUidConflict = false,
): Promise<void> {
  const insert = db.insert(pgPyroxeneTimelineItemsTable).values({
    uid,
    userId,
    eventAt: toDate(normalizePyroxeneTimelineEventAt(date)),
    source: "other",
    description,
    pyroxeneDelta: pyroxene,
    oneTimeTicketDelta: oneTimeTicket,
    tenTimeTicketDelta: tenTimeTicket,
  });
  if (ignoreUidConflict) {
    await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid });
    return;
  }
  await insert;
}

export async function getPostgresPyroxeneTimelineItems(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<PyroxeneTimelineItem[]> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.list",
    (db) => getPyroxeneTimelineItemsInDatabase(db, userId),
    options,
  );
}

export async function createPostgresBuyPyroxene(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  date: Date | string,
  quantity: number,
  options: TimelineWriteOptions & {
    repeatType?: PyroxeneTimelineRepeatType;
    monthlyCount?: number;
  } & PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.buy",
    (db) => createBuyPyroxeneInDatabase(db, userId, date, quantity, options),
    options,
  );
}

export async function deletePostgresPyroxeneTimelineItem(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  uid: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.delete",
    (db) => deletePyroxeneTimelineItemInDatabase(db, userId, uid),
    options,
  );
}

export async function createPostgresPyroxeneMonthlyPackage(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  startDate: Date | string,
  packageType: PyroxeneMonthlyPackageType,
  autoRepurchase = false,
  uid = nanoid(8),
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.monthly_package",
    (db) => createPyroxeneMonthlyPackageInDatabase(db, userId, startDate, packageType, autoRepurchase, uid),
    options,
  );
}

export async function createPostgresPyroxeneApPackage(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  startDate: Date | string,
  autoRepurchase = false,
  uid = nanoid(8),
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.ap_package",
    (db) => createPyroxeneApPackageInDatabase(db, userId, startDate, autoRepurchase, uid),
    options,
  );
}

export async function createPostgresAttendance(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  startDate: Date | string,
  uid = nanoid(8),
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.attendance",
    (db) => createAttendanceInDatabase(db, userId, startDate, uid),
    options,
  );
}

export async function createPostgresOtherPyroxeneGain(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  date: Date | string,
  pyroxene: number,
  oneTimeTicket: number,
  tenTimeTicket: number,
  description: string,
  uid = nanoid(8),
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.other",
    (db) =>
      createOtherPyroxeneGainInDatabase(db, userId, date, pyroxene, oneTimeTicket, tenTimeTicket, description, uid),
    options,
  );
}

async function getPyroxenePlannerOptionsInDatabase(
  db: PyroxeneDatabase,
  userId: number,
): Promise<PyroxenePlannerOptions> {
  const [record] = await db
    .select()
    .from(pgPyroxenePlannerOptionsTable)
    .where(eq(pgPyroxenePlannerOptionsTable.userId, userId))
    .limit(1);
  if (!record) return defaultPyroxenePlannerOptions;
  try {
    return normalizePyroxenePlannerOptions(JSON.parse(record.options) as StoredPyroxenePlannerOptions);
  } catch {
    return defaultPyroxenePlannerOptions;
  }
}

export async function upsertPyroxenePlannerOptionsInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  options: PyroxenePlannerOptions,
): Promise<void> {
  const optionsJson = JSON.stringify(options);
  const updatedAt = toDate(nowUtcIso());
  await db
    .insert(pgPyroxenePlannerOptionsTable)
    .values({ userId, options: optionsJson, updatedAt })
    .onConflictDoUpdate({
      target: pgPyroxenePlannerOptionsTable.userId,
      set: { options: optionsJson, updatedAt },
    });
}

export async function getPostgresPyroxenePlannerOptions(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<PyroxenePlannerOptions> {
  return withPyroxeneDatabase(
    env,
    "planner_options.get",
    (db) => getPyroxenePlannerOptionsInDatabase(db, userId),
    options,
  );
}

export async function upsertPostgresPyroxenePlannerOptions(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PyroxenePlannerOptions,
  repositoryOptions: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "planner_options.upsert",
    (db) => upsertPyroxenePlannerOptionsInDatabase(db, userId, options),
    repositoryOptions,
  );
}

export async function getPyroxeneEventDataInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  eventUid: string,
): Promise<PyroxeneEventData | null> {
  const [data] = await db
    .select()
    .from(pgPyroxeneEventDataTable)
    .where(and(eq(pgPyroxeneEventDataTable.userId, userId), eq(pgPyroxeneEventDataTable.eventUid, eventUid)))
    .limit(1);
  return data ? toEventDataModel(data) : null;
}

export async function getAllPyroxeneEventDataInDatabase(
  db: PyroxeneDatabase,
  userId: number,
): Promise<PyroxeneEventData[]> {
  const data = await db.select().from(pgPyroxeneEventDataTable).where(eq(pgPyroxeneEventDataTable.userId, userId));
  return data.map(toEventDataModel);
}

export async function upsertPyroxeneEventDataInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  eventUid: string,
  data: { completed?: boolean; expectedTrials?: number | null },
): Promise<void> {
  const uid = nanoid(8);
  const updatedAt = toDate(nowUtcIso());
  const insert = db.insert(pgPyroxeneEventDataTable).values({
    uid,
    userId,
    eventUid,
    completed: data.completed ?? false,
    expectedTrials: data.expectedTrials ?? null,
    updatedAt,
  });
  const onConflict = insert.onConflictDoUpdate({
    target: [pgPyroxeneEventDataTable.userId, pgPyroxeneEventDataTable.eventUid],
    set: {
      ...(data.completed !== undefined ? { completed: data.completed } : {}),
      ...(data.expectedTrials !== undefined ? { expectedTrials: data.expectedTrials } : {}),
      updatedAt,
    },
  });
  await onConflict;
}

export async function getPostgresPyroxeneEventData(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  options: PostgresPyroxeneOptions = {},
): Promise<PyroxeneEventData | null> {
  return withPyroxeneDatabase(
    env,
    "event_data.get",
    (db) => getPyroxeneEventDataInDatabase(db, userId, eventUid),
    options,
  );
}

export async function getPostgresAllPyroxeneEventData(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<PyroxeneEventData[]> {
  return withPyroxeneDatabase(env, "event_data.list", (db) => getAllPyroxeneEventDataInDatabase(db, userId), options);
}

export async function upsertPostgresPyroxeneEventData(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  data: { completed?: boolean; expectedTrials?: number | null },
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  await withPyroxeneDatabase(
    env,
    "event_data.upsert",
    (db) => upsertPyroxeneEventDataInDatabase(db, userId, eventUid, data),
    options,
  );
}

export async function deletePostgresPyroxeneEventData(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  await withPyroxeneDatabase(
    env,
    "event_data.delete",
    async (db) => {
      await db
        .delete(pgPyroxeneEventDataTable)
        .where(and(eq(pgPyroxeneEventDataTable.userId, userId), eq(pgPyroxeneEventDataTable.eventUid, eventUid)));
    },
    options,
  );
}

export async function getPostgresPyroxeneUserState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<PostgresPyroxeneUserState> {
  return withPyroxeneDatabase(
    env,
    "user_state",
    async (db) => {
      const [latestResources, plannerOptions, eventData, timelineItems, collectedSourceKeys] = await Promise.all([
        getLatestPyroxeneOwnedResourceInDatabase(db, userId),
        getPyroxenePlannerOptionsInDatabase(db, userId),
        getAllPyroxeneEventDataInDatabase(db, userId),
        getPyroxeneTimelineItemsInDatabase(db, userId),
        getCollectedSourceKeysInDatabase(db, userId),
      ]);
      return {
        latestResources,
        options: plannerOptions,
        eventData,
        timelineItems,
        collectedSourceKeys,
      };
    },
    options,
  );
}
