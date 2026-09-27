import { and, asc, desc, eq, isNull, like, or } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { withPlannerStateUpdate } from "~/db/postgres/planner-states";
import type { PlannerStateDocumentV1 } from "~/domain/planner-state";
import {
  normalizePyroxenePlannerOptions,
  type PyroxenePlannerOptions,
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
  userId: number;
  eventUid: string;
  completed: boolean;
  expectedTrials: number | null;
};

type PlannerStateResource = Omit<PyroxeneOwnedResource, "userId">;
type PlannerStateTimelineRecord = Omit<PyroxeneTimelineItem, "userId">;

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

export function sortPlannerStateTimelineRecords<T extends { eventAt: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => left.eventAt.localeCompare(right.eventAt));
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string): string {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function toPlannerStateResource(resource: typeof pgPyroxeneOwnedResourcesTable.$inferSelect): PlannerStateResource {
  return {
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
    repeatIntervalDays: item.repeatIntervalDays ?? null,
    repeatCount: item.repeatCount ?? null,
    autoRepurchase: item.autoRepurchase ?? false,
    description: item.description,
    pyroxeneDelta: item.pyroxeneDelta,
    oneTimeTicketDelta: item.oneTimeTicketDelta,
    tenTimeTicketDelta: item.tenTimeTicketDelta,
  };
}

function toPlannerStateTimelineRecord(
  item: typeof pgPyroxeneTimelineItemsTable.$inferSelect,
): PlannerStateTimelineRecord {
  const model = toTimelineItemModel(item);
  return {
    uid: model.uid,
    eventAt: model.eventAt,
    source: model.source,
    repeatType: model.repeatType,
    repeatIntervalDays: model.repeatIntervalDays,
    repeatCount: model.repeatCount,
    autoRepurchase: model.autoRepurchase,
    description: model.description,
    pyroxeneDelta: model.pyroxeneDelta,
    oneTimeTicketDelta: model.oneTimeTicketDelta,
    tenTimeTicketDelta: model.tenTimeTicketDelta,
  };
}

function withTimelineRecords(
  document: PlannerStateDocumentV1,
  records: readonly PlannerStateTimelineRecord[],
): PlannerStateDocumentV1 {
  return {
    ...document,
    pyroxene: {
      ...document.pyroxene,
      records: sortPlannerStateTimelineRecords(records),
    },
  };
}

async function withLegacyTimelineOrder(
  db: PyroxeneDatabase,
  userId: number,
  document: PlannerStateDocumentV1,
): Promise<PlannerStateDocumentV1> {
  const legacyRows = await db
    .select({ uid: pgPyroxeneTimelineItemsTable.uid })
    .from(pgPyroxeneTimelineItemsTable)
    .where(eq(pgPyroxeneTimelineItemsTable.userId, userId))
    .orderBy(asc(pgPyroxeneTimelineItemsTable.eventAt), asc(pgPyroxeneTimelineItemsTable.id));
  const recordsByUid = new Map(document.pyroxene.records.map((record) => [record.uid, record]));
  const orderedRecords = legacyRows.map(({ uid }) => {
    const record = recordsByUid.get(uid);
    if (!record) throw new Error("Planner state timeline rows differ from legacy rows");
    return record;
  });
  if (orderedRecords.length !== recordsByUid.size) {
    throw new Error("Planner state timeline rows differ from legacy rows");
  }
  return withTimelineRecords(document, orderedRecords);
}

function mergeTimelineRecords(
  document: PlannerStateDocumentV1,
  records: readonly PlannerStateTimelineRecord[],
): PlannerStateDocumentV1 {
  const byUid = new Map(document.pyroxene.records.map((record) => [record.uid, record]));
  for (const record of records) byUid.set(record.uid, record);
  return withTimelineRecords(document, [...byUid.values()]);
}

function replaceTimelineRecords(
  document: PlannerStateDocumentV1,
  replace: (record: PlannerStateTimelineRecord) => boolean,
  records: readonly PlannerStateTimelineRecord[],
): PlannerStateDocumentV1 {
  const kept = document.pyroxene.records.filter((record) => !replace(record));
  return mergeTimelineRecords(withTimelineRecords(document, kept), records);
}

function removeTimelineItem(document: PlannerStateDocumentV1, uid: string): PlannerStateDocumentV1 {
  const baseUid = extractPyroxeneTimelineBaseUid(uid);
  return withTimelineRecords(
    document,
    document.pyroxene.records.filter((record) => record.uid !== baseUid && !record.uid.startsWith(baseUid)),
  );
}

function withCollectedSourceKeys(
  document: PlannerStateDocumentV1,
  update: (keys: Set<string>) => void,
): PlannerStateDocumentV1 {
  const keys = new Set(document.pyroxene.collectedSourceKeys);
  update(keys);
  return {
    ...document,
    pyroxene: { ...document.pyroxene, collectedSourceKeys: [...keys].sort() },
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

export async function createPyroxeneOwnedResourceInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
  options: OwnedResourceWriteOptions = {},
): Promise<PlannerStateResource | null> {
  const values = {
    uid: options.uid ?? nanoid(8),
    userId,
    inputAt: toDate(options.inputAt ?? nowUtcIso()),
    pyroxene: resources.pyroxene,
    oneTimeTicket: resources.oneTimeTicket,
    tenTimeTicket: resources.tenTimeTicket,
  };
  const insert = db.insert(pgPyroxeneOwnedResourcesTable).values(values);
  const rows = options.ignoreUidConflict
    ? await insert.onConflictDoNothing({ target: pgPyroxeneOwnedResourcesTable.uid }).returning()
    : await insert.returning();
  return rows[0] ? toPlannerStateResource(rows[0]) : null;
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const inserted = await createPyroxeneOwnedResourceInDatabase(tx, userId, resources, options);
          const current = document.pyroxene.resources;
          const next = inserted && (!current || inserted.inputAt >= current.inputAt) ? inserted : current;
          return {
            document: { ...document, pyroxene: { ...document.pyroxene, resources: next } },
            result: undefined,
          };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const removed = await tx
            .delete(pgPyroxeneOwnedResourcesTable)
            .where(and(eq(pgPyroxeneOwnedResourcesTable.userId, userId), eq(pgPyroxeneOwnedResourcesTable.uid, uid)))
            .returning({ id: pgPyroxeneOwnedResourcesTable.id });
          if (removed.length === 0) return { document, result: undefined };
          const [latest] = await tx
            .select()
            .from(pgPyroxeneOwnedResourcesTable)
            .where(eq(pgPyroxeneOwnedResourcesTable.userId, userId))
            .orderBy(desc(pgPyroxeneOwnedResourcesTable.inputAt), desc(pgPyroxeneOwnedResourcesTable.id))
            .limit(1);
          return {
            document: {
              ...document,
              pyroxene: { ...document.pyroxene, resources: latest ? toPlannerStateResource(latest) : null },
            },
            result: undefined,
          };
        },
        { retryable: true },
      ),
    options,
  );
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

