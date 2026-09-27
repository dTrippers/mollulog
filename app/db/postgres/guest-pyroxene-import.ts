import { and, eq, inArray } from "drizzle-orm";
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
import type { EventShopState } from "~/domain/event-shop-state";
import { type PlannerStateDocumentV1, sortPlannerStateTimelineRecords } from "~/domain/planner-state";
import { normalizePyroxenePlannerOptions, type PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { nowUtcIso } from "~/lib/date-time";
import { pgPyroxeneGuestImportItemsTable, pgPyroxeneTimelineItemsTable } from "./schema";

export type GuestImportItemType = "resources" | "options" | "record" | "source" | "event" | "eventShop" | "favorite";

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

function withImportedResource(document: PlannerStateDocumentV1, resource: ImportedResource): PlannerStateDocumentV1 {
  if (!resource || (document.pyroxene.resources && resource.inputAt < document.pyroxene.resources.inputAt)) {
    return document;
  }
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

  if (records.some((record) => record.source === "attendance")) {
    await db
      .delete(pgPyroxeneTimelineItemsTable)
      .where(
        and(eq(pgPyroxeneTimelineItemsTable.userId, userId), eq(pgPyroxeneTimelineItemsTable.source, "attendance")),
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
    .onConflictDoNothing({ target: pgPyroxeneTimelineItemsTable.uid })
    .returning();
  const insertedUids = new Set(inserted.map(({ uid }) => uid));
  const missingUids = importedUids.filter((uid) => !insertedUids.has(uid));
  const existing = missingUids.length
    ? await db
        .select()
        .from(pgPyroxeneTimelineItemsTable)
        .where(
          and(eq(pgPyroxeneTimelineItemsTable.userId, userId), inArray(pgPyroxeneTimelineItemsTable.uid, missingUids)),
        )
    : [];

  return [...inserted, ...existing].map((row) => ({
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

function receiptKey(type: GuestImportItemType, itemKey: string): string {
  return `${type}\u0000${itemKey}`;
}

function deterministicImportUid(userId: number, datasetId: string, recordId: string): string {
  return `guest-${userId}-${datasetId}-${recordId}`;
}

async function getGuestReceiptKeysInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  datasetId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ itemType: pgPyroxeneGuestImportItemsTable.itemType, itemKey: pgPyroxeneGuestImportItemsTable.itemKey })
    .from(pgPyroxeneGuestImportItemsTable)
    .where(
      and(eq(pgPyroxeneGuestImportItemsTable.userId, userId), eq(pgPyroxeneGuestImportItemsTable.datasetId, datasetId)),
    );
  return new Set(
    rows.map((row) =>
      receiptKey(row.itemType as GuestImportItemType, decodePostgresPyroxeneReceiptItemKey(row.itemKey)),
    ),
  );
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
): Promise<ImportedResource> {
  return createPyroxeneOwnedResourceInDatabase(db, userId, resources, {
    uid: deterministicImportUid(userId, datasetId, "resources"),
    ...(resources.inputAt ? { inputAt: resources.inputAt } : {}),
    ignoreUidConflict: true,
  });
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
  return selected.map((item) => ({ ...item, datasetId, sourceId: source.sourceId }));
}

function withImportedTimelineGroup(
  document: PlannerStateDocumentV1,
  imported: readonly ImportedTimelineRecord[],
  replaceAttendance: boolean,
): PlannerStateDocumentV1 {
  const byUid = new Map(
    document.pyroxene.records
      .filter((record) => !replaceAttendance || record.source !== "attendance")
      .map((record) => [record.uid, record]),
  );
  for (const record of imported) byUid.set(record.uid, record);
  return {
    ...document,
    pyroxene: { ...document.pyroxene, records: sortPlannerStateTimelineRecords([...byUid.values()]) },
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
              const receiptKeys = await getGuestReceiptKeysInDatabase(tx, userId, source.datasetId);
              const pendingForSource = items.filter((item) => {
                if (!receiptKeys.has(receiptKey(item.type, item.key))) return true;
                verifiedItems.push(item);
                return false;
              });
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
                document = withImportedTimelineGroup(
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
                    const imported = await importGuestResourcesInDatabase(tx, userId, source.datasetId, resource);
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
                    const normalizedState = await upsertEventShopStateInDatabase(tx, userId, item.key, state);
                    document = withImportedEventShop(document, item.key, normalizedState);
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
