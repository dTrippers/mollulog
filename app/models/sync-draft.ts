import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import {
  pgGrowthResourceInventoryTable,
  pgStudentStatesTable,
  pgStudentTargetsTable,
  pgSyncDraftEntriesTable,
  pgSyncDraftsTable,
} from "~/db/postgres/schema";
import {
  patchCanonicalRelationship,
  patchCanonicalStudentState,
  patchCanonicalStudentTarget,
  type StudentStateRequestMode,
  type StudentStateTransaction,
  withStudentStateWrite,
} from "~/db/postgres/student-state";
import { assertAbilityReleaseAvailable, assertWeaponLevelRange } from "~/domain/student-growth-state";
import {
  isStudentStateDraftFieldProvided,
  parseStudentStateDraftValue,
  type StudentStateDraftValue,
  studentStateCurrentFields,
  studentStateTargetFields,
} from "~/domain/student-state";
import { StudentStateMergeConflictError } from "~/domain/student-state-errors";
import { withPostgresClient } from "~/lib/postgres.server";

const PG_WRITE_CHUNK_SIZE = 500;
const PG_IN_QUERY_CHUNK_SIZE = 500;
type SyncDraftDb = StudentStateTransaction;

export type SyncDraftStudentStateMetadata = { initialTier: number; hasGear: boolean };
export type ApplySyncDraftOptions = {
  studentStateMetadataByKey?: Record<string, SyncDraftStudentStateMetadata>;
  /** Reviewed entries saved in the same transaction as the apply, so a rejected apply leaves the draft unchanged. */
  entryUpdates?: SyncDraftEntryUpdateInput[];
  /** The semantics the reviewing page rendered with; a student-state apply is rejected when it no longer matches. */
  studentStateRequestMode?: StudentStateRequestMode | null;
};

export const syncDraftsTable = pgSyncDraftsTable;
export const syncDraftEntriesTable = pgSyncDraftEntriesTable;

export type SyncDraftSource = "connect" | "web" | "first_party_ocr";
export type SyncDraftType = "item_inventory" | "student_tier" | "student_state";
export type SyncDraftStatus = "pending" | "applied" | "discarded" | "expired";

export type SyncDraftEntry = {
  uid: string;
  draftUid: string;
  entryKey: string;
  value: number;
  valueJson: string | null;
  meta: string | null;
  createdAt: string;
};