export async function upsertPostgresCollectedSource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return withPyroxeneDatabase(
    env,
    "collected_sources.upsert",
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await upsertCollectedSourceInDatabase(tx, userId, sourceKey);
          return {
            document: withCollectedSourceKeys(document, (keys) => keys.add(sourceKey)),
            result: undefined,
          };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await ensureCollectedSourceInDatabase(tx, userId, sourceKey);
          return {
            document: withCollectedSourceKeys(document, (keys) => keys.add(sourceKey)),
            result: undefined,
          };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await upsertCollectedSourcesInDatabase(tx, userId, uniqueSourceKeys);
          return {
            document: withCollectedSourceKeys(document, (keys) => {
              for (const sourceKey of uniqueSourceKeys) keys.add(sourceKey);
            }),
            result: undefined,
          };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await tx
            .delete(pgPyroxeneCollectedSourcesTable)
            .where(
              and(
                eq(pgPyroxeneCollectedSourcesTable.userId, userId),
                eq(pgPyroxeneCollectedSourcesTable.sourceKey, sourceKey),
              ),
            );
          return {
            document: withCollectedSourceKeys(document, (keys) => keys.delete(sourceKey)),
            result: undefined,
          };
        },
        { retryable: true },
      ),
    options,
  );
}

export async function createBuyPyroxeneInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  date: Date | string,
  quantity: number,
  options: TimelineWriteOptions & { repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number } = {},
): Promise<PlannerStateTimelineRecord[]> {
  const { repeatType, monthlyCount } = options;
  if (repeatType !== undefined && repeatType !== "fixed_days" && repeatType !== "monthly_first") {
    throw new Error("Invalid Pyroxene purchase repeatType");
  }
  if (monthlyCount !== undefined && (!Number.isInteger(monthlyCount) || monthlyCount < 1)) {
    throw new Error("Invalid Pyroxene purchase monthlyCount");
  }
  const uid = options.uid ?? nanoid(8);
  const normalizedRepeatType = repeatType ?? "fixed_days";
  const normalizedMonthlyCount = monthlyCount ?? 1;
  const insert = db.insert(pgPyroxeneTimelineItemsTable).values({
    uid,
    userId,
    eventAt: toDate(normalizePyroxeneTimelineEventAt(date)),
    source: "buy",
    repeatType: normalizedRepeatType === "fixed_days" ? null : normalizedRepeatType,
    description: "청휘석 구매",
    pyroxeneDelta: quantity * normalizedMonthlyCount,
    oneTimeTicketDelta: 0,
    tenTimeTicketDelta: 0,
  });
  const rows = options.ignoreUidConflict
    ? await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid }).returning()
    : await insert.returning();
  return rows.map(toPlannerStateTimelineRecord);
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
): Promise<PlannerStateTimelineRecord[]> {
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
  const rows = ignoreUidConflict
    ? await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid }).returning()
    : await insert.returning();
  return rows.map(toPlannerStateTimelineRecord);
}

