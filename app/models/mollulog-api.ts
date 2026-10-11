import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgApiKeyEventsTable, pgApiKeysTable, pgSenseisTable, pgStudentStatesTable } from "~/db/postgres/schema";
import {
  isStudentNullableSemanticsEnabledInTransaction,
  patchCanonicalStudentState,
  type StudentStateApiActor,
  type StudentStateTransaction,
  withStudentStateProjection,
} from "~/db/postgres/student-state-projection";
import {
  API_AUDIT_HISTORY_DIRECT_SOURCES,
  API_AUDIT_HISTORY_FILTERS,
  type ApiAuditHistoryFilter,
} from "~/domain/api-audit-history";
import {
  ApiInputError,
  type ApiStudentState,
  type ApiStudentStatePatch,
  type ApiStudentStateValues,
  isApiStudentStateNoop,
  mergeAndValidateApiStudentState,
  toApiStudentState,
} from "~/domain/mollulog-api";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export const API_KEY_LIFETIME_MONTHS = 3;
export const API_WRITE_LIMIT = 500;
export const API_WRITE_WINDOW_MS = 10 * 60 * 1000;

export type ApiRepositoryOptions = { ctx?: ExecutionContext; createClient?: PostgresClientFactory };
type ApiDatabase = NodePgDatabase;

export type PersonalApiKey = {
  uid: string;
  name: string;
  keyPrefix: string;
  readScope: boolean;
  writeScope: boolean;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type AuthenticatedApiKey = Pick<PersonalApiKey, "uid" | "name" | "readScope" | "writeScope"> & {
  userId: number;
};

export type ApiKeyAuthentication =
  | { kind: "invalid" }
  | { kind: "inactive" }
  | { kind: "authenticated"; key: AuthenticatedApiKey };

async function withApiDatabase<T>(
  env: Env,
  options: ApiRepositoryOptions,
  operation: (db: ApiDatabase) => Promise<T>,
): Promise<T> {
  return withPostgresClient(
    env,
    (client) => operation(drizzle(client)),
    options.createClient ?? createPostgresClient,
    options.ctx,
  );
}

export async function isApiStudentStateAvailable(env: Env, options: ApiRepositoryOptions = {}): Promise<boolean> {
  return withApiDatabase(env, options, (db) =>
    db.transaction((tx) => isStudentNullableSemanticsEnabledInTransaction(tx)),
  );
}

function toHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createRawApiKey(): string {
  return `mllg_live_${toHex(crypto.getRandomValues(new Uint8Array(32)))}`;
}

async function hashApiKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

function addCalendarMonths(value: Date, months: number): Date {
  const target = new Date(value);
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export async function createPersonalApiKey(
  env: Env,
  userId: number,
  input: { name: string; readScope: boolean; writeScope: boolean },
  options: ApiRepositoryOptions = {},
): Promise<{ key: PersonalApiKey; token: string }> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 80) {
    throw new ApiInputError("키 이름은 1자부터 80자까지 입력해주세요", [
      { field: "name", message: "키 이름은 1자부터 80자까지 입력해주세요" },
    ]);
  }
  if (!input.readScope && !input.writeScope) {
    throw new ApiInputError("읽기 또는 쓰기 권한을 하나 이상 선택해주세요", [
      { field: "scopes", message: "권한을 하나 이상 선택해주세요" },
    ]);
  }

  const token = createRawApiKey();
  const now = new Date();
  const uid = nanoid(12);
  const expiresAt = addCalendarMonths(now, API_KEY_LIFETIME_MONTHS);
  const [inserted] = await withApiDatabase(env, options, async (db) =>
    db.transaction(async (tx) => {
      const [key] = await tx
        .insert(pgApiKeysTable)
        .values({
          uid,
          userId,
          name,
          keyHash: await hashApiKey(token),
          keyPrefix: token.slice(0, 17),
          readScope: input.readScope,
          writeScope: input.writeScope,
          expiresAt,
        })
        .returning();
      await tx.insert(pgApiKeyEventsTable).values({
        userId,
        apiKeyUid: uid,
        apiKeyName: name,
        action: "issued",
      });
      return [key];
    }),
  );
  return { key: toPersonalApiKey(inserted), token };
}

