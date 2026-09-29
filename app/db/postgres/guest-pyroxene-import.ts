import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid/non-secure";
import { upsertEventShopStateInDatabase } from "~/db/postgres/event-shop-state";
import { PlannerStateRevisionConflictError, withPlannerStateUpdate } from "~/db/postgres/planner-states";
import {
  createPyroxeneOwnedResourceInDatabase,
  ensureCollectedSourceInDatabase,
  type PostgresPyroxeneOptions,
  type PyroxeneDatabase,
  upsertPyroxeneEventDataInDatabase,
  upsertPyroxenePlannerOptionsInDatabase,
  withPyroxeneDatabase,
} from "~/db/postgres/pyroxene-planner";
import { type EventShopState, eventShopStatesEqual } from "~/domain/event-shop-state";
import type { PlannerStateDocumentV1 } from "~/domain/planner-state";
import { normalizePyroxenePlannerOptions, type PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { nowUtcIso } from "~/lib/date-time";
import { pgPyroxeneGuestImportItemsTable, pgPyroxeneTimelineItemsTable } from "./schema";

export type GuestImportItemType =
  | "resources"
  | "options"
  | "record"
  | "source"
  | "event"
  | "eventShop"
  | "ap"
  | "favorite";

export type GuestImportItem = {
  type: GuestImportItemType;
  key: string;
};

export type GuestPlannerImportSelection = {
  resources: boolean;
  options: boolean;
  recordUids: string[];
  sourceKeys: string[];
  eventUids: string[];
  eventShopUids: string[];
  ap: boolean;
};

export type GuestPlannerImportSource = {
  sourceId: string;
  datasetId: string;
  document: PlannerStateDocumentV1;
  selection: GuestPlannerImportSelection;
};

export type GuestPlannerImportItem = GuestImportItem & { datasetId: string; sourceId: string };

export type GuestPlannerImportResult = {
  verified: GuestPlannerImportItem[];
  failed: GuestPlannerImportItem[];
  revisionConflict: boolean;
};

export type GuestPlannerImportPlan = {
  sources: GuestPlannerImportSource[];
  favorites: Array<{
    sourceId: string;
    datasetId: string;
    itemKey: string;
    run: () => Promise<void>;
  }>;
};

type ImportedTimelineRecord = PlannerStateDocumentV1["pyroxene"]["records"][number];
type ImportedResource = PlannerStateDocumentV1["pyroxene"]["resources"];

function withImportedResource(
  document: PlannerStateDocumentV1,
  resource: NonNullable<ImportedResource>,
): PlannerStateDocumentV1 {
  return { ...document, pyroxene: { ...document.pyroxene, resources: resource } };
}

function withImportedSourceKey(document: PlannerStateDocumentV1, sourceKey: string): PlannerStateDocumentV1 {
  return {
    ...document,
    pyroxene: {
      ...document.pyroxene,
      collectedSourceKeys: [...new Set([...document.pyroxene.collectedSourceKeys, sourceKey])].sort(),
    },
  };
}

function withImportedOptions(
  document: PlannerStateDocumentV1,
  options: PyroxenePlannerOptions,
): PlannerStateDocumentV1 {
  return {
    ...document,
    pyroxene: { ...document.pyroxene, options: normalizePyroxenePlannerOptions(options) },
  };
}

function withImportedEventShop(
  document: PlannerStateDocumentV1,
  eventUid: string,
  state: EventShopState,
): PlannerStateDocumentV1 {
  return { ...document, eventShops: { ...document.eventShops, [eventUid]: state } };
}

function importedTimelineUid(userId: number, datasetId: string, baseUid: string, uid: string): string {
  const suffix = uid.slice(baseUid.length);
  return `${deterministicImportUid(userId, datasetId, baseUid)}${suffix}`;
}

async function importGuestTimelineRecordsInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  datasetId: string,
  records: readonly ImportedTimelineRecord[],
): Promise<ImportedTimelineRecord[]> {
  if (records.length === 0) return [];
  const importedRecords = records.map((record) => {
    const baseUid = record.uid.split("::", 1)[0];
    if (!baseUid) throw new Error("Invalid guest planner timeline group");
    return { ...record, uid: importedTimelineUid(userId, datasetId, baseUid, record.uid) };
  });
  const importedUids = importedRecords.map(({ uid }) => uid);
  const importedBaseUids = new Set(importedUids.map((uid) => uid.split("::", 1)[0]));

  if (records.some((record) => record.source === "attendance")) {
    await db
      .delete(pgPyroxeneTimelineItemsTable)
      .where(
        and(eq(pgPyroxeneTimelineItemsTable.userId, userId), eq(pgPyroxeneTimelineItemsTable.source, "attendance")),
      );
  }

  const existingRows = await db
    .select({ uid: pgPyroxeneTimelineItemsTable.uid })
    .from(pgPyroxeneTimelineItemsTable)
    .where(eq(pgPyroxeneTimelineItemsTable.userId, userId));
  const desiredUids = new Set(importedUids);
  const staleUids = existingRows
    .map(({ uid }) => uid)
    .filter((uid) => {
      const baseUid = uid.split("::", 1)[0];
      return importedBaseUids.has(baseUid) && !desiredUids.has(uid);
    });
  if (staleUids.length > 0) {
    await db
      .delete(pgPyroxeneTimelineItemsTable)
      .where(
        and(eq(pgPyroxeneTimelineItemsTable.userId, userId), inArray(pgPyroxeneTimelineItemsTable.uid, staleUids)),
      );
  }

  const inserted = await db
    .insert(pgPyroxeneTimelineItemsTable)
    .values(
      importedRecords.map((record) => ({
        uid: record.uid,
        userId,
        eventAt: new Date(record.eventAt),
        source: record.source,
        repeatType: record.repeatType,
        repeatIntervalDays: record.repeatIntervalDays,
        repeatCount: record.repeatCount,
        autoRepurchase: record.autoRepurchase,
        description: record.description,
        pyroxeneDelta: record.pyroxeneDelta,
        oneTimeTicketDelta: record.oneTimeTicketDelta,
        tenTimeTicketDelta: record.tenTimeTicketDelta,
      })),
    )
    .onConflictDoUpdate({
      target: pgPyroxeneTimelineItemsTable.uid,
      set: {
        eventAt: sql`excluded.event_at`,
        source: sql`excluded.source`,
        repeatType: sql`excluded.repeat_type`,
        repeatIntervalDays: sql`excluded.repeat_interval_days`,
        repeatCount: sql`excluded.repeat_count`,
        autoRepurchase: sql`excluded.auto_repurchase`,
        description: sql`excluded.description`,
        pyroxeneDelta: sql`excluded.pyroxene_delta`,
        oneTimeTicketDelta: sql`excluded.one_time_ticket_delta`,
        tenTimeTicketDelta: sql`excluded.ten_time_ticket_delta`,
      },
    })
    .returning();

  return inserted.map((row) => ({
    uid: row.uid,
    eventAt: row.eventAt.toISOString(),
    source: row.source as ImportedTimelineRecord["source"],
    repeatType: row.repeatType as ImportedTimelineRecord["repeatType"],
    repeatIntervalDays: row.repeatIntervalDays,
    repeatCount: row.repeatCount,
    autoRepurchase: row.autoRepurchase,
    description: row.description,
    pyroxeneDelta: row.pyroxeneDelta,
    oneTimeTicketDelta: row.oneTimeTicketDelta,
    tenTimeTicketDelta: row.tenTimeTicketDelta,
  }));
}

