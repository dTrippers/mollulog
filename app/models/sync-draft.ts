import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import {
  pgGrowthResourceInventoryTable,
  pgRecruitedStudentsTable,
  pgRelationshipLevelsTable,
  pgStudentGrowthTable,
  pgSyncDraftEntriesTable,
  pgSyncDraftsTable,
} from "~/db/postgres/schema";
import { parseStudentStateDraftValue, type StudentStateDraftValue } from "~/domain/student-state";
import { withPostgresClient } from "~/lib/postgres.server";

const PG_WRITE_CHUNK_SIZE = 500;
const PG_IN_QUERY_CHUNK_SIZE = 500;
type SyncDraftDb = Pick<NodePgDatabase, "select" | "insert" | "update" | "delete" | "execute">;

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
  entries: Array<SyncDraftEntryUpdateInput & { meta?: unknown }>;
};

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
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
          preserveNullStudentStateFields: input.source === "first_party_ocr",
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
      const normalizedEntries = normalizeSyncDraftEntryUpdates(draft.type, entries);
      assertEntryKeysMatchDraft(draft.entries, normalizedEntries);
      const now = new Date();
      for (let offset = 0; offset < normalizedEntries.length; offset += PG_WRITE_CHUNK_SIZE) {
        const chunk = normalizedEntries.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
        const values = sql.join(
          chunk.map((entry) => sql`(${entry.entryKey}, ${entry.value}, ${entry.valueJson})`),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE ${syncDraftEntriesTable} AS entries
          SET "value" = incoming."value",
              "value_json" = incoming."value_json",
              "updated_at" = ${now}
          FROM (VALUES ${values}) AS incoming("entry_key", "value", "value_json")
          WHERE entries."draft_uid" = ${draftUid}
            AND entries."entry_key" = incoming."entry_key"
        `);
      }
      await tx.update(syncDraftsTable).set({ updatedAt: now }).where(eq(syncDraftsTable.uid, draftUid));
    });
  });
}

export async function applySyncDraft(env: Env, userId: number, draftUid: string) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      const draft = await getPendingOwnedSyncDraftFromDb(tx, userId, draftUid, true);
      const normalizedEntries =
        draft.type === "student_state"
          ? parseStudentStateDraftEntries(draft.entries)
          : normalizeSyncDraftEntryUpdates(draft.type, draft.entries);
      await applyEntries(tx, userId, draft.type, normalizedEntries, {
        preserveNullStudentStateFields: draft.source === "first_party_ocr",
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
  options: { preserveNullStudentStateFields: boolean },
) {
  if (type === "student_state") {
    await applyStudentStateEntries(
      db,
      userId,
      entries.map((entry) => ({ entryKey: entry.entryKey, state: entry.value as StudentStateDraftValue })),
      options,
    );
    return;
  }
  for (let offset = 0; offset < entries.length; offset += PG_WRITE_CHUNK_SIZE) {
    const chunk = entries.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
    if (type === "item_inventory") {
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
    } else {
      await db
        .insert(pgRecruitedStudentsTable)
        .values(
          chunk.map((entry) => ({
            uid: nanoid(8),
            userId,
            studentUid: entry.entryKey,
            tier: Number(entry.value),
          })),
        )
        .onConflictDoUpdate({
          target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
          set: { tier: sql`excluded.tier`, updatedAt: new Date() },
        });
    }
  }
}

type StudentStateApplyEntry = {
  entryKey: string;
  state: StudentStateDraftValue;
};

async function applyStudentStateEntries(
  db: SyncDraftDb,
  userId: number,
  entries: StudentStateApplyEntry[],
  options: { preserveNullStudentStateFields: boolean },
) {
  const currentStates = entries.flatMap((entry) =>
    entry.state.current ? [{ studentUid: entry.entryKey, state: entry.state.current }] : [],
  );
  const targetGrowths = entries.flatMap((entry) =>
    entry.state.target ? [{ studentUid: entry.entryKey, target: entry.state.target }] : [],
  );
  const currentBonds = currentStates.flatMap((entry) =>
    entry.state.bond == null ? [] : [{ studentId: entry.studentUid, currentLevel: entry.state.bond }],
  );
  const targetBonds = targetGrowths.flatMap((entry) =>
    entry.target.targetBond == null ? [] : [{ studentId: entry.studentUid, targetLevel: entry.target.targetBond }],
  );

  await forEachChunk(currentStates, PG_WRITE_CHUNK_SIZE, async (chunk) => {
    await db
      .insert(pgRecruitedStudentsTable)
      .values(
        chunk.map(({ studentUid, state }) => ({
          uid: nanoid(8),
          userId,
          studentUid,
          tier: state.tier,
          level: state.level,
          skillEx: state.skillEx,
          skillNormal: state.skillNormal,
          skillEnhanced: state.skillEnhanced,
          skillSub: state.skillSub,
          equip1: state.equip1,
          equip2: state.equip2,
          equip3: state.equip3,
          equipSpecial: state.equipSpecial,
          weaponLevel: state.weaponLevel,
          abilityHp: state.abilityHp,
          abilityAtk: state.abilityAtk,
          abilityHeal: state.abilityHeal,
        })),
      )
      .onConflictDoUpdate({
        target: [pgRecruitedStudentsTable.userId, pgRecruitedStudentsTable.studentUid],
        set: recruitedStudentConflictSet(options.preserveNullStudentStateFields),
      });
  });

  const relationshipLevels = await readRelationshipLevels(db, userId, [
    ...currentBonds.map((entry) => entry.studentId),
    ...targetBonds.map((entry) => entry.studentId),
  ]);

  const currentBondValues = currentBonds.map(({ studentId, currentLevel }) => {
    const existing = relationshipLevels.get(studentId);
    const targetLevel = existing?.targetLevel ?? currentLevel;
    relationshipLevels.set(studentId, { currentLevel, targetLevel });
    return {
      uid: nanoid(8),
      userId,
      studentId,
      currentLevel,
      currentExp: null,
      targetLevel,
      items: {},
    };
  });
  await forEachChunk(currentBondValues, PG_WRITE_CHUNK_SIZE, async (chunk) => {
    await db
      .insert(pgRelationshipLevelsTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: [pgRelationshipLevelsTable.userId, pgRelationshipLevelsTable.studentId],
        set: {
          currentLevel: sql`excluded.current_level`,
          currentExp: sql`excluded.current_exp`,
          updatedAt: new Date(),
        },
      });
  });

  await forEachChunk(targetGrowths, PG_WRITE_CHUNK_SIZE, async (chunk) => {
    await db
      .insert(pgStudentGrowthTable)
      .values(
        chunk.map(({ studentUid, target }) => ({
          uid: nanoid(8),
          userId,
          studentUid,
          targetLevel: target.targetLevel,
          targetSkillEx: target.targetSkillEx,
          targetSkillNormal: target.targetSkillNormal,
          targetSkillEnhanced: target.targetSkillEnhanced,
          targetSkillSub: target.targetSkillSub,
          targetEquip1: target.targetEquip1,
          targetEquip2: target.targetEquip2,
          targetEquip3: target.targetEquip3,
          targetEquipSpecial: target.targetEquipSpecial,
          targetTier: target.targetTier,
          targetWeaponLevel: target.targetWeaponLevel,
          targetAbilityHp: target.targetAbilityHp,
          targetAbilityAtk: target.targetAbilityAtk,
          targetAbilityHeal: target.targetAbilityHeal,
        })),
      )
      .onConflictDoUpdate({
        target: [pgStudentGrowthTable.userId, pgStudentGrowthTable.studentUid],
        set: {
          targetLevel: sql`excluded.target_level`,
          targetSkillEx: sql`excluded.target_skill_ex`,
          targetSkillNormal: sql`excluded.target_skill_normal`,
          targetSkillEnhanced: sql`excluded.target_skill_enhanced`,
          targetSkillSub: sql`excluded.target_skill_sub`,
          targetEquip1: sql`excluded.target_equip1`,
          targetEquip2: sql`excluded.target_equip2`,
          targetEquip3: sql`excluded.target_equip3`,
          targetEquipSpecial: sql`excluded.target_equip_special`,
          targetTier: sql`excluded.target_tier`,
          targetWeaponLevel: sql`excluded.target_weapon_level`,
          targetAbilityHp: sql`excluded.target_ability_hp`,
          targetAbilityAtk: sql`excluded.target_ability_atk`,
          targetAbilityHeal: sql`excluded.target_ability_heal`,
          updatedAt: new Date(),
        },
      });
  });

  const targetBondValues = targetBonds.map(({ studentId, targetLevel }) => {
    const existing = relationshipLevels.get(studentId);
    const currentLevel = existing?.currentLevel ?? 1;
    relationshipLevels.set(studentId, { currentLevel, targetLevel });
    return {
      uid: nanoid(8),
      userId,
      studentId,
      currentLevel,
      currentExp: null,
      targetLevel,
      items: {},
    };
  });
  await forEachChunk(targetBondValues, PG_WRITE_CHUNK_SIZE, async (chunk) => {
    await db
      .insert(pgRelationshipLevelsTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: [pgRelationshipLevelsTable.userId, pgRelationshipLevelsTable.studentId],
        set: {
          targetLevel: sql`excluded.target_level`,
          updatedAt: new Date(),
        },
      });
  });
}

function recruitedStudentConflictSet(preserveNullFields: boolean) {
  const input = {
    tier: sql`excluded.tier`,
    level: sql`excluded.level`,
    skillEx: sql`excluded.skill_ex`,
    skillNormal: sql`excluded.skill_normal`,
    skillEnhanced: sql`excluded.skill_enhanced`,
    skillSub: sql`excluded.skill_sub`,
    equip1: sql`excluded.equip1`,
    equip2: sql`excluded.equip2`,
    equip3: sql`excluded.equip3`,
    equipSpecial: sql`excluded.equip_special`,
    weaponLevel: sql`excluded.weapon_level`,
    abilityHp: sql`excluded.ability_hp`,
    abilityAtk: sql`excluded.ability_atk`,
    abilityHeal: sql`excluded.ability_heal`,
    updatedAt: new Date(),
  };
  if (!preserveNullFields) return input;
  return {
    tier: input.tier,
    level: sql`coalesce(excluded.level, recruited_students.level)`,
    skillEx: sql`coalesce(excluded.skill_ex, recruited_students.skill_ex)`,
    skillNormal: sql`coalesce(excluded.skill_normal, recruited_students.skill_normal)`,
    skillEnhanced: sql`coalesce(excluded.skill_enhanced, recruited_students.skill_enhanced)`,
    skillSub: sql`coalesce(excluded.skill_sub, recruited_students.skill_sub)`,
    equip1: sql`coalesce(excluded.equip1, recruited_students.equip1)`,
    equip2: sql`coalesce(excluded.equip2, recruited_students.equip2)`,
    equip3: sql`coalesce(excluded.equip3, recruited_students.equip3)`,
    equipSpecial: sql`coalesce(excluded.equip_special, recruited_students.equip_special)`,
    weaponLevel: sql`coalesce(excluded.weapon_level, recruited_students.weapon_level)`,
    abilityHp: sql`coalesce(excluded.ability_hp, recruited_students.ability_hp)`,
    abilityAtk: sql`coalesce(excluded.ability_atk, recruited_students.ability_atk)`,
    abilityHeal: sql`coalesce(excluded.ability_heal, recruited_students.ability_heal)`,
    updatedAt: input.updatedAt,
  };
}

async function readRelationshipLevels(db: SyncDraftDb, userId: number, studentIds: string[]) {
  const relationshipLevels = new Map<string, { currentLevel: number; targetLevel: number }>();
  const uniqueStudentIds = [...new Set(studentIds)];
  await forEachChunk(uniqueStudentIds, PG_IN_QUERY_CHUNK_SIZE, async (chunk) => {
    const rows = await db
      .select({
        studentId: pgRelationshipLevelsTable.studentId,
        currentLevel: pgRelationshipLevelsTable.currentLevel,
        targetLevel: pgRelationshipLevelsTable.targetLevel,
      })
      .from(pgRelationshipLevelsTable)
      .where(and(eq(pgRelationshipLevelsTable.userId, userId), inArray(pgRelationshipLevelsTable.studentId, chunk)));
    for (const row of rows) {
      relationshipLevels.set(row.studentId, { currentLevel: row.currentLevel, targetLevel: row.targetLevel });
    }
  });
  return relationshipLevels;
}

async function forEachChunk<T>(rows: T[], size: number, callback: (chunk: T[]) => Promise<void>) {
  for (let offset = 0; offset < rows.length; offset += size) {
    await callback(rows.slice(offset, offset + size));
  }
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