export type SyncDraftSummary = {
  uid: string;
  userId: number;
  apiKeyUid: string | null;
  source: SyncDraftSource;
  sourceRef: string | null;
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

export type SyncDraft = SyncDraftSummary & { entries: SyncDraftEntry[] };

export type SyncDraftEntryUpdateInput = {
  entryKey: string;
  value: unknown;
  valueJson?: string | null;
};

export type SyncDraftCreateInput = {
  source: SyncDraftSource;
  sourceRef?: string | null;
  type: SyncDraftType;
  toolName?: string | null;
  toolVersion?: string | null;
  catalogVersion?: string | null;
  expiresAt?: string | null;
  entries: Array<SyncDraftEntryUpdateInput & { meta?: unknown }>;
};

function toExpiresAtDate(expiresAt: string | null | undefined): Date | null {
  if (expiresAt == null) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) throw new Error("변경안 만료 시각을 확인할 수 없어요");
  return date;
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Wraps unexpected PostgreSQL/Hyperdrive failures from sync draft persistence
 * so callers can separate them from user-facing validation errors, which stay
 * plain errors and are safe to show verbatim.
 */
export class SyncDraftPersistenceError extends Error {
  override readonly name = "SyncDraftPersistenceError";
}

export function toSyncDraftSource(source: string): SyncDraftSource {
  if (source === "connect" || source === "web" || source === "first_party_ocr") return source;
  throw new Error(`알 수 없는 변경안 source예요: ${source}`);
}

export function toSyncDraftType(type: string): SyncDraftType {
  if (type === "item_inventory" || type === "student_tier" || type === "student_state") return type;
  throw new Error(`알 수 없는 변경안 type이에요: ${type}`);
}

export function toSyncDraftStatus(status: string): SyncDraftStatus {
  if (status === "pending" || status === "applied" || status === "discarded" || status === "expired") return status;
  throw new Error(`알 수 없는 변경안 status예요: ${status}`);
}

export function toSyncDraftEntryModel(entry: typeof syncDraftEntriesTable.$inferSelect): SyncDraftEntry {
  return {
    uid: entry.uid,
    draftUid: entry.draftUid,
    entryKey: entry.entryKey,
    value: entry.value,
    valueJson: entry.valueJson,
    meta: entry.meta,
    createdAt: toIso(entry.createdAt) ?? "",
  };
}

export function toSyncDraftSummaryModel(draft: typeof syncDraftsTable.$inferSelect): SyncDraftSummary {
  return {
    uid: draft.uid,
    userId: draft.userId,
    apiKeyUid: draft.apiKeyUid,
    source: toSyncDraftSource(draft.source),
    sourceRef: draft.sourceRef,
    type: toSyncDraftType(draft.type),
    status: toSyncDraftStatus(draft.status),
    toolName: draft.toolName,
    toolVersion: draft.toolVersion,
    catalogVersion: draft.catalogVersion,
    createdAt: toIso(draft.createdAt) ?? "",
    updatedAt: toIso(draft.updatedAt) ?? "",
    appliedAt: toIso(draft.appliedAt),
    expiresAt: toIso(draft.expiresAt),
  };
}

export function toSyncDraftModel(
  draft: typeof syncDraftsTable.$inferSelect,
  entries: (typeof syncDraftEntriesTable.$inferSelect)[],
): SyncDraft {
  return { ...toSyncDraftSummaryModel(draft), entries: entries.map(toSyncDraftEntryModel) };
}

export function normalizeSyncDraftEntryValue(type: SyncDraftType, value: unknown): number {
  return type === "student_tier" || type === "student_state"
    ? normalizeStudentTierValue(value)
    : normalizeItemInventoryValue(value);
}

export async function getSyncDraft(env: Env, userId: number, uid: string): Promise<SyncDraft | null> {
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const [draft] = await db
      .select()
      .from(syncDraftsTable)
      .where(and(eq(syncDraftsTable.uid, uid), eq(syncDraftsTable.userId, userId)));
    if (!draft) return null;
    const entries = await db
      .select()
      .from(syncDraftEntriesTable)
      .where(eq(syncDraftEntriesTable.draftUid, uid))
      .orderBy(asc(syncDraftEntriesTable.id));
    return toSyncDraftModel(draft, entries);
  });
}

export async function getSyncDraftBySourceRef(
  env: Env,
  userId: number,
  source: SyncDraftSource,
  sourceRef: string,
): Promise<SyncDraftSummary | null> {
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const [draft] = await db
      .select()
      .from(syncDraftsTable)
      .where(
        and(
          eq(syncDraftsTable.userId, userId),
          eq(syncDraftsTable.source, source),
          eq(syncDraftsTable.sourceRef, sourceRef),
        ),
      );
    return draft ? toSyncDraftSummaryModel(draft) : null;
  });
}

export async function listSyncDraftsBySourceRefs(
  env: Env,
  userId: number,
  source: SyncDraftSource,
  sourceRefs: string[],
): Promise<Record<string, SyncDraftSummary>> {
  const uniqueSourceRefs = [...new Set(sourceRefs)];
  if (uniqueSourceRefs.length === 0) return {};

  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const drafts: (typeof syncDraftsTable.$inferSelect)[] = [];
    for (let offset = 0; offset < uniqueSourceRefs.length; offset += PG_IN_QUERY_CHUNK_SIZE) {
      drafts.push(
        ...(await db
          .select()
          .from(syncDraftsTable)
          .where(
            and(
              eq(syncDraftsTable.userId, userId),
              eq(syncDraftsTable.source, source),
              inArray(syncDraftsTable.sourceRef, uniqueSourceRefs.slice(offset, offset + PG_IN_QUERY_CHUNK_SIZE)),
            ),
          )),
      );
    }
    return Object.fromEntries(
      drafts.flatMap((draft) => (draft.sourceRef ? [[draft.sourceRef, toSyncDraftSummaryModel(draft)]] : [])),
    );
  });
}