function toPersonalApiKey(row: typeof pgApiKeysTable.$inferSelect): PersonalApiKey {
  return {
    uid: row.uid,
    name: row.name,
    keyPrefix: row.keyPrefix,
    readScope: row.readScope,
    writeScope: row.writeScope,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

export async function getPersonalApiKeys(
  env: Env,
  userId: number,
  options: ApiRepositoryOptions = {},
): Promise<PersonalApiKey[]> {
  return withApiDatabase(env, options, async (db) => {
    const rows = await db
      .select()
      .from(pgApiKeysTable)
      .where(eq(pgApiKeysTable.userId, userId))
      .orderBy(desc(pgApiKeysTable.createdAt), desc(pgApiKeysTable.id));
    return rows.map(toPersonalApiKey);
  });
}

export async function revokePersonalApiKey(
  env: Env,
  userId: number,
  uid: string,
  options: ApiRepositoryOptions = {},
): Promise<boolean> {
  return withApiDatabase(env, options, async (db) =>
    db.transaction(async (tx) => {
      const [key] = await tx
        .update(pgApiKeysTable)
        .set({ revokedAt: new Date() })
        .where(and(eq(pgApiKeysTable.userId, userId), eq(pgApiKeysTable.uid, uid), isNull(pgApiKeysTable.revokedAt)))
        .returning({ uid: pgApiKeysTable.uid, name: pgApiKeysTable.name });
      if (!key) return false;
      await tx.insert(pgApiKeyEventsTable).values({
        userId,
        apiKeyUid: key.uid,
        apiKeyName: key.name,
        action: "revoked",
      });
      return true;
    }),
  );
}

export async function authenticatePersonalApiKey(
  env: Env,
  token: string,
  options: ApiRepositoryOptions = {},
  now = new Date(),
): Promise<ApiKeyAuthentication> {
  if (!/^mllg_live_[a-f0-9]{64}$/.test(token)) return { kind: "invalid" };
  const keyHash = await hashApiKey(token);
  return withApiDatabase(env, options, async (db) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({ key: pgApiKeysTable, active: pgSenseisTable.active })
        .from(pgApiKeysTable)
        .innerJoin(pgSenseisTable, eq(pgSenseisTable.id, pgApiKeysTable.userId))
        .where(eq(pgApiKeysTable.keyHash, keyHash))
        .for("update", { of: pgApiKeysTable })
        .limit(1);
      if (!row || row.key.revokedAt != null || row.key.expiresAt <= now) return { kind: "invalid" };
      if (!row.active) return { kind: "inactive" };
      await tx.update(pgApiKeysTable).set({ lastUsedAt: now }).where(eq(pgApiKeysTable.id, row.key.id));
      return {
        kind: "authenticated",
        key: {
          uid: row.key.uid,
          name: row.key.name,
          userId: row.key.userId,
          readScope: row.key.readScope,
          writeScope: row.key.writeScope,
        },
      };
    }),
  );
}

export type ApiWriteQuotaResult =
  | { allowed: true; used: number; resetsAt: Date }
  | { allowed: false; used: number; resetsAt: Date; retryAfterSeconds: number };

