import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { withPlannerStateUpdate } from "~/db/postgres/planner-states";
import { type PlannerStateDocumentV1, sortPlannerStateTimelineRecords } from "~/domain/planner-state";
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

type PlannerStateTimelineRecord = Omit<PyroxeneTimelineItem, "userId">;

export type PostgresPyroxeneUserState = {
  latestResources: PyroxeneOwnedResource | null;
  options: PyroxenePlannerOptions;
  eventData: PyroxeneEventData[];
  timelineItems: PyroxeneTimelineItem[];
  collectedSourceKeys: Set<string>;
};

type TimelineRecordInput = Pick<PlannerStateTimelineRecord, "uid" | "source" | "description"> &
  Partial<Omit<PlannerStateTimelineRecord, "uid" | "source" | "description" | "eventAt">> & {
    eventAt: Date | string;
  };

function timelineEventAt(date: Date | string): string {
  return normalizeInstant(normalizePyroxeneTimelineEventAt(date));
}

function timelineRecord(input: TimelineRecordInput): PlannerStateTimelineRecord {
  return {
    uid: input.uid,
    eventAt: timelineEventAt(input.eventAt),
    source: input.source,
    repeatType: input.repeatType ?? "fixed_days",
    repeatIntervalDays: input.repeatIntervalDays ?? null,
    repeatCount: input.repeatCount ?? null,
    autoRepurchase: input.autoRepurchase ?? false,
    description: input.description,
    pyroxeneDelta: input.pyroxeneDelta ?? 0,
    oneTimeTicketDelta: input.oneTimeTicketDelta ?? 0,
    tenTimeTicketDelta: input.tenTimeTicketDelta ?? 0,
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

function addTimelineRecords(
  document: PlannerStateDocumentV1,
  records: readonly PlannerStateTimelineRecord[],
): PlannerStateDocumentV1 {
  const existingUids = new Set(document.pyroxene.records.map((record) => record.uid));
  for (const record of records) {
    if (existingUids.has(record.uid)) throw new Error("Duplicate Pyroxene timeline uid");
    existingUids.add(record.uid);
  }
  return withTimelineRecords(document, [...document.pyroxene.records, ...records]);
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

function withPlannerOptions(document: PlannerStateDocumentV1, options: PyroxenePlannerOptions): PlannerStateDocumentV1 {
  return { ...document, pyroxene: { ...document.pyroxene, options: normalizePyroxenePlannerOptions(options) } };
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

function updatePyroxenePlannerState<T>(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  queryName: string,
  update: (document: PlannerStateDocumentV1) => { document: PlannerStateDocumentV1; result: T },
  options: PostgresPyroxeneOptions = {},
): Promise<T> {
  return withPyroxeneDatabase(
    env,
    queryName,
    (db) => withPlannerStateUpdate(db, userId, async (_tx, document) => update(document), { retryable: true }),
    options,
  );
}

function updatePyroxenePlannerDocument(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  queryName: string,
  update: (document: PlannerStateDocumentV1) => PlannerStateDocumentV1,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerState(
    env,
    userId,
    queryName,
    (document) => ({ document: update(document), result: undefined }),
    options,
  );
}

/** Keeps the latest owned-resource snapshot; an older input never replaces a newer one. */
export function withPyroxeneOwnedResource(
  document: PlannerStateDocumentV1,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
  inputAt: string = nowUtcIso(),
): PlannerStateDocumentV1 {
  const next = {
    inputAt: normalizeInstant(inputAt),
    pyroxene: resources.pyroxene,
    oneTimeTicket: resources.oneTimeTicket,
    tenTimeTicket: resources.tenTimeTicket,
  };
  const current = document.pyroxene.resources;
  if (current && next.inputAt < current.inputAt) return document;
  return { ...document, pyroxene: { ...document.pyroxene, resources: next } };
}

export function createPostgresPyroxeneOwnedResource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
  options: { inputAt?: string } & PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "owned_resources.create",
    (document) => withPyroxeneOwnedResource(document, resources, options.inputAt),
    options,
  );
}

export function upsertPostgresCollectedSource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "collected_sources.upsert",
    (document) => withCollectedSourceKeys(document, (keys) => keys.add(sourceKey)),
    options,
  );
}

