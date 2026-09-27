import { and, eq, like, or } from "drizzle-orm";
import {
  type PlannerStateMutation,
  PlannerStateRevisionConflictError,
  withPlannerStateUpdate,
} from "~/db/postgres/planner-states";
import {
  createAttendanceInDatabase,
  createBuyPyroxeneInDatabase,
  createOtherPyroxeneGainInDatabase,
  createPyroxeneApPackageInDatabase,
  createPyroxeneMonthlyPackageInDatabase,
  createPyroxeneOwnedResourceInDatabase,
  ensureCollectedSourceInDatabase,
  type PostgresPyroxeneOptions,
  type PyroxeneDatabase,
  sortPlannerStateTimelineRecords,
  upsertPyroxeneEventDataInDatabase,
  upsertPyroxenePlannerOptionsInDatabase,
  withPyroxeneDatabase,
} from "~/db/postgres/pyroxene-planner";
import type { GuestPyroxeneRecord } from "~/domain/guest-pyroxene-planner";
import type { PlannerStateDocumentV1 } from "~/domain/planner-state";
import { normalizePyroxenePlannerOptions, type PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { nowUtcIso } from "~/lib/date-time";
import { pgPyroxeneGuestImportItemsTable, pgPyroxeneTimelineItemsTable } from "./schema";

export type GuestImportItemType = "resources" | "options" | "record" | "source" | "event" | "favorite";

export type GuestPyroxeneImportExternalOperation = {
  itemKey: string;
  run: () => Promise<void>;
};

export type GuestPyroxeneImportPlan = {
  resources?: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number };
  options?: PyroxenePlannerOptions;
  records: GuestPyroxeneRecord[];
  sourceKeys: string[];
  eventTrials: { eventUid: string; expectedTrials: number }[];
  favorites: GuestPyroxeneImportExternalOperation[];
};

export type GuestImportItem = {
  type: GuestImportItemType;
  key: string;
};

export type GuestPyroxeneImportResult = {
  verified: GuestImportItem[];
  failed: GuestImportItem[];
  revisionConflict: boolean;
};

type ImportedTimelineRecord = PlannerStateDocumentV1["pyroxene"]["records"][number];
type ImportedResource = PlannerStateDocumentV1["pyroxene"]["resources"];

function withImportedResource(document: PlannerStateDocumentV1, resource: ImportedResource): PlannerStateDocumentV1 {
  if (!resource || (document.pyroxene.resources && resource.inputAt < document.pyroxene.resources.inputAt)) {
    return document;
  }
  return { ...document, pyroxene: { ...document.pyroxene, resources: resource } };
}