export async function createPyroxeneApPackageInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  startDate: Date | string,
  autoRepurchase = false,
  uid = nanoid(8),
  ignoreUidConflict = false,
): Promise<PlannerStateTimelineRecord[]> {
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
  const rows = ignoreUidConflict
    ? await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid }).returning()
    : await insert.returning();
  return rows.map(toPlannerStateTimelineRecord);
}

export async function createAttendanceInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  startDate: Date | string,
  uid = nanoid(8),
  ignoreUidConflict = false,
): Promise<PlannerStateTimelineRecord[]> {
  const startAt = new Date(normalizePyroxeneTimelineEventAt(startDate));
  return db.transaction(async (tx) => {
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
    const rows = ignoreUidConflict
      ? await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid }).returning()
      : await insert.returning();
    return rows.map(toPlannerStateTimelineRecord);
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
): Promise<PlannerStateTimelineRecord[]> {
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
  const rows = ignoreUidConflict
    ? await insert.onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid }).returning()
    : await insert.returning();
  return rows.map(toPlannerStateTimelineRecord);
}

export async function updatePyroxeneOneOffTimelineItemInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  uid: string,
  input: {
    source: "buy" | "other";
    date: Date | string;
    description: string;
    pyroxeneDelta: number;
    oneTimeTicketDelta: number;
    tenTimeTicketDelta: number;
  },
): Promise<PlannerStateTimelineRecord | null> {
  const rows = await db
    .update(pgPyroxeneTimelineItemsTable)
    .set({
      eventAt: toDate(normalizePyroxeneTimelineEventAt(input.date)),
      description: input.description,
      pyroxeneDelta: input.pyroxeneDelta,
      oneTimeTicketDelta: input.oneTimeTicketDelta,
      tenTimeTicketDelta: input.tenTimeTicketDelta,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pgPyroxeneTimelineItemsTable.userId, userId),
        eq(pgPyroxeneTimelineItemsTable.uid, uid),
        eq(pgPyroxeneTimelineItemsTable.source, input.source),
        isNull(pgPyroxeneTimelineItemsTable.repeatType),
        isNull(pgPyroxeneTimelineItemsTable.repeatIntervalDays),
        isNull(pgPyroxeneTimelineItemsTable.repeatCount),
        eq(pgPyroxeneTimelineItemsTable.autoRepurchase, false),
      ),
    )
    .returning();
  return rows[0] ? toPlannerStateTimelineRecord(rows[0]) : null;
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const records = await createBuyPyroxeneInDatabase(tx, userId, date, quantity, options);
          return { document: mergeTimelineRecords(document, records), result: undefined };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await deletePyroxeneTimelineItemInDatabase(tx, userId, uid);
          return { document: removeTimelineItem(document, uid), result: undefined };
        },
        { retryable: true },
      ),
    options,
  );
}