export async function reserveApiWriteQuota(
  env: Env,
  userId: number,
  options: ApiRepositoryOptions = {},
  now = new Date(),
): Promise<ApiWriteQuotaResult> {
  return withPostgresClient(
    env,
    async (client) => {
      const reserved = await client.query<{ window_started_at: Date; request_count: number; resets_at: Date }>(
        `INSERT INTO api_write_quotas (user_id, window_started_at, request_count, updated_at)
         VALUES ($1, $2, 1, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           window_started_at = CASE
             WHEN api_write_quotas.window_started_at <= $2::timestamptz - ($4::bigint * interval '1 millisecond') THEN $2
             ELSE api_write_quotas.window_started_at
           END,
           request_count = CASE
             WHEN api_write_quotas.window_started_at <= $2::timestamptz - ($4::bigint * interval '1 millisecond') THEN 1
             ELSE api_write_quotas.request_count + 1
           END,
           updated_at = $2
         WHERE api_write_quotas.window_started_at <= $2::timestamptz - ($4::bigint * interval '1 millisecond')
            OR api_write_quotas.request_count < $3
         RETURNING window_started_at, request_count,
                   window_started_at + ($4::bigint * interval '1 millisecond') AS resets_at`,
        [userId, now, API_WRITE_LIMIT, API_WRITE_WINDOW_MS],
      );
      if (reserved.rows[0]) {
        const row = reserved.rows[0];
        return { allowed: true, used: row.request_count, resetsAt: row.resets_at };
      }
      const current = await client.query<{ window_started_at: Date; request_count: number; resets_at: Date }>(
        `SELECT window_started_at, request_count,
                window_started_at + ($2::bigint * interval '1 millisecond') AS resets_at
           FROM api_write_quotas WHERE user_id = $1`,
        [userId, API_WRITE_WINDOW_MS],
      );
      const row = current.rows[0];
      if (!row) throw new Error("API write quota reservation disappeared.");
      const retryAfterSeconds = Math.max(1, Math.ceil((row.resets_at.getTime() - now.getTime()) / 1000));
      return { allowed: false, used: row.request_count, resetsAt: row.resets_at, retryAfterSeconds };
    },
    options.createClient ?? createPostgresClient,
    options.ctx,
  );
}

export type ApiStudentStateRow = {
  studentUid: string;
  recruitedStudentUid: string | null;
  state: ApiStudentState;
  createdAt: Date;
  updatedAt: Date;
};

function fromStateRow(row: typeof pgStudentStatesTable.$inferSelect): ApiStudentStateValues {
  return {
    tier: row.tier,
    level: row.level,
    skillEx: row.skillEx,
    skillNormal: row.skillNormal,
    skillEnhanced: row.skillEnhanced,
    skillSub: row.skillSub,
    equip1: row.equip1,
    equip2: row.equip2,
    equip3: row.equip3,
    equip1Level: row.equip1Level,
    equip2Level: row.equip2Level,
    equip3Level: row.equip3Level,
    equipSpecial: row.equipSpecial,
    weaponLevel: row.weaponLevel,
    abilityHp: row.abilityHp,
    abilityAtk: row.abilityAtk,
    abilityHeal: row.abilityHeal,
    bond: row.relationshipCurrentLevel,
    bondExp: row.relationshipCurrentExp,
  };
}

const emptyApiStudentState: ApiStudentStateValues = {
  tier: null,
  level: null,
  skillEx: null,
  skillNormal: null,
  skillEnhanced: null,
  skillSub: null,
  equip1: null,
  equip2: null,
  equip3: null,
  equip1Level: null,
  equip2Level: null,
  equip3Level: null,
  equipSpecial: null,
  weaponLevel: null,
  abilityHp: null,
  abilityAtk: null,
  abilityHeal: null,
  bond: null,
  bondExp: null,
};