export function ensurePostgresCollectedSource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "collected_sources.ensure",
    (document) => withCollectedSourceKeys(document, (keys) => keys.add(sourceKey)),
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
  await updatePyroxenePlannerDocument(
    env,
    userId,
    "collected_sources.bulk_upsert",
    (document) =>
      withCollectedSourceKeys(document, (keys) => {
        for (const sourceKey of uniqueSourceKeys) keys.add(sourceKey);
      }),
    options,
  );
}

export function deletePostgresCollectedSource(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  sourceKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "collected_sources.delete",
    (document) => withCollectedSourceKeys(document, (keys) => keys.delete(sourceKey)),
    options,
  );
}

export async function createPostgresBuyPyroxene(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  date: Date | string,
  quantity: number,
  options: { uid?: string; repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number } & PostgresPyroxeneOptions = {},
): Promise<void> {
  const { repeatType, monthlyCount } = options;
  if (repeatType !== undefined && repeatType !== "fixed_days" && repeatType !== "monthly_first") {
    throw new Error("Invalid Pyroxene purchase repeatType");
  }
  if (monthlyCount !== undefined && (!Number.isInteger(monthlyCount) || monthlyCount < 1)) {
    throw new Error("Invalid Pyroxene purchase monthlyCount");
  }
  const record = timelineRecord({
    uid: options.uid ?? nanoid(8),
    eventAt: date,
    source: "buy",
    repeatType: repeatType ?? "fixed_days",
    description: "청휘석 구매",
    pyroxeneDelta: quantity * (monthlyCount ?? 1),
  });
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "timeline_items.buy",
    (document) => addTimelineRecords(document, [record]),
    options,
  );
}

export function deletePostgresPyroxeneTimelineItem(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  uid: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "timeline_items.delete",
    (document) => removeTimelineItem(document, uid),
    options,
  );
}

/** Edits a non-repeating purchase or other gain; repeating and package records are left unchanged. */
export function updatePostgresPyroxeneOneOffTimelineItem(
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
  return updatePyroxenePlannerState(
    env,
    userId,
    "timeline_items.update_one_off",
    (document) => {
      const isEditable = (record: PlannerStateTimelineRecord) =>
        record.uid === uid &&
        record.source === input.source &&
        record.repeatType === "fixed_days" &&
        record.repeatIntervalDays === null &&
        record.repeatCount === null &&
        !record.autoRepurchase;
      if (!document.pyroxene.records.some(isEditable)) return { document, result: false };
      const records = document.pyroxene.records.map((record) =>
        isEditable(record)
          ? {
              ...record,
              eventAt: timelineEventAt(input.date),
              description: input.description,
              pyroxeneDelta: input.pyroxeneDelta,
              oneTimeTicketDelta: input.oneTimeTicketDelta,
              tenTimeTicketDelta: input.tenTimeTicketDelta,
            }
          : record,
      );
      return { document: withTimelineRecords(document, records), result: true };
    },
    options,
  );
}

export function createPostgresPyroxeneMonthlyPackage(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  startDate: Date | string,
  packageType: PyroxeneMonthlyPackageType,
  autoRepurchase = false,
  uid = nanoid(8),
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  const { name, oneTime, daily, repurchaseIntervalDays } = PYROXENE_MONTHLY_PACKAGE_CONFIG[packageType];
  const records = [
    timelineRecord({
      uid: `${uid}::onetime`,
      eventAt: startDate,
      source: "package_onetime",
      repeatIntervalDays: autoRepurchase ? repurchaseIntervalDays : null,
      autoRepurchase,
      description: `${name} (초회)`,
      pyroxeneDelta: oneTime,
    }),
    timelineRecord({
      uid: `${uid}::daily`,
      eventAt: startDate,
      source: "package_daily",
      repeatIntervalDays: PYROXENE_PACKAGE_DAILY_REPEAT_INTERVAL_DAYS,
      repeatCount: autoRepurchase ? null : PYROXENE_PACKAGE_DAILY_REPEAT_COUNT,
      autoRepurchase,
      description: `${name} (일간)`,
      pyroxeneDelta: daily,
    }),
  ];
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "timeline_items.monthly_package",
    (document) => addTimelineRecords(document, records),
    options,
  );
}

