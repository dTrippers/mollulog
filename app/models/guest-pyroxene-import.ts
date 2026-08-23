import {
  decodePostgresPyroxeneReceiptItemKey,
  encodePostgresPyroxeneReceiptItemKey,
  type GuestImportItem,
  type GuestImportItemType,
  type GuestPyroxeneImportExternalOperation,
  type GuestPyroxeneImportPlan,
  type GuestPyroxeneImportResult,
  hasPostgresGuestImportReceipt,
  importGuestRecordPostgres,
  importGuestResourcesPostgres,
  markPostgresGuestImportReceipt,
  PYROXENE_RECEIPT_KEY_PREFIX,
  PYROXENE_RECEIPT_KEY_VERSION,
  runPostgresGuestPyroxeneImport,
} from "~/db/postgres/guest-pyroxene-import";
import type { PostgresPyroxeneOptions } from "~/db/postgres/pyroxene-planner";
import type { GuestPyroxeneRecord } from "~/domain/guest-pyroxene-planner";

export type { GuestPyroxeneImportResult } from "~/db/postgres/guest-pyroxene-import";
export type { GuestImportItem, GuestImportItemType, GuestPyroxeneImportExternalOperation, GuestPyroxeneImportPlan };
export {
  decodePostgresPyroxeneReceiptItemKey,
  encodePostgresPyroxeneReceiptItemKey,
  PYROXENE_RECEIPT_KEY_PREFIX,
  PYROXENE_RECEIPT_KEY_VERSION,
};

export async function hasGuestImportReceipt(
  env: Env,
  userId: number,
  datasetId: string,
  itemType: GuestImportItemType,
  itemKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<boolean> {
  return hasPostgresGuestImportReceipt(env, userId, datasetId, itemType, itemKey, options);
}

export async function markGuestImportReceipt(
  env: Env,
  userId: number,
  datasetId: string,
  itemType: GuestImportItemType,
  itemKey: string,
  options: PostgresPyroxeneOptions = {},
): Promise<void> {
  return markPostgresGuestImportReceipt(env, userId, datasetId, itemType, itemKey, options);
}

export async function importGuestResources(
  env: Env,
  userId: number,
  datasetId: string,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
): Promise<void> {
  return importGuestResourcesPostgres(env, userId, datasetId, resources);
}

export async function importGuestRecord(
  env: Env,
  userId: number,
  datasetId: string,
  record: GuestPyroxeneRecord,
): Promise<void> {
  return importGuestRecordPostgres(env, userId, datasetId, record);
}

export async function importGuestPyroxeneSelection(
  env: Env,
  userId: number,
  datasetId: string,
  plan: GuestPyroxeneImportPlan,
  options: PostgresPyroxeneOptions = {},
): Promise<GuestPyroxeneImportResult> {
  return runPostgresGuestPyroxeneImport(env, userId, datasetId, plan, options);
}