export async function getApiRecruitedStudent(
  env: Env,
  userId: number,
  studentUid: string,
  options: ApiRepositoryOptions = {},
): Promise<ApiStudentStateRow | null> {
  return withApiDatabase(env, options, async (db) => {
    const [row] = await db
      .select()
      .from(pgStudentStatesTable)
      .where(
        and(
          eq(pgStudentStatesTable.userId, userId),
          eq(pgStudentStatesTable.studentUid, studentUid),
          isNotNull(pgStudentStatesTable.recruitedStudentUid),
          isNull(pgStudentStatesTable.deletedAt),
        ),
      )
      .limit(1);
    return row
      ? {
          studentUid: row.studentUid,
          recruitedStudentUid: row.recruitedStudentUid,
          state: toApiStudentState(fromStateRow(row)),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : null;
  });
}

export async function getApiRecruitedStudents(
  env: Env,
  userId: number,
  options: ApiRepositoryOptions = {},
  page: { afterStudentUid?: string | null; limit: number } = { limit: 51 },
): Promise<ApiStudentStateRow[]> {
  return withApiDatabase(env, options, async (db) => {
    const conditions = [
      eq(pgStudentStatesTable.userId, userId),
      isNotNull(pgStudentStatesTable.recruitedStudentUid),
      isNull(pgStudentStatesTable.deletedAt),
    ];
    if (page.afterStudentUid) conditions.push(gt(pgStudentStatesTable.studentUid, page.afterStudentUid));
    const rows = await db
      .select()
      .from(pgStudentStatesTable)
      .where(and(...conditions))
      .orderBy(pgStudentStatesTable.studentUid)
      .limit(Math.max(1, Math.min(101, Math.trunc(page.limit))));
    return rows.map((row) => ({
      studentUid: row.studentUid,
      recruitedStudentUid: row.recruitedStudentUid,
      state: toApiStudentState(fromStateRow(row)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  });
}

function toCanonicalPatch(values: ApiStudentStateValues) {
  return {
    tier: values.tier,
    level: values.level,
    skillEx: values.skillEx,
    skillNormal: values.skillNormal,
    skillEnhanced: values.skillEnhanced,
    skillSub: values.skillSub,
    equip1: values.equip1,
    equip2: values.equip2,
    equip3: values.equip3,
    equip1Level: values.equip1Level,
    equip2Level: values.equip2Level,
    equip3Level: values.equip3Level,
    equipSpecial: values.equipSpecial,
    weaponLevel: values.weaponLevel,
    abilityHp: values.abilityHp,
    abilityAtk: values.abilityAtk,
    abilityHeal: values.abilityHeal,
    relationshipCurrentLevel: values.bond,
    relationshipCurrentExp: values.bondExp,
  };
}

async function getCurrentRow(
  tx: StudentStateTransaction,
  userId: number,
  studentUid: string,
): Promise<typeof pgStudentStatesTable.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(pgStudentStatesTable)
    .where(and(eq(pgStudentStatesTable.userId, userId), eq(pgStudentStatesTable.studentUid, studentUid)))
    .limit(1);
  return row ?? null;
}

export type ApiStudentRegistrationResult =
  | { kind: "created"; state: ApiStudentState; changed: boolean }
  | { kind: "already_recruited" };

export type ApiStudentPatchResult =
  | { kind: "updated"; state: ApiStudentState; changed: boolean }
  | { kind: "not_recruited" };

export async function registerApiRecruitedStudent(
  env: Env,
  userId: number,
  studentUid: string,
  patch: ApiStudentStatePatch,
  apiActor: StudentStateApiActor,
  options: ApiRepositoryOptions = {},
): Promise<ApiStudentRegistrationResult> {
  return withApiDatabase(env, options, async (db) =>
    db.transaction(async (tx) =>
      withStudentStateProjection(
        tx,
        userId,
        [studentUid],
        "api",
        async (stateTx, context) => {
          if (context.mode !== "nullable") throw new Error("Canonical API student state is unavailable.");
          const existing = await getCurrentRow(stateTx, userId, studentUid);
          if (existing?.recruitedStudentUid != null && existing.deletedAt == null) {
            return { kind: "already_recruited" };
          }
          const merged = mergeAndValidateApiStudentState(
            existing ? fromStateRow(existing) : emptyApiStudentState,
            patch,
            true,
          );
          const canonical = {
            ...toCanonicalPatch(merged),
            recruitedStudentUid: nanoid(8),
            recruitedAt: new Date().toISOString(),
            deletedAt: null,
          };
          await patchCanonicalStudentState(stateTx, userId, studentUid, canonical);
          return { kind: "created", state: toApiStudentState(merged), changed: true };
        },
        apiActor.apiKeyUid,
        "nullable",
        apiActor,
      ),
    ),
  );
}

export async function patchApiRecruitedStudent(
  env: Env,
  userId: number,
  studentUid: string,
  patch: ApiStudentStatePatch,
  apiActor: StudentStateApiActor,
  options: ApiRepositoryOptions = {},
): Promise<ApiStudentPatchResult> {
  return withApiDatabase(env, options, async (db) =>
    db.transaction(async (tx) =>
      withStudentStateProjection(
        tx,
        userId,
        [studentUid],
        "api",
        async (stateTx, context) => {
          if (context.mode !== "nullable") throw new Error("Canonical API student state is unavailable.");
          const existing = await getCurrentRow(stateTx, userId, studentUid);
          if (!existing?.recruitedStudentUid || existing.deletedAt != null) return { kind: "not_recruited" };
          const before = fromStateRow(existing);
          const merged = mergeAndValidateApiStudentState(before, patch);
          const changed = !isApiStudentStateNoop(before, merged);
          if (changed) await patchCanonicalStudentState(stateTx, userId, studentUid, toCanonicalPatch(merged));
          return { kind: "updated", state: toApiStudentState(merged), changed };
        },
        apiActor.apiKeyUid,
        "nullable",
        apiActor,
      ),
    ),
  );
}

export async function deleteApiRecruitedStudent(
  env: Env,
  userId: number,
  studentUid: string,
  apiActor: StudentStateApiActor,
  options: ApiRepositoryOptions = {},
): Promise<{ kind: "deleted" | "not_recruited" }> {
  return withApiDatabase(env, options, async (db) =>
    db.transaction(async (tx) =>
      withStudentStateProjection(
        tx,
        userId,
        [studentUid],
        "api",
        async (stateTx, context) => {
          if (context.mode !== "nullable") throw new Error("Canonical API student state is unavailable.");
          const existing = await getCurrentRow(stateTx, userId, studentUid);
          if (!existing?.recruitedStudentUid || existing.deletedAt != null) return { kind: "not_recruited" };
          await patchCanonicalStudentState(stateTx, userId, studentUid, {
            recruitedStudentUid: null,
            relationshipLevelUid: null,
            ...toCanonicalPatch(emptyApiStudentState),
            recruitedAt: null,
          });
          return { kind: "deleted" };
        },
        apiActor.apiKeyUid,
        "nullable",
        apiActor,
      ),
    ),
  );
}

export type ApiAuditEvent = {
  id: number;
  kind: "student" | "key";
  createdAt: string;
  studentUid: string | null;
  source: string;
  sourceRef: string | null;
  apiKeyUid: string | null;
  apiKeyName: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  action: "issued" | "revoked" | null;
};

function decodeAuditCursor(cursor: string): { createdAt: string; kind: string; id: number } | null {
  try {
    const parsed = JSON.parse(atob(cursor)) as { version?: unknown; createdAt?: unknown; kind?: unknown; id?: unknown };
    if (
      parsed.version !== 1 ||
      typeof parsed.createdAt !== "string" ||
      !Number.isSafeInteger(Date.parse(parsed.createdAt)) ||
      (parsed.kind !== "key" && parsed.kind !== "student") ||
      !Number.isSafeInteger(parsed.id)
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, kind: parsed.kind, id: parsed.id as number };
  } catch {
    return null;
  }
}

function encodeAuditCursor(event: ApiAuditEvent, cursorCreatedAt = event.createdAt): string {
  return btoa(JSON.stringify({ version: 1, createdAt: cursorCreatedAt, kind: event.kind, id: event.id }));
}

export async function getApiAuditHistory(
  env: Env,
  userId: number,
  input: { limit: number; cursor?: string | null; filter?: ApiAuditHistoryFilter },
  options: ApiRepositoryOptions = {},
): Promise<{ events: ApiAuditEvent[]; nextCursor: string | null }> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new ApiInputError("limit은 1부터 100 사이여야 해요", [
      { field: "limit", message: "1부터 100 사이의 정수를 보내주세요" },
    ]);
  }
  const limit = input.limit;
  const filter = input.filter ?? "all";
  if (!API_AUDIT_HISTORY_FILTERS.includes(filter)) {
    throw new ApiInputError("변경 기록 필터가 올바르지 않아요", [
      { field: "filter", message: "all, direct, data, recruitment, api 중 하나를 선택해주세요" },
    ]);
  }
  const cursor = input.cursor ? decodeAuditCursor(input.cursor) : null;
  if (input.cursor && !cursor) throw new ApiInputError("변경 기록 페이지 표식이 올바르지 않아요");
  return withPostgresClient(
    env,
    async (client) => {
      const result = await client.query<{
        id: number;
        kind: "student" | "key";
        created_at: Date;
        cursor_created_at: string;
        student_uid: string | null;
        source: string;
        source_ref: string | null;
        api_key_uid: string | null;
        api_key_name: string | null;
        before_state: Record<string, unknown> | null;
        after_state: Record<string, unknown> | null;
        action: "issued" | "revoked" | null;
      }>(
        `WITH events AS (
           SELECT id, 'student'::text AS kind, created_at, student_uid, source, source_ref,
                  api_key_uid, api_key_name, before_state, after_state, NULL::text AS action
             FROM student_state_audits
            WHERE user_id = $1 AND created_at >= now() - interval '1 year'
           UNION ALL
           SELECT id, 'key'::text AS kind, created_at, NULL::text AS student_uid, 'api_key'::text AS source,
                  NULL::text AS source_ref, api_key_uid, api_key_name, NULL::jsonb AS before_state,
                  NULL::jsonb AS after_state, action
             FROM api_key_events
            WHERE user_id = $1 AND created_at >= now() - interval '1 year'
         )
         SELECT id, kind, created_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
                student_uid, source, source_ref, api_key_uid, api_key_name, before_state, after_state, action
           FROM events
          WHERE (
            $2::timestamptz IS NULL
            OR created_at < $2
            OR (created_at = $2 AND kind > $3)
            OR (created_at = $2 AND kind = $3 AND id < $4)
          )
            AND (
              $5::text = 'all'
              OR ($5 = 'direct' AND (
                kind = 'key'
                OR (kind = 'student' AND source = ANY($7::text[]))
              ))
              OR ($5 = 'data' AND kind = 'student' AND source = 'sync_draft')
              OR ($5 = 'recruitment' AND kind = 'student' AND source = 'recruitment_result')
              OR ($5 = 'api' AND kind = 'student' AND source = 'api')
            )
          ORDER BY created_at DESC, kind ASC, id DESC
          LIMIT $6`,
        [
          userId,
          cursor?.createdAt ?? null,
          cursor?.kind ?? null,
          cursor?.id ?? null,
          filter,
          limit + 1,
          [...API_AUDIT_HISTORY_DIRECT_SOURCES],
        ],
      );
      const pageRows = result.rows.slice(0, limit);
      const page = pageRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        createdAt: row.created_at.toISOString(),
        studentUid: row.student_uid,
        source: row.source,
        sourceRef: row.source_ref,
        apiKeyUid: row.api_key_uid,
        apiKeyName: row.api_key_name,
        beforeState: row.before_state,
        afterState: row.after_state,
        action: row.action,
      }));
      return {
        events: page,
        nextCursor:
          result.rows.length > limit && page.length > 0
            ? encodeAuditCursor(page[page.length - 1], pageRows[pageRows.length - 1].cursor_created_at)
            : null,
      };
    },
    options.createClient ?? createPostgresClient,
    options.ctx,
  );
}