/**
 * PostgreSQL receipt keys are versioned UTF-8 bytes encoded as unpadded
 * RFC 4648 base64url. Keep this boundary stable so snapshot transfer and
 * parity checks can use the same representation without changing the raw
 * in-memory receipt key contract.
 */
export const PYROXENE_RECEIPT_KEY_VERSION = "v1" as const;
export const PYROXENE_RECEIPT_KEY_PREFIX = `${PYROXENE_RECEIPT_KEY_VERSION}:` as const;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function encodePostgresPyroxeneReceiptItemKey(itemKey: string): string {
  return `${PYROXENE_RECEIPT_KEY_PREFIX}${encodeBase64Url(new TextEncoder().encode(itemKey))}`;
}

function invalidReceiptKeyError(): Error {
  return new Error(`Invalid ${PYROXENE_RECEIPT_KEY_VERSION} PostgreSQL receipt item key`);
}

export function decodePostgresPyroxeneReceiptItemKey(storedKey: string): string {
  if (!storedKey.startsWith(PYROXENE_RECEIPT_KEY_PREFIX)) {
    const version = storedKey.includes(":") ? storedKey.slice(0, storedKey.indexOf(":") + 1) : "<missing>";
    throw new Error(`Unsupported PostgreSQL receipt item key version: ${version}`);
  }

  const encoded = storedKey.slice(PYROXENE_RECEIPT_KEY_PREFIX.length);
  if (!/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1) {
    throw invalidReceiptKeyError();
  }

  const padded = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = globalThis.atob(padded);
  } catch {
    throw invalidReceiptKeyError();
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  let itemKey: string;
  try {
    itemKey = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidReceiptKeyError();
  }

  if (encodePostgresPyroxeneReceiptItemKey(itemKey) !== storedKey) {
    throw invalidReceiptKeyError();
  }
  return itemKey;
}

