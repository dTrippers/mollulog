import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "@jest/globals";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import {
  pgApiKeysTable,
  pgStudentStateAuditsTable,
  pgStudentStatesTable,
  pgStudentTargetsTable,
} from "~/db/postgres/schema";
import { patchCanonicalStudentState, withStudentStateProjection } from "~/db/postgres/student-state-projection";
import { API_AUDIT_HISTORY_DIRECT_SOURCES, type ApiAuditHistoryFilter } from "~/domain/api-audit-history";
import { withPostgresClient } from "~/lib/postgres.server";
import {
  authenticatePersonalApiKey,
  createPersonalApiKey,
  deleteApiRecruitedStudent,
  getApiAuditHistory,
  getPersonalApiKeys,
  patchApiRecruitedStudent,
  registerApiRecruitedStudent,
  reserveApiWriteQuota,
  revokePersonalApiKey,
} from "~/models/mollulog-api";

const enabled = process.env.MOLLOG_API_POSTGRES_VALIDATION === "1";
const describePostgres = enabled ? describe : describe.skip;

function modelEnvForSchema(schema: string): Env {
  const connection = new URL("postgresql://127.0.0.1");
  if (process.env.PGHOST) connection.hostname = process.env.PGHOST;
  if (process.env.PGPORT) connection.port = process.env.PGPORT;
  if (process.env.PGUSER) connection.username = process.env.PGUSER;
  if (process.env.PGPASSWORD) connection.password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE ?? process.env.PGUSER;
  if (database) connection.pathname = `/${database}`;
  if (process.env.PGSSLMODE) connection.searchParams.set("sslmode", process.env.PGSSLMODE);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  return { HYPERDRIVE: { connectionString: connection.toString() } } as unknown as Env;
}

async function readMigration(name: string): Promise<string> {
  return readFile(path.join(process.cwd(), "db/postgres/migrations", name), "utf8");
}

async function validateSelectedLocalPostgresEnvironment(): Promise<void> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts/local-dev-env.mjs")).href;
  const validationScript = [
    `import { allowedLocalDbHosts, assertLocalConnection, connectionStringFromPostgresEnvironment } from ${JSON.stringify(moduleUrl)};`,
    "assertLocalConnection(connectionStringFromPostgresEnvironment(process.env), allowedLocalDbHosts(process.env));",
  ].join("\n");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", validationScript], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: "ignore",
    });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("The selected PostgreSQL environment could not be validated for local tests."));
    }, 5_000);
    child.once("error", () =>
      finish(new Error("The selected PostgreSQL environment could not be validated for local tests.")),
    );
    child.once("close", (code) => {
      if (code !== 0) finish(new Error("The selected PostgreSQL environment is not approved for local tests."));
      else finish();
    });
  });
}