function withImportedRecords(
  document: PlannerStateDocumentV1,
  records: readonly ImportedTimelineRecord[],
  replaceAttendance = false,
): PlannerStateDocumentV1 {
  const byUid = new Map(
    document.pyroxene.records
      .filter((record) => !replaceAttendance || record.source !== "attendance")
      .map((record) => [record.uid, record]),
  );
  for (const record of records) byUid.set(record.uid, record);
  return {
    ...document,
    pyroxene: {
      ...document.pyroxene,
      records: sortPlannerStateTimelineRecords([...byUid.values()]),
    },
  };
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

function withImportedEventTrials(
  document: PlannerStateDocumentV1,
  eventUid: string,
  expectedTrials: number,
): PlannerStateDocumentV1 {
  const current = document.pyroxene.eventData[eventUid] ?? { completed: false, expectedTrials: null };
  return {
    ...document,
    pyroxene: {
      ...document.pyroxene,
      eventData: { ...document.pyroxene.eventData, [eventUid]: { ...current, expectedTrials } },
    },
  };
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
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
): Promise<ImportedResource> {
  return createPyroxeneOwnedResourceInDatabase(db, userId, resources, {
    uid: deterministicImportUid(userId, datasetId, "resources"),
    ignoreUidConflict: true,
  });
}

export async function importGuestRecordInDatabase(
  db: PyroxeneDatabase,
  userId: number,
  datasetId: string,
  record: GuestPyroxeneRecord,
): Promise<ImportedTimelineRecord[]> {
  const uid = deterministicImportUid(userId, datasetId, record.recordId);
  const [existing] = await db
    .select({ id: pgPyroxeneTimelineItemsTable.id })
    .from(pgPyroxeneTimelineItemsTable)
    .where(
      and(
        eq(pgPyroxeneTimelineItemsTable.userId, userId),
        or(eq(pgPyroxeneTimelineItemsTable.uid, uid), like(pgPyroxeneTimelineItemsTable.uid, `${uid}::%`)),
      ),
    )
    .limit(1);
  if (existing) return [];

  switch (record.kind) {
    case "buy":
      return createBuyPyroxeneInDatabase(db, userId, record.date, record.quantity, {
        repeatType: record.repeatType,
        monthlyCount: record.monthlyCount,
        uid,
        ignoreUidConflict: true,
      });
    case "monthlyPackage":
      return createPyroxeneMonthlyPackageInDatabase(
        db,
        userId,
        record.startDate,
        record.packageType,
        record.autoRepurchase,
        uid,
        true,
      );
    case "apPackage":
      return createPyroxeneApPackageInDatabase(db, userId, record.startDate, record.autoRepurchase, uid, true);
    case "attendance":
      return createAttendanceInDatabase(db, userId, record.startDate, uid, true);
    case "other":
      return createOtherPyroxeneGainInDatabase(
        db,
        userId,
        record.date,
        record.resources.pyroxene,
        record.resources.oneTimeTicket,
        record.resources.tenTimeTicket,
        record.description,
        uid,
        true,
      );
  }
}

export async function importGuestResourcesPostgres(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  datasetId: string,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
): Promise<void> {
  return withPyroxeneDatabase(env, "guest_import.resources", (db) =>
    withPlannerStateUpdate(
      db,
      userId,
      async (tx, document) => {
        const imported = await importGuestResourcesInDatabase(tx, userId, datasetId, resources);
        return { document: withImportedResource(document, imported), result: undefined };
      },
      { retryable: true },
    ),
  );
}

export async function importGuestRecordPostgres(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  datasetId: string,
  record: GuestPyroxeneRecord,
): Promise<void> {
  return withPyroxeneDatabase(env, "guest_import.record", (db) =>
    withPlannerStateUpdate(
      db,
      userId,
      async (tx, document) => {
        const imported = await importGuestRecordInDatabase(tx, userId, datasetId, record);
        return {
          document: withImportedRecords(document, imported, record.kind === "attendance" && imported.length > 0),
          result: undefined,
        };
      },
      { retryable: true },
    ),
  );
}

export async function runPostgresGuestPyroxeneImport(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  datasetId: string,
  plan: GuestPyroxeneImportPlan,
  options: PostgresPyroxeneOptions = {},
): Promise<GuestPyroxeneImportResult> {
  return withPyroxeneDatabase(
    env,
    "guest_import.batch",
    async (db) => {
      const existingReceipts = await getGuestReceiptKeysInDatabase(db, userId, datasetId);
      const verified: GuestImportItem[] = [];
      const failed: GuestImportItem[] = [];
      const pendingReceipts: GuestImportItem[] = [];
      let revisionConflict = false;

      const runPlannerItem = async (item: GuestImportItem, mutation: PlannerStateMutation<void>) => {
        if (existingReceipts.has(receiptKey(item.type, item.key))) {
          verified.push(item);
          return;
        }
        try {
          await withPlannerStateUpdate(db, userId, mutation, { retryable: true });
          pendingReceipts.push(item);
        } catch (error) {
          if (error instanceof PlannerStateRevisionConflictError) revisionConflict = true;
          failed.push(item);
        }
      };

      const runExternalItem = async (item: GuestImportItem, operation: () => Promise<void>) => {
        if (existingReceipts.has(receiptKey(item.type, item.key))) {
          verified.push(item);
          return;
        }
        try {
          await operation();
          pendingReceipts.push(item);
        } catch (error) {
          if (error instanceof PlannerStateRevisionConflictError) revisionConflict = true;
          failed.push(item);
        }
      };

      if (plan.resources) {
        await runPlannerItem({ type: "resources", key: "current" }, async (tx, document) => {
          const imported = await importGuestResourcesInDatabase(
            tx,
            userId,
            datasetId,
            plan.resources as NonNullable<typeof plan.resources>,
          );
          return { document: withImportedResource(document, imported), result: undefined };
        });
      }
      if (plan.options) {
        await runPlannerItem({ type: "options", key: "current" }, async (tx, document) => {
          const options = normalizePyroxenePlannerOptions(plan.options as PyroxenePlannerOptions);
          await upsertPyroxenePlannerOptionsInDatabase(tx, userId, options);
          return { document: withImportedOptions(document, options), result: undefined };
        });
      }
      for (const record of plan.records) {
        await runPlannerItem({ type: "record", key: record.recordId }, async (tx, document) => {
          const imported = await importGuestRecordInDatabase(tx, userId, datasetId, record);
          return {
            document: withImportedRecords(document, imported, record.kind === "attendance" && imported.length > 0),
            result: undefined,
          };
        });
      }
      for (const sourceKey of plan.sourceKeys) {
        await runPlannerItem({ type: "source", key: sourceKey }, async (tx, document) => {
          await ensureCollectedSourceInDatabase(tx, userId, sourceKey);
          return { document: withImportedSourceKey(document, sourceKey), result: undefined };
        });
      }
      for (const { eventUid, expectedTrials } of plan.eventTrials) {
        await runPlannerItem({ type: "event", key: eventUid }, async (tx, document) => {
          await upsertPyroxeneEventDataInDatabase(tx, userId, eventUid, { expectedTrials });
          return { document: withImportedEventTrials(document, eventUid, expectedTrials), result: undefined };
        });
      }
      for (const favorite of plan.favorites) {
        await runExternalItem({ type: "favorite", key: favorite.itemKey }, favorite.run);
      }

      if (pendingReceipts.length > 0) {
        try {
          await db
            .insert(pgPyroxeneGuestImportItemsTable)
            .values(
              pendingReceipts.map(({ type, key }) => ({
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
          verified.push(...pendingReceipts);
        } catch {
          failed.push(...pendingReceipts);
        }
      }

      return { verified, failed, revisionConflict };
    },
    options,
  );
}