function deterministicImportUid(userId: number, datasetId: string, recordId: string): string {
  return `guest-${userId}-${datasetId}-${recordId}`;
}

export async function hasPostgresGuestImportReceipt(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  datasetId: string,
  itemType: GuestImportItemType,
  itemKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<boolean> {
  return withPyroxeneDatabase(
    env,
    "guest_import.receipt_exists",
    async (db) => {
      const [row] = await db
        .select({ id: pgPyroxeneGuestImportItemsTable.id })
        .from(pgPyroxeneGuestImportItemsTable)
        .where(
          and(
            eq(pgPyroxeneGuestImportItemsTable.userId, userId),
            eq(pgPyroxeneGuestImportItemsTable.datasetId, datasetId),
            eq(pgPyroxeneGuestImportItemsTable.itemType, itemType),
            eq(pgPyroxeneGuestImportItemsTable.itemKey, encodePostgresPyroxeneReceiptItemKey(itemKey)),
          ),
        )
        .limit(1);
      return Boolean(row);
    },
    options,
  );
}

export async function markPostgresGuestImportReceipt(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  datasetId: string,
  itemType: GuestImportItemType,
  itemKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  await withPyroxeneDatabase(
    env,
    "guest_import.receipt_mark",
    async (db) => {
      await db
        .insert(pgPyroxeneGuestImportItemsTable)
        .values({
          userId,
          datasetId,
          itemType,
          itemKey: encodePostgresPyroxeneReceiptItemKey(itemKey),
          importedAt: new Date(nowUtcIso()),
        })
        .onConflictDoNothing({
          target: [
            pgPyroxeneGuestImportItemsTable.userId,
            pgPyroxeneGuestImportItemsTable.datasetId,
            pgPyroxeneGuestImportItemsTable.itemType,
            pgPyroxeneGuestImportItemsTable.itemKey,
          ],
        });
    },
    options,
  );
}

export async function importGuestResourcesInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  datasetId: string,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number; inputAt?: string },
): Promise<NonNullable<ImportedResource>> {
  const imported = await createPyroxeneOwnedResourceInDatabase(db, userId, resources, {
    uid: `${deterministicImportUid(userId, datasetId, "resources")}-${nanoid(8)}`,
    ...(resources.inputAt ? { inputAt: resources.inputAt } : {}),
  });
  if (!imported) throw new Error("Unable to store selected guest resources");
  return imported;
}