export async function updatePostgresPyroxeneOneOffTimelineItem(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  uid: string,
  input: {
    source: "buy" | "other";
    date: Date | string;
    description: string;
    pyroxeneDelta: number;
    oneTimeTicketDelta: number;
    tenTimeTicketDelta: number;
  },
  options: PostgresPyroxeneOptions = {},
): Promise<boolean> {
  return withPyroxeneDatabase(
    env,
    "timeline_items.update_one_off",
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const updated = await updatePyroxeneOneOffTimelineItemInDatabase(tx, userId, uid, input);
          if (!updated) return { document, result: false };
          const merged = mergeTimelineRecords(document, [updated]);
          return {
            document: await withLegacyTimelineOrder(tx, userId, merged),
            result: true,
          };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const records = await createPyroxeneMonthlyPackageInDatabase(
            tx,
            userId,
            startDate,
            packageType,
            autoRepurchase,
            uid,
          );
          return { document: mergeTimelineRecords(document, records), result: undefined };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const records = await createPyroxeneApPackageInDatabase(tx, userId, startDate, autoRepurchase, uid);
          return { document: mergeTimelineRecords(document, records), result: undefined };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const records = await createAttendanceInDatabase(tx, userId, startDate, uid);
          return {
            document: replaceTimelineRecords(document, (record) => record.source === "attendance", records),
            result: undefined,
          };
        },
        { retryable: true },
      ),
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
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const records = await createOtherPyroxeneGainInDatabase(
            tx,
            userId,
            date,
            pyroxene,
            oneTimeTicket,
            tenTimeTicket,
            description,
            uid,
          );
          return { document: mergeTimelineRecords(document, records), result: undefined };
        },
        { retryable: true },
      ),
    options,
  );
}

export async function upsertPyroxenePlannerOptionsInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  options: PyroxenePlannerOptions,
): Promise<void> {
  const normalizedOptions = normalizePyroxenePlannerOptions(options);
  const optionsJson = JSON.stringify(normalizedOptions);
  const updatedAt = toDate(nowUtcIso());
  await db
    .insert(pgPyroxenePlannerOptionsTable)
    .values({ userId, options: optionsJson, updatedAt })
    .onConflictDoUpdate({
      target: pgPyroxenePlannerOptionsTable.userId,
      set: { options: optionsJson, updatedAt },
    });
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const normalizedOptions = normalizePyroxenePlannerOptions(options);
          await upsertPyroxenePlannerOptionsInDatabase(tx, userId, normalizedOptions);
          return {
            document: {
              ...document,
              pyroxene: { ...document.pyroxene, options: normalizedOptions },
            },
            result: undefined,
          };
        },
        { retryable: true },
      ),
    repositoryOptions,
  );
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await upsertPyroxeneEventDataInDatabase(tx, userId, eventUid, data);
          const current = document.pyroxene.eventData[eventUid] ?? { completed: false, expectedTrials: null };
          return {
            document: {
              ...document,
              pyroxene: {
                ...document.pyroxene,
                eventData: {
                  ...document.pyroxene.eventData,
                  [eventUid]: {
                    completed: data.completed ?? current.completed,
                    expectedTrials: data.expectedTrials !== undefined ? data.expectedTrials : current.expectedTrials,
                  },
                },
              },
            },
            result: undefined,
          };
        },
        { retryable: true },
      ),
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
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await tx
            .delete(pgPyroxeneEventDataTable)
            .where(and(eq(pgPyroxeneEventDataTable.userId, userId), eq(pgPyroxeneEventDataTable.eventUid, eventUid)));
          const eventData = { ...document.pyroxene.eventData };
          delete eventData[eventUid];
          return {
            document: { ...document, pyroxene: { ...document.pyroxene, eventData } },
            result: undefined,
          };
        },
        { retryable: true },
      ),
    options,
  );
}
