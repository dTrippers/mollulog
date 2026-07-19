import { and, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { GuestPyroxeneRecord } from "~/domain/guest-pyroxene-planner";
import {
  createAttendance,
  createBuyPyroxene,
  createOtherPyroxeneGain,
  createPyroxeneApPackage,
  createPyroxeneMonthlyPackage,
  createPyroxeneOwnedResource,
  pyroxeneOwnedResourcesTable,
  pyroxeneTimelineItemsTable,
} from "~/models/pyroxene-planner";

export const pyroxeneGuestImportItemsTable = sqliteTable(
  "pyroxene_guest_import_items",
  {
    id: int().primaryKey({ autoIncrement: true }),
    userId: int().notNull(),
    datasetId: text().notNull(),
    itemType: text().notNull(),
    itemKey: text().notNull(),
    importedAt: text().notNull(),
  },
  (table) => [
    uniqueIndex("pyroxene_guest_import_items_user_dataset_item").on(
      table.userId,
      table.datasetId,
      table.itemType,
      table.itemKey,
    ),
  ],
);

export type GuestImportItemType = "resources" | "options" | "record" | "source" | "event" | "favorite";

export async function hasGuestImportReceipt(
  env: Env,
  userId: number,
  datasetId: string,
  itemType: GuestImportItemType,
  itemKey: string,
): Promise<boolean> {
  const db = drizzle(env.DB);
  const [row] = await db
    .select({ id: pyroxeneGuestImportItemsTable.id })
    .from(pyroxeneGuestImportItemsTable)
    .where(
      and(
        eq(pyroxeneGuestImportItemsTable.userId, userId),
        eq(pyroxeneGuestImportItemsTable.datasetId, datasetId),
        eq(pyroxeneGuestImportItemsTable.itemType, itemType),
        eq(pyroxeneGuestImportItemsTable.itemKey, itemKey),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function markGuestImportReceipt(
  env: Env,
  userId: number,
  datasetId: string,
  itemType: GuestImportItemType,
  itemKey: string,
): Promise<void> {
  await drizzle(env.DB)
    .insert(pyroxeneGuestImportItemsTable)
    .values({ userId, datasetId, itemType, itemKey, importedAt: new Date().toISOString() })
    .onConflictDoNothing();
}

function deterministicImportUid(userId: number, datasetId: string, recordId: string): string {
  return `guest-${userId}-${datasetId}-${recordId}`;
}

export async function importGuestResources(
  env: Env,
  userId: number,
  datasetId: string,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
): Promise<void> {
  const uid = deterministicImportUid(userId, datasetId, "resources");
  const db = drizzle(env.DB);
  const [existing] = await db
    .select({ id: pyroxeneOwnedResourcesTable.id })
    .from(pyroxeneOwnedResourcesTable)
    .where(and(eq(pyroxeneOwnedResourcesTable.userId, userId), eq(pyroxeneOwnedResourcesTable.uid, uid)))
    .limit(1);
  if (!existing) await createPyroxeneOwnedResource(env, userId, resources, { uid });
}

export async function importGuestRecord(
  env: Env,
  userId: number,
  datasetId: string,
  record: GuestPyroxeneRecord,
): Promise<void> {
  const uid = deterministicImportUid(userId, datasetId, record.recordId);
  const db = drizzle(env.DB);
  const [existing] = await db
    .select({ id: pyroxeneTimelineItemsTable.id })
    .from(pyroxeneTimelineItemsTable)
    .where(
      and(
        eq(pyroxeneTimelineItemsTable.userId, userId),
        or(eq(pyroxeneTimelineItemsTable.uid, uid), like(pyroxeneTimelineItemsTable.uid, `${uid}::%`)),
      ),
    )
    .limit(1);
  if (existing) return;

  switch (record.kind) {
    case "buy":
      await createBuyPyroxene(env, userId, record.date, record.quantity, {
        repeatType: record.repeatType,
        monthlyCount: record.monthlyCount,
        uid,
      });
      break;
    case "monthlyPackage":
      await createPyroxeneMonthlyPackage(env, userId, record.startDate, record.packageType, record.autoRepurchase, uid);
      break;
    case "apPackage":
      await createPyroxeneApPackage(env, userId, record.startDate, record.autoRepurchase, uid);
      break;
    case "attendance":
      await createAttendance(env, userId, record.startDate, uid);
      break;
    case "other":
      await createOtherPyroxeneGain(
        env,
        userId,
        record.date,
        record.resources.pyroxene,
        record.resources.oneTimeTicket,
        record.resources.tenTimeTicket,
        record.description,
        uid,
      );
      break;
  }
}
