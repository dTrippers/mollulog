import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";

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

export type SyncDraftEntryUpdateInput = {
  entryKey: string;
  value: unknown;
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

export function normalizeSyncDraftEntryValue(type: SyncDraftType, value: unknown): number {
  if (type === "student_tier") {
    return normalizeStudentTierValue(value);
  }

  return normalizeItemInventoryValue(value);
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

  const entries = await db
    .select()
    .from(syncDraftEntriesTable)
    .where(eq(syncDraftEntriesTable.draftUid, uid))
    .orderBy(asc(syncDraftEntriesTable.id));

  return toSyncDraftModel(draft, entries);
}

export async function listPendingSyncDrafts(env: Env, userId: number): Promise<SyncDraftSummary[]> {
  const db = drizzle(env.DB);
  const drafts = await db
    .select()
    .from(syncDraftsTable)
    .where(and(eq(syncDraftsTable.userId, userId), eq(syncDraftsTable.status, "pending")))
    .orderBy(desc(syncDraftsTable.createdAt));

  return drafts.map(toSyncDraftSummaryModel);
}

export async function getSyncDraftEntryCounts(env: Env, draftUids: string[]): Promise<Record<string, number>> {
  const uniqueDraftUids = [...new Set(draftUids)];
  if (uniqueDraftUids.length === 0) {
    return {};
  }

  const db = drizzle(env.DB);
  const rows = await db
    .select({
      draftUid: syncDraftEntriesTable.draftUid,
      entryCount: sql<number>`count(*)`,
    })
    .from(syncDraftEntriesTable)
    .where(inArray(syncDraftEntriesTable.draftUid, uniqueDraftUids))
    .groupBy(syncDraftEntriesTable.draftUid);

  return Object.fromEntries(rows.map((row) => [row.draftUid, row.entryCount]));
}

export async function updateSyncDraftEntries(
  env: Env,
  userId: number,
  draftUid: string,
  entries: SyncDraftEntryUpdateInput[],
) {
  const draft = await getPendingOwnedSyncDraft(env, userId, draftUid);
  const normalizedEntries = normalizeSyncDraftEntryUpdates(draft.type, entries);
  assertEntryKeysMatchDraft(draft.entries, normalizedEntries);

  await env.DB.batch([
    ...normalizedEntries.map(({ entryKey, value }) =>
      env.DB.prepare(`
        update sync_draft_entries
        set value = ?1
        where draftUid = ?2
          and entryKey = ?3
          and exists (
            select 1
            from sync_drafts
            where uid = ?2
              and userId = ?4
              and status = 'pending'
          )
      `).bind(value, draftUid, entryKey, userId),
    ),
    env.DB.prepare(`
      update sync_drafts
      set updatedAt = current_timestamp
      where uid = ?1
        and userId = ?2
        and status = 'pending'
    `).bind(draftUid, userId),
  ]);

  const updatedDraft = await getSyncDraft(env, userId, draftUid);
  if (updatedDraft?.status !== "pending") {
    throw new Error("이미 처리된 Draft예요");
  }
}

export async function applySyncDraft(env: Env, userId: number, draftUid: string) {
  const draft = await getPendingOwnedSyncDraft(env, userId, draftUid);
  const normalizedEntries = normalizeSyncDraftEntryUpdates(draft.type, draft.entries);

  await env.DB.batch([
    ...normalizedEntries.map(({ entryKey, value }) =>
      createConditionalApplyStatement(env, userId, draftUid, draft.type, entryKey, value),
    ),
    env.DB.prepare(`
      update sync_drafts
      set status = 'applied',
          updatedAt = current_timestamp,
          appliedAt = current_timestamp
      where uid = ?1
        and userId = ?2
        and status = 'pending'
    `).bind(draftUid, userId),
  ]);

  const appliedDraft = await getSyncDraft(env, userId, draftUid);
  if (appliedDraft?.status !== "applied") {
    throw new Error("이미 처리된 Draft예요");
  }
}

export async function discardSyncDraft(env: Env, userId: number, draftUid: string) {
  await getPendingOwnedSyncDraft(env, userId, draftUid);

  await env.DB.batch([
    env.DB.prepare(`
      update sync_drafts
      set status = 'discarded',
          updatedAt = current_timestamp
      where uid = ?1
        and userId = ?2
        and status = 'pending'
    `).bind(draftUid, userId),
  ]);

  const discardedDraft = await getSyncDraft(env, userId, draftUid);
  if (discardedDraft?.status !== "discarded") {
    throw new Error("이미 처리된 Draft예요");
  }
}

async function getPendingOwnedSyncDraft(env: Env, userId: number, draftUid: string): Promise<SyncDraft> {
  const draft = await getSyncDraft(env, userId, draftUid);
  if (!draft) {
    throw new Error("Draft를 찾을 수 없어요");
  }
  if (draft.status !== "pending") {
    throw new Error("이미 처리된 Draft예요");
  }

  return draft;
}

function normalizeSyncDraftEntryUpdates(
  type: SyncDraftType,
  entries: SyncDraftEntryUpdateInput[],
): { entryKey: string; value: number }[] {
  const entryMap = new Map<string, number>();

  for (const entry of entries) {
    const entryKey = entry.entryKey.trim();
    if (!entryKey) {
      throw new Error("변경안 항목을 찾을 수 없어요");
    }
    if (entryMap.has(entryKey)) {
      throw new Error("중복된 변경안 항목이 있어요");
    }

    entryMap.set(entryKey, normalizeSyncDraftEntryValue(type, entry.value));
  }

  return [...entryMap.entries()].map(([entryKey, value]) => ({ entryKey, value }));
}

function assertEntryKeysMatchDraft(
  draftEntries: SyncDraftEntry[],
  normalizedEntries: { entryKey: string; value: number }[],
) {
  const draftKeys = draftEntries.map((entry) => entry.entryKey).sort();
  const updateKeys = normalizedEntries.map((entry) => entry.entryKey).sort();

  if (draftKeys.length !== updateKeys.length) {
    throw new Error("저장할 항목이 변경안과 일치하지 않아요");
  }

  for (const [index, draftKey] of draftKeys.entries()) {
    if (draftKey !== updateKeys[index]) {
      throw new Error("저장할 항목이 변경안과 일치하지 않아요");
    }
  }
}

function createConditionalApplyStatement(
  env: Env,
  userId: number,
  draftUid: string,
  type: SyncDraftType,
  entryKey: string,
  value: number,
): D1PreparedStatement {
  if (type === "student_tier") {
    return createConditionalStudentTierStatement(env, userId, draftUid, entryKey, value);
  }

  return createConditionalItemInventoryStatement(env, userId, draftUid, entryKey, value);
}

function createConditionalItemInventoryStatement(
  env: Env,
  userId: number,
  draftUid: string,
  itemUid: string,
  quantity: number,
): D1PreparedStatement {
  normalizeSyncDraftEntryValue("item_inventory", quantity);

  if (quantity <= 0) {
    return env.DB.prepare(`
      delete from growth_resource_inventory
      where userId = ?1
        and itemUid = ?2
        and exists (
          select 1
          from sync_drafts
          where uid = ?3
            and userId = ?1
            and status = 'pending'
            and type = 'item_inventory'
        )
    `).bind(userId, itemUid, draftUid);
  }

  return env.DB.prepare(`
    insert into growth_resource_inventory (uid, userId, itemUid, quantity)
    select ?1, ?2, ?3, ?4
    where exists (
      select 1
      from sync_drafts
      where uid = ?5
        and userId = ?2
        and status = 'pending'
        and type = 'item_inventory'
    )
    on conflict(userId, itemUid) do update set
      quantity = excluded.quantity,
      updatedAt = current_timestamp
  `).bind(nanoid(8), userId, itemUid, quantity, draftUid);
}

function createConditionalStudentTierStatement(
  env: Env,
  userId: number,
  draftUid: string,
  studentUid: string,
  tier: number,
): D1PreparedStatement {
  normalizeSyncDraftEntryValue("student_tier", tier);

  return env.DB.prepare(`
    insert into recruited_students (uid, userId, studentUid, tier)
    select ?1, ?2, ?3, ?4
    where exists (
      select 1
      from sync_drafts
      where uid = ?5
        and userId = ?2
        and status = 'pending'
        and type = 'student_tier'
    )
    on conflict(userId, studentUid) do update set
      tier = excluded.tier,
      updatedAt = current_timestamp
  `).bind(nanoid(8), userId, studentUid, tier, draftUid);
}

function normalizeItemInventoryValue(value: unknown): number {
  const normalizedValue = normalizeIntegerValue(value, "아이템 수량은 0 이상의 정수만 입력해주세요");
  if (normalizedValue < 0) {
    throw new Error("아이템 수량은 0 이상의 정수만 입력해주세요");
  }

  return normalizedValue;
}

function normalizeStudentTierValue(value: unknown): number {
  const normalizedValue = normalizeIntegerValue(value, "학생 등급은 1부터 9까지의 정수만 입력해주세요");
  if (normalizedValue < 1 || normalizedValue > 9) {
    throw new Error("학생 등급은 1부터 9까지의 정수만 입력해주세요");
  }

  return normalizedValue;
}

function normalizeIntegerValue(value: unknown, errorMessage: string): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(errorMessage);
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(errorMessage);
    }
    return Number(trimmed);
  }

  throw new Error(errorMessage);
}