function selectedGuestPlannerItems(source: GuestPlannerImportSource): GuestPlannerImportItem[] {
  const { datasetId, document, selection } = source;
  const recordsByUid = new Map<string, ImportedTimelineRecord[]>();
  for (const record of document.pyroxene.records) {
    const baseUid = record.uid.split("::", 1)[0];
    recordsByUid.set(baseUid, [...(recordsByUid.get(baseUid) ?? []), record]);
  }
  const selected = [
    ...(selection.resources && document.pyroxene.resources ? [{ type: "resources" as const, key: "current" }] : []),
    ...(selection.options ? [{ type: "options" as const, key: "current" }] : []),
    ...selection.recordUids.map((key) => ({ type: "record" as const, key })),
    ...selection.sourceKeys.map((key) => ({ type: "source" as const, key })),
    ...selection.eventUids.map((key) => ({ type: "event" as const, key })),
    ...selection.eventShopUids.map((key) => ({ type: "eventShop" as const, key })),
    ...(selection.ap && document.ap ? [{ type: "ap" as const, key: "current" }] : []),
  ];
  if (selection.recordUids.some((uid) => !recordsByUid.has(uid))) throw new Error("Unknown guest timeline record");
  if (selection.sourceKeys.some((key) => !document.pyroxene.collectedSourceKeys.includes(key))) {
    throw new Error("Unknown guest collected source");
  }
  if (selection.eventUids.some((uid) => !Object.hasOwn(document.pyroxene.eventData, uid))) {
    throw new Error("Unknown guest event data");
  }
  if (selection.eventShopUids.some((uid) => !Object.hasOwn(document.eventShops, uid))) {
    throw new Error("Unknown guest event shop plan");
  }
  if (selection.ap && !document.ap) throw new Error("Missing guest AP planner state");
  return selected.map((item) => ({ ...item, datasetId, sourceId: source.sourceId }));
}

async function withImportedTimelineGroup(
  db: PyroxeneDatabase,
  userId: number,
  document: PlannerStateDocumentV1,
  imported: readonly ImportedTimelineRecord[],
  replaceAttendance: boolean,
): Promise<PlannerStateDocumentV1> {
  const importedBaseUids = new Set(imported.map(({ uid }) => uid.split("::", 1)[0]));
  const byUid = new Map(
    document.pyroxene.records
      .filter(
        (record) =>
          !(
            (replaceAttendance && record.source === "attendance") ||
            importedBaseUids.has(record.uid.split("::", 1)[0])
          ),
      )
      .map((record) => [record.uid, record]),
  );
  for (const record of imported) byUid.set(record.uid, record);
  const timelineRows = await db
    .select({ uid: pgPyroxeneTimelineItemsTable.uid })
    .from(pgPyroxeneTimelineItemsTable)
    .where(eq(pgPyroxeneTimelineItemsTable.userId, userId))
    .orderBy(asc(pgPyroxeneTimelineItemsTable.eventAt), asc(pgPyroxeneTimelineItemsTable.id));
  const orderedRecords = timelineRows.map(({ uid }) => {
    const record = byUid.get(uid);
    if (!record) throw new Error("Planner state timeline rows differ from legacy rows");
    return record;
  });
  if (orderedRecords.length !== byUid.size) throw new Error("Planner state timeline rows differ from legacy rows");
  return {
    ...document,
    pyroxene: { ...document.pyroxene, records: orderedRecords },
  };
}