export async function listPendingSyncDrafts(env: Env, userId: number): Promise<SyncDraftSummary[]> {
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const drafts = await db
      .select()
      .from(syncDraftsTable)
      .where(and(eq(syncDraftsTable.userId, userId), eq(syncDraftsTable.status, "pending")))
      .orderBy(desc(syncDraftsTable.createdAt));
    return drafts.map(toSyncDraftSummaryModel);
  });
}

export async function createSyncDraft(env: Env, userId: number, input: SyncDraftCreateInput): Promise<string> {
  const entries = normalizeSyncDraftEntryUpdates(input.type, input.entries);
  if (entries.length === 0) throw new Error("변경된 항목이 없어요");
  const metaByEntryKey = new Map(
    input.entries.map((entry) => [entry.entryKey.trim(), entry.meta == null ? null : JSON.stringify(entry.meta)]),
  );
  const draftUid = nanoid(12);

  try {
    await withPostgresClient(env, async (client) => {
      const db = drizzle(client);
      await db.transaction(async (tx) => {
        await tx.insert(syncDraftsTable).values({
          uid: draftUid,
          userId,
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          type: input.type,
          status: "pending",
          toolName: input.toolName ?? null,
          toolVersion: input.toolVersion ?? null,
          catalogVersion: input.catalogVersion ?? null,
          expiresAt: toExpiresAtDate(input.expiresAt),
        });
        for (let offset = 0; offset < entries.length; offset += PG_WRITE_CHUNK_SIZE) {
          const chunk = entries.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
          await tx.insert(syncDraftEntriesTable).values(
            chunk.map((entry) => ({
              uid: nanoid(8),
              draftUid,
              entryKey: entry.entryKey,
              value: entry.value,
              valueJson: entry.valueJson,
              meta: metaByEntryKey.get(entry.entryKey) ?? null,
            })),
          );
        }
      });
    });
  } catch (error) {
    throw new SyncDraftPersistenceError("PostgreSQL sync draft persistence failed", { cause: error });
  }
  return draftUid;
}

export async function createAndApplySyncDraft(
  env: Env,
  userId: number,
  input: SyncDraftCreateInput & { sourceRef: string },
): Promise<{ draft: SyncDraftSummary; alreadyApplied: boolean }> {
  const entries = normalizeSyncDraftEntryUpdates(input.type, input.entries);
  if (entries.length === 0) throw new Error("변경된 항목이 없어요");
  const metaByEntryKey = new Map(
    input.entries.map((entry) => [entry.entryKey.trim(), entry.meta == null ? null : JSON.stringify(entry.meta)]),
  );
  const draftUid = nanoid(12);

  try {
    const result = await withPostgresClient(env, async (client) => {
      const db = drizzle(client);
      return db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(syncDraftsTable)
          .where(
            and(
              eq(syncDraftsTable.userId, userId),
              eq(syncDraftsTable.source, input.source),
              eq(syncDraftsTable.sourceRef, input.sourceRef),
            ),
          )
          .for("update");
        if (existing[0]) {
          const summary = toSyncDraftSummaryModel(existing[0]);
          if (summary.status === "applied") return { draft: summary, alreadyApplied: true };
          throw new Error("이미 처리 중인 인식 결과예요");
        }

        await tx.insert(syncDraftsTable).values({
          uid: draftUid,
          userId,
          source: input.source,
          sourceRef: input.sourceRef,
          type: input.type,
          status: "pending",
          toolName: input.toolName ?? null,
          toolVersion: input.toolVersion ?? null,
          catalogVersion: input.catalogVersion ?? null,
          expiresAt: toExpiresAtDate(input.expiresAt),
        });
        for (let offset = 0; offset < entries.length; offset += PG_WRITE_CHUNK_SIZE) {
          const chunk = entries.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
          await tx.insert(syncDraftEntriesTable).values(
            chunk.map((entry) => ({
              uid: nanoid(8),
              draftUid,
              entryKey: entry.entryKey,
              value: entry.value,
              valueJson: entry.valueJson,
              meta: metaByEntryKey.get(entry.entryKey) ?? null,
            })),
          );
        }
        const appliedEntries =
          input.type === "student_state"
            ? entries.map((entry) => ({ entryKey: entry.entryKey, value: parseStudentStateDraftValue(entry) }))
            : entries;
        await applyEntries(tx, userId, input.type, appliedEntries, {
          sourceRef: draftUid,
          source: input.source,
        });
        const now = new Date();
        await tx
          .update(syncDraftsTable)
          .set({ status: "applied", updatedAt: now, appliedAt: now })
          .where(and(eq(syncDraftsTable.uid, draftUid), eq(syncDraftsTable.userId, userId)));
        const [saved] = await tx.select().from(syncDraftsTable).where(eq(syncDraftsTable.uid, draftUid));
        if (!saved) throw new Error("인식 결과를 반영하지 못했어요");
        return { draft: toSyncDraftSummaryModel(saved), alreadyApplied: false };
      });
    });
    return result;
  } catch (error) {
    const concurrent = await getSyncDraftBySourceRef(env, userId, input.source, input.sourceRef);
    if (concurrent?.status === "applied") return { draft: concurrent, alreadyApplied: true };
    throw error;
  }
}

