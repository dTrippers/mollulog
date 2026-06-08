import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const syncDraftsTable = sqliteTable("sync_drafts", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  apiKeyUid: text(),
  source: text().notNull().default("connect"),
  type: text().notNull(),
  status: text().notNull().default("pending"),
  toolName: text(),
  toolVersion: text(),
  catalogVersion: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
  appliedAt: text(),
  expiresAt: text(),
});

export const syncDraftEntriesTable = sqliteTable("sync_draft_entries", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  draftUid: text().notNull(),
  entryKey: text().notNull(),
  value: int().notNull(),
  meta: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
});

export type SyncDraftSource = "connect" | "web" | "first_party_ocr";
export type SyncDraftType = "item_inventory" | "student_tier";
export type SyncDraftStatus = "pending" | "applied" | "discarded" | "expired";

export type SyncDraftEntry = {
  uid: string;
  draftUid: string;
  entryKey: string;
  value: number;
  meta: string | null;
  createdAt: string;
};

export type SyncDraftSummary = {
  uid: string;
  userId: number;
  apiKeyUid: string | null;
  source: SyncDraftSource;
  type: SyncDraftType;
  status: SyncDraftStatus;
  toolName: string | null;
  toolVersion: string | null;
  catalogVersion: string | null;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  expiresAt: string | null;
};

export type SyncDraft = SyncDraftSummary & {
  entries: SyncDraftEntry[];
};

export function toSyncDraftSource(source: string): SyncDraftSource {
  if (source === "connect" || source === "web" || source === "first_party_ocr") {
    return source;
  }

  return "connect";
}

export function toSyncDraftType(type: string): SyncDraftType {
  if (type === "item_inventory" || type === "student_tier") {
    return type;
  }

  return "item_inventory";
}

export function toSyncDraftStatus(status: string): SyncDraftStatus {
  if (status === "pending" || status === "applied" || status === "discarded" || status === "expired") {
    return status;
  }

  return "pending";
}

export function toSyncDraftEntryModel(entry: typeof syncDraftEntriesTable.$inferSelect): SyncDraftEntry {
  return {
    uid: entry.uid,
    draftUid: entry.draftUid,
    entryKey: entry.entryKey,
    value: entry.value,
    meta: entry.meta,
    createdAt: entry.createdAt,
  };
}

export function toSyncDraftSummaryModel(draft: typeof syncDraftsTable.$inferSelect): SyncDraftSummary {
  return {
    uid: draft.uid,
    userId: draft.userId,
    apiKeyUid: draft.apiKeyUid,
    source: toSyncDraftSource(draft.source),
    type: toSyncDraftType(draft.type),
    status: toSyncDraftStatus(draft.status),
    toolName: draft.toolName,
    toolVersion: draft.toolVersion,
    catalogVersion: draft.catalogVersion,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    appliedAt: draft.appliedAt,
    expiresAt: draft.expiresAt,
  };
}

export function toSyncDraftModel(
  draft: typeof syncDraftsTable.$inferSelect,
  entries: (typeof syncDraftEntriesTable.$inferSelect)[],
): SyncDraft {
  return {
    ...toSyncDraftSummaryModel(draft),
    entries: entries.map(toSyncDraftEntryModel),
  };
}

export async function getSyncDraft(env: Env, userId: number, uid: string): Promise<SyncDraft | null> {
  const db = drizzle(env.DB);
  const [draft] = await db
    .select()
    .from(syncDraftsTable)
    .where(and(eq(syncDraftsTable.uid, uid), eq(syncDraftsTable.userId, userId)));

  if (!draft) {
    return null;
  }

  const entries = await db.select().from(syncDraftEntriesTable).where(eq(syncDraftEntriesTable.draftUid, uid));

  return toSyncDraftModel(draft, entries);
}

export async function listPendingSyncDrafts(env: Env, userId: number): Promise<SyncDraftSummary[]> {
  const db = drizzle(env.DB);
  const drafts = await db
    .select()
    .from(syncDraftsTable)
    .where(and(eq(syncDraftsTable.userId, userId), eq(syncDraftsTable.status, "pending")));

  return drafts.map(toSyncDraftSummaryModel);
}