describePostgres("MolluLog API models against isolated PostgreSQL", () => {
  it("persists hashed keys, enforces account quotas, atomically audits current state, and preserves goals on delete", async () => {
    const schema = `mllg_api_${process.pid}_${randomBytes(4).toString("hex")}`;
    const admin = new Client();
    await validateSelectedLocalPostgresEnvironment();
    await admin.connect();
    let created = false;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await admin.query(`SET search_path TO "${schema}"`);
      for (const migration of [
        "20260807000100_create_student_state.sql",
        "20260901000200_add_recruited_student_equipment_levels.sql",
        "20261010000100_create_student_state_projection.sql",
        "20261010000200_add_personal_api_keys_and_audit.sql",
      ]) {
        await admin.query(await readMigration(migration));
      }
      await admin.query("CREATE TABLE senseis (id integer PRIMARY KEY, active boolean NOT NULL)");
      await admin.query("INSERT INTO senseis (id, active) VALUES (5, true), (6, false)");
      const env = modelEnvForSchema(schema);
      const db = drizzle(admin);
      const issued = await createPersonalApiKey(env, 5, {
        name: "  desktop sync  ",
        readScope: true,
        writeScope: true,
      });
      expect(issued.key.name).toBe("desktop sync");
      expect(issued.token).toMatch(/^mllg_live_[a-f0-9]{64}$/);
      const [storedKey] = await db.select().from(pgApiKeysTable).where(eq(pgApiKeysTable.uid, issued.key.uid));
      expect(storedKey.keyHash).not.toContain(issued.token);
      expect(storedKey.keyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(storedKey.expiresAt.getUTCMonth()).toBe((storedKey.createdAt.getUTCMonth() + 3) % 12);
      expect((await getPersonalApiKeys(env, 5)).map(({ uid }) => uid)).toEqual([issued.key.uid]);

      const lastUsedAt = new Date(Date.now() + 1_000);
      expect(await authenticatePersonalApiKey(env, issued.token, {}, lastUsedAt)).toMatchObject({
        kind: "authenticated",
      });
      const [usedKey] = await db.select().from(pgApiKeysTable).where(eq(pgApiKeysTable.uid, issued.key.uid));
      expect(usedKey.lastUsedAt?.toISOString()).toBe(lastUsedAt.toISOString());
      expect(await revokePersonalApiKey(env, 6, issued.key.uid)).toBe(false);
      const [keyAfterForeignRevoke] = await db
        .select()
        .from(pgApiKeysTable)
        .where(eq(pgApiKeysTable.uid, issued.key.uid));
      expect(keyAfterForeignRevoke.revokedAt).toBeNull();

      expect(await authenticatePersonalApiKey(env, issued.token)).toEqual({
        kind: "authenticated",
        key: expect.objectContaining({ uid: issued.key.uid, userId: 5, readScope: true, writeScope: true }),
      });
      const readOnlyKey = await createPersonalApiKey(env, 5, {
        name: "read only",
        readScope: true,
        writeScope: false,
      });
      expect(await authenticatePersonalApiKey(env, readOnlyKey.token)).toEqual({
        kind: "authenticated",
        key: expect.objectContaining({ readScope: true, writeScope: false }),
      });
      const writeOnlyKey = await createPersonalApiKey(env, 5, {
        name: "write only",
        readScope: false,
        writeScope: true,
      });
      expect(await authenticatePersonalApiKey(env, writeOnlyKey.token)).toEqual({
        kind: "authenticated",
        key: expect.objectContaining({ readScope: false, writeScope: true }),
      });
      await admin.query("UPDATE api_keys SET expires_at = now() - interval '1 second' WHERE uid = $1", [
        readOnlyKey.key.uid,
      ]);
      expect(await authenticatePersonalApiKey(env, readOnlyKey.token)).toEqual({ kind: "invalid" });
      const inactiveKey = await createPersonalApiKey(env, 6, { name: "inactive", readScope: true, writeScope: false });
      expect(await authenticatePersonalApiKey(env, inactiveKey.token)).toEqual({ kind: "inactive" });

      const firstQuotaTime = new Date("2026-10-10T00:00:00.000Z");
      const firstReservation = await reserveApiWriteQuota(env, 5, {}, firstQuotaTime);
      expect(firstReservation).toEqual({
        allowed: true,
        used: 1,
        resetsAt: new Date(firstQuotaTime.getTime() + 10 * 60 * 1000),
      });
      await admin.query("UPDATE api_write_quotas SET window_started_at = $1, request_count = 499 WHERE user_id = 5", [
        firstQuotaTime,
      ]);
      const lastReservations = await Promise.all([
        reserveApiWriteQuota(env, 5, {}, new Date(firstQuotaTime.getTime() + 1_000)),
        reserveApiWriteQuota(env, 5, {}, new Date(firstQuotaTime.getTime() + 1_000)),
      ]);
      expect(lastReservations.filter((value) => value.allowed)).toHaveLength(1);
      expect(lastReservations.filter((value) => !value.allowed)).toHaveLength(1);
      await admin.query("UPDATE api_write_quotas SET window_started_at = $1, request_count = 500 WHERE user_id = 5", [
        new Date(firstQuotaTime.getTime() - 11 * 60 * 1000),
      ]);
      const resetQuota = await reserveApiWriteQuota(env, 5, {}, firstQuotaTime);
      expect(resetQuota).toEqual({
        allowed: true,
        used: 1,
        resetsAt: new Date(firstQuotaTime.getTime() + 10 * 60 * 1000),
      });

      await admin.query(
        "UPDATE student_state_migration_control SET nullable_semantics_enabled = true WHERE key = 'default'",
      );
      const apiActor = { apiKeyUid: issued.key.uid, apiKeyName: issued.key.name };
      await admin.query(
        `INSERT INTO student_states (uid, user_id, student_uid, relationship_current_level, relationship_current_exp)
         VALUES ('relationship-only', 5, 'student-bond-only', 1, 0)`,
      );
      const relationshipOnlyRegistration = await registerApiRecruitedStudent(
        env,
        5,
        "student-bond-only",
        { tier: 5, weaponTier: 0 },
        apiActor,
      );
      expect(relationshipOnlyRegistration).toEqual({
        kind: "created",
        state: expect.objectContaining({ tier: 5, weaponTier: 0, bond: 1, bondExp: 0, level: null, skillEx: null }),
        changed: true,
      });
      const [relationshipOnlyRow] = await db
        .select()
        .from(pgStudentStatesTable)
        .where(eq(pgStudentStatesTable.studentUid, "student-bond-only"));
      expect(relationshipOnlyRow).toEqual(
        expect.objectContaining({
          relationshipCurrentLevel: 1,
          relationshipCurrentExp: 0,
          level: null,
          skillEx: null,
        }),
      );

      const createdStudent = await registerApiRecruitedStudent(
        env,
        5,
        "student-a",
        { tier: 5, weaponTier: 0, level: 80 },
        apiActor,
      );
      expect(createdStudent.kind).toBe("created");

      await admin.query(
        `INSERT INTO student_targets (uid, user_id, student_uid, target_level, relationship_target_level,
           gift_plan, planner_added_at) VALUES ('target-a', 5, 'student-a', 90, 45, '{"gift-a":2}'::jsonb,
           '2026-09-01T00:00:00Z')`,
      );
      const [auditBeforeConcurrentChanges] = await db
        .select({ id: pgStudentStateAuditsTable.id })
        .from(pgStudentStateAuditsTable)
        .where(eq(pgStudentStateAuditsTable.studentUid, "student-a"));
      expect(auditBeforeConcurrentChanges).toBeDefined();

      await Promise.all([
        patchApiRecruitedStudent(env, 5, "student-a", { level: 90 }, apiActor),
        withPostgresClient(env, async (client) => {
          const transactionDb = drizzle(client);
          await transactionDb.transaction(async (tx) =>
            withStudentStateProjection(
              tx,
              5,
              ["student-a"],
              "student_growth",
              async (stateTx) => patchCanonicalStudentState(stateTx, 5, "student-a", { skillEx: 5 }),
              null,
              "nullable",
            ),
          );
        }),
      ]);
      const [concurrentState] = await db
        .select()
        .from(pgStudentStatesTable)
        .where(eq(pgStudentStatesTable.studentUid, "student-a"));
      expect(concurrentState.level).toBe(90);
      expect(concurrentState.skillEx).toBe(5);

      const [auditCountBeforeNoop] = await db
        .select({ id: pgStudentStateAuditsTable.id })
        .from(pgStudentStateAuditsTable)
        .where(eq(pgStudentStateAuditsTable.studentUid, "student-a"));
      const auditRowsBeforeNoop = await admin.query(
        "SELECT id FROM student_state_audits WHERE student_uid = 'student-a'",
      );
      await patchApiRecruitedStudent(env, 5, "student-a", { level: 90 }, apiActor);
      expect(auditRowsBeforeNoop.rows).toHaveLength(3);
      expect(auditCountBeforeNoop).toBeDefined();
      expect(
        (await admin.query("SELECT id FROM student_state_audits WHERE student_uid = 'student-a'")).rows,
      ).toHaveLength(3);

      const [targetBeforeDelete] = await db
        .select()
        .from(pgStudentTargetsTable)
        .where(eq(pgStudentTargetsTable.studentUid, "student-a"));
      await deleteApiRecruitedStudent(env, 5, "student-a", apiActor);
      const [deletedState] = await db
        .select()
        .from(pgStudentStatesTable)
        .where(eq(pgStudentStatesTable.studentUid, "student-a"));
      const [preservedTarget] = await db
        .select()
        .from(pgStudentTargetsTable)
        .where(eq(pgStudentTargetsTable.studentUid, "student-a"));
      expect(deletedState).toEqual(
        expect.objectContaining({
          recruitedStudentUid: null,
          tier: null,
          level: null,
          relationshipCurrentLevel: null,
          relationshipCurrentExp: null,
        }),
      );
      expect(preservedTarget).toEqual(targetBeforeDelete);

      const auditSourcesForFilter = [
        ...API_AUDIT_HISTORY_DIRECT_SOURCES,
        "sync_draft",
        "recruitment_result",
        "unrecognized_source",
      ];
      await admin.query(
        `INSERT INTO student_state_audits (
           user_id, student_uid, actor_user_id, source, before_state, after_state
         )
         SELECT 5, 'filter-source-' || source, 5, source, '{}'::jsonb, '{}'::jsonb
           FROM unnest($1::text[]) AS sources(source)`,
        [auditSourcesForFilter],
      );

      const history = await getApiAuditHistory(env, 5, { limit: 20 });
      expect(history.events.map(({ kind }) => kind)).toContain("student");
      expect(history.events.some(({ source, apiKeyName }) => source === "api" && apiKeyName === "desktop sync")).toBe(
        true,
      );
      expect(history.events.some(({ source, apiKeyName }) => source === "student_growth" && apiKeyName === null)).toBe(
        true,
      );
      const apiHistory = await getApiAuditHistory(env, 5, { limit: 20, filter: "api" });
      expect(apiHistory.events.length).toBeGreaterThan(0);
      expect(apiHistory.events.every(({ kind, source }) => kind === "student" && source === "api")).toBe(true);
      const directHistory = await getApiAuditHistory(env, 5, { limit: 50, filter: "direct" });
      expect(directHistory.events.some(({ kind }) => kind === "key")).toBe(true);
      expect(
        directHistory.events
          .filter(({ kind }) => kind === "student")
          .every(({ source }) => (API_AUDIT_HISTORY_DIRECT_SOURCES as readonly string[]).includes(source)),
      ).toBe(true);
      const dataHistory = await getApiAuditHistory(env, 5, { limit: 50, filter: "data" });
      expect(dataHistory.events.length).toBe(1);
      expect(dataHistory.events.every(({ kind, source }) => kind === "student" && source === "sync_draft")).toBe(true);
      const recruitmentHistory = await getApiAuditHistory(env, 5, { limit: 50, filter: "recruitment" });
      expect(recruitmentHistory.events.length).toBe(1);
      expect(
        recruitmentHistory.events.every(({ kind, source }) => kind === "student" && source === "recruitment_result"),
      ).toBe(true);
      const allHistory = await getApiAuditHistory(env, 5, { limit: 100, filter: "all" });
      expect(allHistory.events.some(({ source }) => source === "unrecognized_source")).toBe(true);

      const { rows: timestampRows } = await admin.query<{ exact_timestamp: string }>(
        `SELECT to_char(
           date_trunc('second', now() + interval '1 hour') + interval '123456 microseconds',
           'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
         ) AS exact_timestamp`,
      );
      const exactTimestamp = timestampRows[0].exact_timestamp;
      const visibleTimestamp = new Date(exactTimestamp).toISOString();
      await admin.query(
        `INSERT INTO api_key_events (user_id, api_key_uid, api_key_name, action, created_at)
         SELECT 5, 'tie-key-' || series::text, 'same timestamp', 'issued', $1::timestamptz
           FROM generate_series(1, 30) AS series`,
        [exactTimestamp],
      );
      await admin.query(
        `INSERT INTO student_state_audits (
           user_id, student_uid, actor_user_id, source, source_ref, before_state, after_state,
           api_key_uid, api_key_name, created_at
         )
         SELECT 5, 'tie-student-' || series::text, 5, 'api', 'same timestamp', '{}'::jsonb, '{}'::jsonb,
                'tie-key', 'same timestamp', $1::timestamptz
           FROM generate_series(1, 30) AS series`,
        [exactTimestamp],
      );
      await admin.query(
        `INSERT INTO api_key_events (user_id, api_key_uid, api_key_name, action, created_at)
         VALUES (6, 'foreign-tie-key', 'foreign', 'issued', $1::timestamptz),
                (5, 'old-key', 'old', 'issued', now() - interval '400 days')`,
        [exactTimestamp],
      );
      await admin.query(
        `INSERT INTO student_state_audits (
           user_id, student_uid, actor_user_id, source, before_state, after_state, api_key_uid, api_key_name, created_at
         ) VALUES (6, 'foreign-tie-student', 6, 'api', '{}'::jsonb, '{}'::jsonb, 'foreign', 'foreign', $1::timestamptz),
                  (5, 'old-student', 5, 'api', '{}'::jsonb, '{}'::jsonb, 'old-key', 'old', now() - interval '400 days')`,
        [exactTimestamp],
      );

      const readAllHistory = async (filter: ApiAuditHistoryFilter, limit: number) => {
        const events = [] as Awaited<ReturnType<typeof getApiAuditHistory>>["events"];
        const cursorValues: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
          const page = await getApiAuditHistory(env, 5, { limit, cursor, filter });
          events.push(...page.events);
          cursor = page.nextCursor;
          if (cursor) cursorValues.push(cursor);
          pages += 1;
          if (pages > 20) throw new Error("History cursor did not finish within the test page bound.");
        } while (cursor);
        return { events, pages, cursorValues };
      };
      const pagedHistory = await readAllHistory("all", 17);
      const tiedEvents = pagedHistory.events.filter((event) => event.createdAt === visibleTimestamp);
      expect(pagedHistory.pages).toBeGreaterThan(1);
      expect(tiedEvents).toHaveLength(60);
      expect(new Set(tiedEvents.map((event) => `${event.kind}:${event.id}`)).size).toBe(60);
      expect(tiedEvents.map(({ kind }) => kind)).toEqual([
        ...Array.from({ length: 30 }, () => "key"),
        ...Array.from({ length: 30 }, () => "student"),
      ]);
      expect(JSON.parse(atob(pagedHistory.cursorValues[0])).createdAt).toBe(exactTimestamp);
      const { rows: expectedKeyIds } = await admin.query<{ id: number }>(
        "SELECT id FROM api_key_events WHERE user_id = 5 AND api_key_uid LIKE 'tie-key-%' ORDER BY id DESC",
      );
      const { rows: expectedStudentIds } = await admin.query<{ id: number }>(
        "SELECT id FROM student_state_audits WHERE user_id = 5 AND student_uid LIKE 'tie-student-%' ORDER BY id DESC",
      );
      expect(tiedEvents.slice(0, 30).map(({ id }) => id)).toEqual(expectedKeyIds.map(({ id }) => id));
      expect(tiedEvents.slice(30).map(({ id }) => id)).toEqual(expectedStudentIds.map(({ id }) => id));
      expect(
        (await readAllHistory("api", 11)).events.filter((event) => event.createdAt === visibleTimestamp),
      ).toHaveLength(30);
      const directTieEvents = (await readAllHistory("direct", 11)).events.filter(
        (event) => event.createdAt === visibleTimestamp,
      );
      expect(directTieEvents).toHaveLength(30);
      expect(directTieEvents.every(({ kind }) => kind === "key")).toBe(true);
      const storedOldRows = await admin.query(
        `SELECT
           (SELECT count(*)::int FROM api_key_events WHERE user_id = 5 AND api_key_uid = 'old-key') AS key_count,
           (SELECT count(*)::int FROM student_state_audits WHERE user_id = 5 AND student_uid = 'old-student') AS student_count`,
      );
      expect(storedOldRows.rows[0]).toEqual({ key_count: 1, student_count: 1 });
      expect(
        pagedHistory.events.some((event) => event.apiKeyUid === "foreign" || event.apiKeyUid === "foreign-tie-key"),
      ).toBe(false);
      expect(pagedHistory.events.some((event) => event.studentUid === "foreign-tie-student")).toBe(false);
      expect(
        pagedHistory.events.some((event) => event.apiKeyUid === "old-key" || event.studentUid === "old-student"),
      ).toBe(false);

      await admin.query(`CREATE FUNCTION fail_api_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.student_uid = 'student-rollback' THEN RAISE EXCEPTION 'audit failure'; END IF; RETURN NEW; END;
      $$`);
      await admin.query(
        "CREATE TRIGGER fail_api_audit_trigger BEFORE INSERT ON student_state_audits FOR EACH ROW EXECUTE FUNCTION fail_api_audit()",
      );
      await expect(
        registerApiRecruitedStudent(env, 5, "student-rollback", { tier: 5, weaponTier: 0 }, apiActor),
      ).rejects.toThrow();
      expect(
        (await admin.query("SELECT student_uid FROM student_states WHERE student_uid = 'student-rollback'")).rows,
      ).toHaveLength(0);

      expect(await revokePersonalApiKey(env, 5, issued.key.uid)).toBe(true);
      expect(await authenticatePersonalApiKey(env, issued.token)).toEqual({ kind: "invalid" });
      expect(
        (
          await admin.query("SELECT action FROM api_key_events WHERE user_id = 5 AND api_key_uid = $1 ORDER BY id", [
            issued.key.uid,
          ])
        ).rows.map(({ action }) => action),
      ).toEqual(["issued", "revoked"]);
      const studentAudits = await admin.query(
        "SELECT source, api_key_uid, api_key_name FROM student_state_audits WHERE student_uid = 'student-a'",
      );
      const apiAudits = studentAudits.rows.filter(({ source }) => source === "api");
      const webAudits = studentAudits.rows.filter(({ source }) => source === "student_growth");
      expect(apiAudits).toHaveLength(3);
      expect(apiAudits.every((row) => row.api_key_uid === issued.key.uid && row.api_key_name === "desktop sync")).toBe(
        true,
      );
      expect(webAudits).toHaveLength(1);
      expect(webAudits[0]).toEqual(expect.objectContaining({ api_key_uid: null, api_key_name: null }));
    } finally {
      if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  }, 60_000);
});