export async function getSyncDraftEntryCounts(env: Env, draftUids: string[]): Promise<Record<string, number>> {
  const uniqueDraftUids = [...new Set(draftUids)];
  if (uniqueDraftUids.length === 0) return {};
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const rows = await db
      .select({ draftUid: syncDraftEntriesTable.draftUid, entryCount: sql<number>`count(*)` })
      .from(syncDraftEntriesTable)
      .where(inArray(syncDraftEntriesTable.draftUid, uniqueDraftUids))
      .groupBy(syncDraftEntriesTable.draftUid);
    return Object.fromEntries(rows.map((row) => [row.draftUid, Number(row.entryCount)]));
  });
}

export async function updateSyncDraftEntries(
  env: Env,
  userId: number,
  draftUid: string,
  entries: SyncDraftEntryUpdateInput[],
) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      const draft = await getPendingOwnedSyncDraftFromDb(tx, userId, draftUid, true);
      await writeSyncDraftEntryUpdates(tx, draft, entries);
    });
  });
}

async function writeSyncDraftEntryUpdates(db: SyncDraftDb, draft: SyncDraft, entries: SyncDraftEntryUpdateInput[]) {
  const normalizedEntries = normalizeSyncDraftEntryUpdates(draft.type, entries);
  assertEntryKeysMatchDraft(draft.entries, normalizedEntries);
  const now = new Date();
  for (let offset = 0; offset < normalizedEntries.length; offset += PG_WRITE_CHUNK_SIZE) {
    const chunk = normalizedEntries.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
    const values = sql.join(
      chunk.map((entry) => sql`(${entry.entryKey}::text, ${entry.value}::integer, ${entry.valueJson}::text)`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE ${syncDraftEntriesTable} AS entries
      SET "value" = incoming."value",
          "value_json" = incoming."value_json",
          "updated_at" = ${now}
      FROM (VALUES ${values}) AS incoming("entry_key", "value", "value_json")
      WHERE entries."draft_uid" = ${draft.uid}
        AND entries."entry_key" = incoming."entry_key"
    `);
  }
  await db.update(syncDraftsTable).set({ updatedAt: now }).where(eq(syncDraftsTable.uid, draft.uid));
}

export async function applySyncDraft(env: Env, userId: number, draftUid: string, options: ApplySyncDraftOptions = {}) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      let draft = await getPendingOwnedSyncDraftFromDb(tx, userId, draftUid, true);
      if (options.entryUpdates) {
        await writeSyncDraftEntryUpdates(tx, draft, options.entryUpdates);
        draft = await getPendingOwnedSyncDraftFromDb(tx, userId, draftUid, false);
      }
      const normalizedEntries =
        draft.type === "student_state"
          ? parseStudentStateDraftEntries(draft.entries)
          : normalizeSyncDraftEntryUpdates(draft.type, draft.entries);
      await applyEntries(tx, userId, draft.type, normalizedEntries, {
        sourceRef: draftUid,
        source: draft.source,
        studentStateMetadataByKey: options.studentStateMetadataByKey,
        studentStateRequestMode: options.studentStateRequestMode ?? null,
      });
      const now = new Date();
      await tx
        .update(syncDraftsTable)
        .set({ status: "applied", updatedAt: now, appliedAt: now })
        .where(and(eq(syncDraftsTable.uid, draftUid), eq(syncDraftsTable.userId, userId)));
    });
  });
}

export async function discardSyncDraft(env: Env, userId: number, draftUid: string) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await getPendingOwnedSyncDraftFromDb(tx, userId, draftUid, true);
      const result = await tx
        .update(syncDraftsTable)
        .set({ status: "discarded", updatedAt: new Date() })
        .where(
          and(
            eq(syncDraftsTable.uid, draftUid),
            eq(syncDraftsTable.userId, userId),
            eq(syncDraftsTable.status, "pending"),
          ),
        )
        .returning({ uid: syncDraftsTable.uid });
      if (result.length === 0) throw new Error("이미 처리된 Draft예요");
    });
  });
}

async function getPendingOwnedSyncDraftFromDb(
  db: SyncDraftDb,
  userId: number,
  draftUid: string,
  lock: boolean,
): Promise<SyncDraft> {
  const query = db
    .select()
    .from(syncDraftsTable)
    .where(and(eq(syncDraftsTable.uid, draftUid), eq(syncDraftsTable.userId, userId)));
  const rows = lock ? await query.for("update") : await query;
  const draft = rows[0];
  if (!draft) throw new Error("Draft를 찾을 수 없어요");
  if (draft.status !== "pending") throw new Error("이미 처리된 Draft예요");
  const entries = await db
    .select()
    .from(syncDraftEntriesTable)
    .where(eq(syncDraftEntriesTable.draftUid, draftUid))
    .orderBy(asc(syncDraftEntriesTable.id));
  return toSyncDraftModel(draft, entries);
}

function normalizeSyncDraftEntryUpdates(
  type: SyncDraftType,
  entries: SyncDraftEntryUpdateInput[],
): { entryKey: string; value: number; valueJson: string | null }[] {
  const entryMap = new Map<string, { value: number; valueJson: string | null }>();
  for (const entry of entries) {
    const entryKey = entry.entryKey.trim();
    if (!entryKey) throw new Error("변경안 항목을 찾을 수 없어요");
    if (entryMap.has(entryKey)) throw new Error("중복된 변경안 항목이 있어요");
    const value = normalizeSyncDraftEntryValue(type, entry.value);
    const valueJson = type === "student_state" ? normalizeStudentStateDraftEntryJson(value, entry.valueJson) : null;
    entryMap.set(entryKey, { value, valueJson });
  }
  return [...entryMap.entries()].map(([entryKey, entry]) => ({ entryKey, ...entry }));
}

function normalizeStudentStateDraftEntryJson(value: number, valueJson: string | null | undefined): string {
  if (!valueJson) throw new Error("학생 상태 변경안 데이터를 찾을 수 없어요");
  parseStudentStateDraftValue({ value, valueJson });
  return valueJson;
}

function assertEntryKeysMatchDraft(draftEntries: SyncDraftEntry[], normalizedEntries: { entryKey: string }[]) {
  const draftKeys = draftEntries.map((entry) => entry.entryKey).sort();
  const updateKeys = normalizedEntries.map((entry) => entry.entryKey).sort();
  if (draftKeys.length !== updateKeys.length || draftKeys.some((key, index) => key !== updateKeys[index])) {
    throw new Error("저장할 항목이 변경안과 일치하지 않아요");
  }
}

async function applyEntries(
  db: SyncDraftDb,
  userId: number,
  type: SyncDraftType,
  entries: Array<{ entryKey: string; value: number } | { entryKey: string; value: StudentStateDraftValue }>,
  options: {
    source: SyncDraftSource;
    sourceRef?: string | null;
    studentStateMetadataByKey?: Record<string, SyncDraftStudentStateMetadata>;
    studentStateRequestMode?: StudentStateRequestMode | null;
  },
) {
  if (type === "student_state") {
    const studentEntries = entries.map((entry) => ({
      entryKey: entry.entryKey,
      state: entry.value as StudentStateDraftValue,
    }));
    await withStudentStateWrite(
      db,
      userId,
      studentEntries.map((entry) => entry.entryKey),
      "sync_draft",
      async (lockedTx) => {
        await applyCanonicalStudentStateEntries(lockedTx, userId, studentEntries, {
          source: options.source,
          metadataByKey: options.studentStateMetadataByKey,
        });
        return;
      },
      options.sourceRef ?? null,
      options.studentStateRequestMode ?? null,
    );
    return;
  }
  if (type === "student_tier") {
    const recruitedEntries = entries as Array<{ entryKey: string; value: number }>;
    await withStudentStateWrite(
      db,
      userId,
      recruitedEntries.map((entry) => entry.entryKey),
      "sync_draft",
      async (lockedTx) => {
        for (const entry of recruitedEntries) {
          const [existing] = await lockedTx
            .select({
              recruitedStudentUid: pgStudentStatesTable.recruitedStudentUid,
              recruitedAt: pgStudentStatesTable.recruitedAt,
            })
            .from(pgStudentStatesTable)
            .where(and(eq(pgStudentStatesTable.userId, userId), eq(pgStudentStatesTable.studentUid, entry.entryKey)))
            .limit(1);
          await patchCanonicalStudentState(lockedTx, userId, entry.entryKey, {
            recruitedStudentUid: existing?.recruitedStudentUid ?? nanoid(8),
            recruitedAt: existing?.recruitedAt ?? new Date().toISOString(),
            tier: Number(entry.value),
          });
        }
        return;
      },
      options.sourceRef ?? null,
      null,
    );
    return;
  }
  for (let offset = 0; offset < entries.length; offset += PG_WRITE_CHUNK_SIZE) {
    const chunk = entries.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
    const deletes = chunk.filter((entry) => Number(entry.value) <= 0).map((entry) => entry.entryKey);
    if (deletes.length > 0) {
      await db
        .delete(pgGrowthResourceInventoryTable)
        .where(
          and(
            eq(pgGrowthResourceInventoryTable.userId, userId),
            inArray(pgGrowthResourceInventoryTable.itemUid, deletes),
          ),
        );
    }
    const inserts = chunk.filter((entry) => Number(entry.value) > 0);
    if (inserts.length > 0) {
      await db
        .insert(pgGrowthResourceInventoryTable)
        .values(
          inserts.map((entry) => ({
            uid: nanoid(8),
            userId,
            itemUid: entry.entryKey,
            quantity: Number(entry.value),
          })),
        )
        .onConflictDoUpdate({
          target: [pgGrowthResourceInventoryTable.userId, pgGrowthResourceInventoryTable.itemUid],
          set: { quantity: sql`excluded.quantity`, updatedAt: new Date() },
        });
    }
  }
}

type StudentStateApplyEntry = {
  entryKey: string;
  state: StudentStateDraftValue;
};

type StudentStateApplyMetadata = SyncDraftStudentStateMetadata;

async function applyCanonicalStudentStateEntries(
  db: SyncDraftDb,
  userId: number,
  entries: StudentStateApplyEntry[],
  options: {
    source: SyncDraftSource;
    metadataByKey?: Record<string, StudentStateApplyMetadata>;
  },
) {
  const currentFieldMap = {
    tier: "tier",
    level: "level",
    skillEx: "skillEx",
    skillNormal: "skillNormal",
    skillEnhanced: "skillEnhanced",
    skillSub: "skillSub",
    equip1: "equip1",
    equip2: "equip2",
    equip3: "equip3",
    equipSpecial: "equipSpecial",
    weaponLevel: "weaponLevel",
    abilityHp: "abilityHp",
    abilityAtk: "abilityAtk",
    abilityHeal: "abilityHeal",
  } as const;
  const targetFieldMap = {
    targetTier: "targetTier",
    targetLevel: "targetLevel",
    targetWeaponLevel: "targetWeaponLevel",
    targetSkillEx: "targetSkillEx",
    targetSkillNormal: "targetSkillNormal",
    targetSkillEnhanced: "targetSkillEnhanced",
    targetSkillSub: "targetSkillSub",
    targetEquip1: "targetEquip1",
    targetEquip2: "targetEquip2",
    targetEquip3: "targetEquip3",
    targetEquipSpecial: "targetEquipSpecial",
    targetAbilityHp: "targetAbilityHp",
    targetAbilityAtk: "targetAbilityAtk",
    targetAbilityHeal: "targetAbilityHeal",
  } as const;

  for (const { entryKey: studentUid, state } of entries) {
    const metadata = options.metadataByKey?.[studentUid] ?? { initialTier: 1, hasGear: true };
    if (state.current) {
      const [existing] = await db
        .select()
        .from(pgStudentStatesTable)
        .where(and(eq(pgStudentStatesTable.userId, userId), eq(pgStudentStatesTable.studentUid, studentUid)))
        .limit(1);
      const currentPatch: Record<string, unknown> = {};
      for (const [sourceField, targetField] of Object.entries(currentFieldMap)) {
        const fieldDefinition = studentStateCurrentFields.find(({ key }) => key === sourceField);
        const value = state.current[sourceField as keyof typeof currentFieldMap];
        if (
          isStudentStateDraftFieldProvided(state, "current", sourceField) &&
          shouldApplyCanonicalStudentStateField(options.source, value, fieldDefinition, metadata)
        ) {
          currentPatch[targetField] = value ?? null;
        }
      }
      if (Object.keys(currentPatch).length > 0 || existing?.recruitedStudentUid != null) {
        if (existing?.recruitedStudentUid == null) {
          currentPatch.recruitedStudentUid = nanoid(8);
          currentPatch.recruitedAt = new Date().toISOString();
          if (!Object.hasOwn(currentPatch, "tier")) currentPatch.tier = metadata.initialTier;
        }
        assertMergedStateFitsTier(existing, currentPatch);
        await patchCanonicalStudentState(
          db,
          userId,
          studentUid,
          currentPatch as Parameters<typeof patchCanonicalStudentState>[3],
        );
      }

      if (
        isStudentStateDraftFieldProvided(state, "current", "bond") &&
        shouldApplyCanonicalStudentStateField(
          options.source,
          state.current.bond,
          studentStateCurrentFields.find(({ key }) => key === "bond"),
          metadata,
        )
      ) {
        await patchCanonicalRelationship(db, userId, studentUid, { currentLevel: state.current.bond });
      }
    }

    if (state.target) {
      const [existing] = await db
        .select()
        .from(pgStudentTargetsTable)
        .where(and(eq(pgStudentTargetsTable.userId, userId), eq(pgStudentTargetsTable.studentUid, studentUid)))
        .limit(1);
      const targetPatch: Record<string, unknown> = {};
      let hasGrowthTargetField = existing?.studentGrowthUid != null;
      for (const [sourceField, targetField] of Object.entries(targetFieldMap)) {
        const fieldDefinition = studentStateTargetFields.find(({ key }) => key === sourceField);
        const value = state.target[sourceField as keyof typeof targetFieldMap];
        if (
          isStudentStateDraftFieldProvided(state, "target", sourceField) &&
          shouldApplyCanonicalStudentStateField(options.source, value, fieldDefinition, metadata)
        ) {
          targetPatch[targetField] = value;
          if (value != null) hasGrowthTargetField = true;
        }
      }
      if (hasGrowthTargetField) {
        if (tierBoundTargetFields.some((field) => Object.hasOwn(targetPatch, field))) {
          const [currentState] = await db
            .select({ tier: pgStudentStatesTable.tier })
            .from(pgStudentStatesTable)
            .where(and(eq(pgStudentStatesTable.userId, userId), eq(pgStudentStatesTable.studentUid, studentUid)))
            .limit(1);
          assertMergedTargetFitsTier(existing, targetPatch, currentState?.tier ?? null);
        }
        targetPatch.studentGrowthUid = existing?.studentGrowthUid ?? nanoid(8);
        targetPatch.plannerAddedAt = existing?.plannerAddedAt ?? new Date().toISOString();
        await patchCanonicalStudentTarget(
          db,
          userId,
          studentUid,
          targetPatch as Parameters<typeof patchCanonicalStudentTarget>[3],
        );
      }
      if (
        isStudentStateDraftFieldProvided(state, "target", "targetBond") &&
        shouldApplyCanonicalStudentStateField(
          options.source,
          state.target.targetBond,
          studentStateTargetFields.find(({ key }) => key === "targetBond"),
          metadata,
        )
      ) {
        await patchCanonicalRelationship(db, userId, studentUid, { targetLevel: state.target.targetBond });
      }
    }
  }
}

const tierBoundCurrentFields = ["tier", "weaponLevel", "abilityHp", "abilityAtk", "abilityHeal"] as const;
const tierBoundTargetFields = [
  "targetTier",
  "targetWeaponLevel",
  "targetAbilityHp",
  "targetAbilityAtk",
  "targetAbilityHeal",
] as const;

/** Merge a patch over the stored row: an own key (even null) replaces the stored value, an omitted key keeps it. */
function mergeStoredFields<Field extends string>(
  stored: Partial<Record<Field, number | null>> | null | undefined,
  patch: Record<string, unknown>,
  fields: readonly Field[],
): Record<Field, number | null> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      Object.hasOwn(patch, field) ? ((patch[field] as number | null) ?? null) : (stored?.[field] ?? null),
    ]),
  ) as Record<Field, number | null>;
}

/** Only patches that touch a tier-bound field are checked, so unrelated edits are not blocked by stored data. */
function assertMergedStateFitsTier(
  stored: Partial<Record<(typeof tierBoundCurrentFields)[number], number | null>> | null | undefined,
  patch: Record<string, unknown>,
) {
  if (!tierBoundCurrentFields.some((field) => Object.hasOwn(patch, field))) return;
  const merged = mergeStoredFields(stored, patch, tierBoundCurrentFields);
  try {
    assertWeaponLevelRange(merged.weaponLevel, merged.tier, "고유무기 레벨");
    assertAbilityReleaseAvailable([merged.abilityHp, merged.abilityAtk, merged.abilityHeal], merged.tier, "능력 해방");
  } catch {
    throw new StudentStateMergeConflictError();
  }
}

function assertMergedTargetFitsTier(
  stored: Partial<Record<(typeof tierBoundTargetFields)[number], number | null>> | null | undefined,
  patch: Record<string, unknown>,
  currentTier: number | null,
) {
  const merged = mergeStoredFields(stored, patch, tierBoundTargetFields);
  const tier = merged.targetTier ?? currentTier;
  try {
    assertWeaponLevelRange(merged.targetWeaponLevel, tier, "목표 고유무기 레벨");
    assertAbilityReleaseAvailable(
      [merged.targetAbilityHp, merged.targetAbilityAtk, merged.targetAbilityHeal],
      tier,
      "목표 능력 해방",
    );
  } catch {
    throw new StudentStateMergeConflictError();
  }
}

function shouldApplyCanonicalStudentStateField(
  source: SyncDraftSource,
  value: number | null,
  field: (typeof studentStateCurrentFields)[number] | (typeof studentStateTargetFields)[number] | undefined,
  metadata: StudentStateApplyMetadata,
): boolean {
  if (!field || (field.gearOnly && !metadata.hasGear)) return false;
  if (source !== "web" && source !== "connect") return true;
  if (value == null) return true;
  const minimum = field.kind === "tier" ? metadata.initialTier : field.min;
  return value > minimum;
}

function parseStudentStateDraftEntries(
  entries: SyncDraftEntry[],
): { entryKey: string; value: StudentStateDraftValue }[] {
  return entries.map((entry) => ({ entryKey: entry.entryKey, value: parseStudentStateDraftValue(entry) }));
}

function normalizeItemInventoryValue(value: unknown): number {
  const normalizedValue = normalizeIntegerValue(value, "아이템 수량은 0 이상의 정수만 입력해주세요");
  if (normalizedValue < 0) throw new Error("아이템 수량은 0 이상의 정수만 입력해주세요");
  return normalizedValue;
}

function normalizeStudentTierValue(value: unknown): number {
  const normalizedValue = normalizeIntegerValue(value, "학생 등급은 1부터 9까지의 정수만 입력해주세요");
  if (normalizedValue < 1 || normalizedValue > 9) throw new Error("학생 등급은 1부터 9까지의 정수만 입력해주세요");
  return normalizedValue;
}

function normalizeIntegerValue(value: unknown, errorMessage: string): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error(errorMessage);
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) throw new Error(errorMessage);
    return Number(trimmed);
  }
  throw new Error(errorMessage);
}