export function createPostgresPyroxeneApPackage(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  startDate: Date | string,
  autoRepurchase = false,
  uid = nanoid(8),
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  const record = timelineRecord({
    uid: `${uid}::ap`,
    eventAt: startDate,
    source: "package_ap",
    repeatIntervalDays: autoRepurchase ? PYROXENE_AP_PACKAGE_CONFIG.repurchaseIntervalDays : null,
    autoRepurchase,
    description: `${PYROXENE_AP_PACKAGE_CONFIG.name} (초회)`,
    pyroxeneDelta: PYROXENE_AP_PACKAGE_CONFIG.oneTime,
  });
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "timeline_items.ap_package",
    (document) => addTimelineRecords(document, [record]),
    options,
  );
}

/** Replaces the user's attendance cycle; only one attendance cycle is kept at a time. */
export function createPostgresAttendance(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  startDate: Date | string,
  uid = nanoid(8),
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  const startAt = new Date(normalizePyroxeneTimelineEventAt(startDate)).getTime();
  const records = PYROXENE_ATTENDANCE_CONFIG.map(({ day, pyroxene }) =>
    timelineRecord({
      uid: `${uid}::${day}`,
      eventAt: new Date(startAt + (day - 1) * 24 * 60 * 60 * 1000),
      source: "attendance",
      repeatIntervalDays: PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
      description: `출석 ${day}일차`,
      pyroxeneDelta: pyroxene,
    }),
  );
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "timeline_items.attendance",
    (document) =>
      addTimelineRecords(
        withTimelineRecords(
          document,
          document.pyroxene.records.filter((record) => record.source !== "attendance"),
        ),
        records,
      ),
    options,
  );
}

export function createPostgresOtherPyroxeneGain(
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
  const record = timelineRecord({
    uid,
    eventAt: date,
    source: "other",
    description,
    pyroxeneDelta: pyroxene,
    oneTimeTicketDelta: oneTimeTicket,
    tenTimeTicketDelta: tenTimeTicket,
  });
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "timeline_items.other",
    (document) => addTimelineRecords(document, [record]),
    options,
  );
}

export function upsertPostgresPyroxenePlannerOptions(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PyroxenePlannerOptions,
  repositoryOptions: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "planner_options.upsert",
    (document) => withPlannerOptions(document, options),
    repositoryOptions,
  );
}

export function updatePostgresPyroxenePlannerOptions<T>(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  update: (current: PyroxenePlannerOptions) => { options: PyroxenePlannerOptions; result: T },
  repositoryOptions: PostgresPyroxeneOptions = {},
): Promise<T> {
  return updatePyroxenePlannerState(
    env,
    userId,
    "planner_options.update",
    (document) => {
      const { options, result } = update(document.pyroxene.options);
      return { document: withPlannerOptions(document, options), result };
    },
    repositoryOptions,
  );
}

export function upsertPostgresPyroxeneEventData(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  data: { completed?: boolean; expectedTrials?: number | null },
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "event_data.upsert",
    (document) => {
      const current = document.pyroxene.eventData[eventUid] ?? { completed: false, expectedTrials: null };
      return {
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
      };
    },
    options,
  );
}

export function deletePostgresPyroxeneEventData(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return updatePyroxenePlannerDocument(
    env,
    userId,
    "event_data.delete",
    (document) => {
      const eventData = { ...document.pyroxene.eventData };
      delete eventData[eventUid];
      return { ...document, pyroxene: { ...document.pyroxene, eventData } };
    },
    options,
  );
}