/** Imports all selected planner sections in one revision-conditional document update. */
export async function runPostgresGuestPlannerImport(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  plan: GuestPlannerImportPlan,
  options: PostgresPyroxeneOptions = {},
): Promise<GuestPlannerImportResult> {
  const selectedBySource = plan.sources.map((source) => ({ source, items: selectedGuestPlannerItems(source) }));
  const selectedItems = selectedBySource.flatMap(({ items }) => items);
  if (selectedItems.length === 0) return { verified: [], failed: [], revisionConflict: false };
  try {
    const verified = await withPyroxeneDatabase(
      env,
      "guest_import.planner_state",
      (db) =>
        withPlannerStateUpdate(
          db,
          userId,
          async (tx, initialDocument) => {
            let document = initialDocument;
            const verifiedItems: GuestPlannerImportItem[] = [];
            const pendingItems: GuestPlannerImportItem[] = [];

            for (const { source, items } of selectedBySource) {
              const pendingForSource = items;
              const pendingRecordUids = new Set(
                pendingForSource.filter((item) => item.type === "record").map(({ key }) => key),
              );
              if (pendingRecordUids.size > 0) {
                const selectedRecords = source.document.pyroxene.records.filter((record) =>
                  pendingRecordUids.has(record.uid.split("::", 1)[0]),
                );
                const imported = await importGuestTimelineRecordsInDatabase(
                  tx,
                  userId,
                  source.datasetId,
                  selectedRecords,
                );
                document = await withImportedTimelineGroup(
                  tx,
                  userId,
                  document,
                  imported,
                  selectedRecords.some((record) => record.source === "attendance"),
                );
              }

              for (const item of pendingForSource) {
                switch (item.type) {
                  case "resources": {
                    const resource = source.document.pyroxene.resources;
                    if (!resource) throw new Error("Missing guest resources");
                    const current = document.pyroxene.resources;
                    if (
                      current &&
                      current.pyroxene === resource.pyroxene &&
                      current.oneTimeTicket === resource.oneTimeTicket &&
                      current.tenTimeTicket === resource.tenTimeTicket
                    ) {
                      document = withImportedResource(document, current);
                      break;
                    }
                    const importTime = nowUtcIso();
                    // A future-dated account row must not stay canonical after this explicit replacement.
                    const inputAt =
                      current && resource.inputAt <= current.inputAt
                        ? new Date(Math.max(Date.parse(importTime), Date.parse(current.inputAt) + 1)).toISOString()
                        : resource.inputAt;
                    const imported = await importGuestResourcesInDatabase(tx, userId, source.datasetId, {
                      ...resource,
                      inputAt,
                    });
                    document = withImportedResource(document, imported);
                    break;
                  }
                  case "options": {
                    const options = normalizePyroxenePlannerOptions(source.document.pyroxene.options);
                    await upsertPyroxenePlannerOptionsInDatabase(tx, userId, options);
                    document = withImportedOptions(document, options);
                    break;
                  }
                  case "record": {
                    break;
                  }
                  case "source":
                    await ensureCollectedSourceInDatabase(tx, userId, item.key);
                    document = withImportedSourceKey(document, item.key);
                    break;
                  case "event": {
                    const eventData = source.document.pyroxene.eventData[item.key];
                    if (!eventData) throw new Error("Missing guest event data");
                    await upsertPyroxeneEventDataInDatabase(tx, userId, item.key, eventData);
                    document = {
                      ...document,
                      pyroxene: {
                        ...document.pyroxene,
                        eventData: { ...document.pyroxene.eventData, [item.key]: eventData },
                      },
                    };
                    break;
                  }
                  case "eventShop": {
                    const state = source.document.eventShops[item.key];
                    if (!state) throw new Error("Missing guest event shop state");
                    if (eventShopStatesEqual(document.eventShops[item.key], state)) break;
                    const normalizedState = await upsertEventShopStateInDatabase(tx, userId, item.key, state);
                    document = withImportedEventShop(document, item.key, normalizedState);
                    break;
                  }
                  case "ap": {
                    if (!source.document.ap) throw new Error("Missing guest AP planner state");
                    document = { ...document, ap: source.document.ap };
                    break;
                  }
                  case "favorite":
                    throw new Error("Favorite imports are handled by the favorite command");
                }
                pendingItems.push(item);
              }
            }

            if (pendingItems.length > 0) {
              await tx
                .insert(pgPyroxeneGuestImportItemsTable)
                .values(
                  pendingItems.map(({ datasetId, type, key }) => ({
                    userId,
                    datasetId,
                    itemType: type,
                    itemKey: encodePostgresPyroxeneReceiptItemKey(key),
                    importedAt: new Date(nowUtcIso()),
                  })),
                )
                .onConflictDoNothing({
                  target: [
                    pgPyroxeneGuestImportItemsTable.userId,
                    pgPyroxeneGuestImportItemsTable.datasetId,
                    pgPyroxeneGuestImportItemsTable.itemType,
                    pgPyroxeneGuestImportItemsTable.itemKey,
                  ],
                });
              verifiedItems.push(...pendingItems);
            }

            return { document, result: verifiedItems };
          },
          { retryable: true },
        ),
      options,
    );
    return { verified, failed: [], revisionConflict: false };
  } catch (error) {
    return {
      verified: [],
      failed: selectedItems,
      revisionConflict: error instanceof PlannerStateRevisionConflictError,
    };
  }
}
