import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { allowedLocalDbHosts, assertLocalConnection, connectionStringFromPostgresEnvironment } from "./local-dev-env.mjs";
import { assertMigrationHost } from "./student-state-migration-host.mjs";

test("keeps existing loopback commands working without confirmation", () => {
  assert.doesNotThrow(() => assertMigrationHost("127.0.0.1", null));
});

test("allows an explicitly confirmed remote hostname or IP", () => {
  for (const host of ["production.example.test", "192.0.2.10", "2001:db8::1"]) {
    assert.doesNotThrow(() => assertMigrationHost(host, host));
  }
});

test("rejects missing PGHOST, unconfirmed remote hosts and mismatched confirmations", () => {
  for (const host of [undefined, "", " "]) {
    assert.throws(() => assertMigrationHost(host, host), /Set PGHOST explicitly/);
  }
  assert.throws(() => assertMigrationHost("production.example.test", null), /requires --confirm-db-host/);
  for (const host of ["127.0.0.1", "production.example.test"]) {
    assert.throws(() => assertMigrationHost(host, "staging.example.test"), /exactly match/);
    assert.throws(() => assertMigrationHost(host, ""), /exactly match/);
  }
});

test("CLI rejects missing or mismatched confirmation before attempting a connection", () => {
  for (const confirmation of [[], ["--confirm-db-host", "staging.example.test"], ["--confirm-db-host="]]) {
    const result = spawnSync(process.execPath, [
      new URL("./student-state-migration.mjs", import.meta.url).pathname,
      "preflight", "--schema", "public", ...confirmation,
    ], {
      env: { ...process.env, PGHOST: "production.example.test", PGCONNECT_TIMEOUT: "1" },
      encoding: "utf8",
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--confirm-db-host/);
    assert.doesNotMatch(result.stderr, /ENOTFOUND|ECONNREFUSED|timeout expired/);
  }
});

test("reviewed shadow-current migration preserves legacy rows and uses service current values", {
  skip: process.env.STUDENT_STATE_POSTGRES_VALIDATION !== "1",
  timeout: 120_000,
}, async () => {
  // Validate the selected local environment before creating only this test's unique schema.
  assertLocalConnection(connectionStringFromPostgresEnvironment(process.env), allowedLocalDbHosts(process.env));
  const { Client } = await import("pg");
  const client = new Client({ connectionTimeoutMillis: 10_000, query_timeout: 15_000 });
  const schema = `student_state_reviewed_${process.pid}_${randomBytes(4).toString("hex")}`;
  const reviewedFlag = "--confirm-legacy-growth-current-reviewed";
  const execute = promisify(execFile);
  const cli = async (action, { reviewed = true, confirmWriters = true, script = new URL("./student-state-migration.mjs", import.meta.url).pathname, timeout = 15_000 } = {}) => {
    const args = [script, action, "--schema", schema];
    if (process.env.PGHOST !== "127.0.0.1") args.push("--confirm-db-host", process.env.PGHOST);
    if (reviewed) args.push(reviewedFlag);
    if (action !== "preflight" && confirmWriters) args.push("--confirm-no-external-writers");
    try {
      return { code: 0, ...await execute(process.execPath, args, { env: process.env, timeout }) };
    } catch (error) {
      if (typeof error.code !== "number") throw error;
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  };
  const snapshot = async () => {
    const result = {};
    for (const table of ["student_growth", "recruited_students", "user_relationship_levels"]) {
      const { rows } = await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.uid),'[]'::jsonb) AS data FROM ${table} t`);
      result[table] = rows[0].data;
    }
    return result;
  };
  let created = false;
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await client.query(`SET search_path TO "${schema}"`);
    for (const migration of [
      "20260807000100_create_student_state.sql",
      "20260901000200_add_recruited_student_equipment_levels.sql",
      "20261010000100_create_student_state_projection.sql",
    ]) {
      await client.query(await readFile(new URL(`../db/postgres/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await client.query(`
      INSERT INTO student_growth (uid,user_id,student_uid,level,skill_ex,skill_normal,skill_enhanced,skill_sub,equip1,equip2,equip3,equip_special,target_level) VALUES
      ('g-match',1,'match',70,3,5,5,5,5,5,5,1,80),
      ('g-higher',1,'higher',70,3,5,5,5,5,5,5,1,90),
      ('g-lower',1,'lower',70,3,5,10,5,5,5,5,1,85),
      ('g-orphan',1,'orphan',70,3,5,5,5,5,5,5,1,80),
      ('g-target-only',1,'target-only',70,3,5,5,5,5,5,5,1,80);
      INSERT INTO recruited_students (uid,user_id,student_uid,tier,level,skill_ex,skill_normal,skill_enhanced,skill_sub,equip1,equip2,equip3,equip_special) VALUES
      ('r-match',1,'match',5,70,3,5,5,5,5,5,5,1),
      ('r-higher',1,'higher',5,90,5,10,10,10,10,10,10,2),
      ('r-lower',1,'lower',5,NULL,3,5,3,5,5,5,5,1);
      INSERT INTO user_relationship_levels (uid,user_id,student_id,current_level,target_level,items)
      VALUES ('l-orphan',1,'orphan',10,20,'{"gift":2}'::jsonb);
    `);
    const original = await snapshot();
    assert.equal((await cli("preflight", { reviewed: false })).code, 2);
    for (const action of ["backfill", "parity"]) {
      const result = await cli(action, { reviewed: false });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /require an operator review/);
    }
    assert.equal((await client.query("SELECT count(*)::int AS count FROM student_states")).rows[0].count, 0);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM student_targets")).rows[0].count, 0);
    const preflight = await cli("preflight");
    assert.equal(preflight.code, 0, preflight.stderr);
    assert.match(preflight.stdout, /unsupported_student_growth_current_rows=5/);
    assert.match(preflight.stdout, /legacy_growth_current_policy=preserve-reviewed/);
    assert.equal((await cli("backfill", { confirmWriters: false })).code, 1);
    for (let run = 0; run < 2; run++) {
      const backfill = await cli("backfill");
      assert.equal(backfill.code, 0, backfill.stderr);
      const parity = await cli("parity");
      assert.equal(parity.code, 0, parity.stderr);
      assert.match(parity.stdout, /mismatches=0/);
      assert.deepEqual(await snapshot(), original);
    }
    const { rows: states } = await client.query("SELECT student_uid,recruited_student_uid,level,skill_enhanced,relationship_current_level FROM student_states ORDER BY student_uid");
    assert.deepEqual(states, [
      { student_uid: "higher", recruited_student_uid: "r-higher", level: 90, skill_enhanced: 10, relationship_current_level: null },
      { student_uid: "lower", recruited_student_uid: "r-lower", level: null, skill_enhanced: 3, relationship_current_level: null },
      { student_uid: "match", recruited_student_uid: "r-match", level: 70, skill_enhanced: 5, relationship_current_level: null },
      { student_uid: "orphan", recruited_student_uid: null, level: null, skill_enhanced: null, relationship_current_level: 10 },
    ]);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM student_targets WHERE target_level IS NOT NULL")).rows[0].count, 5);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM student_state_audits")).rows[0].count, 0);
    await client.query("UPDATE student_states SET level=1 WHERE student_uid='higher'");
    const mismatch = await cli("parity");
    assert.equal(mismatch.code, 2);
    assert.match(mismatch.stdout, /mismatches=1/);
    assert.equal((await cli("backfill")).code, 0);
    await client.query(`UPDATE user_relationship_levels SET items='{"gift":"invalid"}'::jsonb`);
    assert.equal((await cli("preflight")).code, 2);
    for (const action of ["backfill", "parity"]) {
      const invalidGift = await cli(action);
      assert.equal(invalidGift.code, 1);
      assert.match(invalidGift.stderr, /Legacy gift plan is invalid/);
    }
    await client.query(`UPDATE user_relationship_levels SET items='{"gift":2}'::jsonb`);
    assert.deepEqual(await snapshot(), original);

    // Exercise multiple 200-row batches, including rollback after earlier batches have written.
    await client.query(`
      INSERT INTO recruited_students (uid,user_id,student_uid,tier,level,created_at)
      SELECT 'r-batch-'||i,2,'batch-'||lpad(i::text,3,'0'),5,70,'2026-09-01T00:00:00.000123Z'::timestamptz
      FROM generate_series(1,401) i;
      INSERT INTO student_growth (uid,user_id,student_uid,target_level,created_at)
      SELECT 'g-batch-'||i,2,'batch-'||lpad(i::text,3,'0'),80,'2026-09-01T00:00:00.000456Z'::timestamptz
      FROM generate_series(1,401) i;
      INSERT INTO user_relationship_levels (uid,user_id,student_id,current_level,target_level,items)
      VALUES ('l-batch-last',2,'batch-401',10,20,'{"gift":"invalid"}'::jsonb);
    `);
    const failedBatch = await cli("backfill");
    assert.equal(failedBatch.code, 1);
    assert.match(failedBatch.stderr, /Legacy gift plan is invalid/);
    for (const table of ["student_states", "student_targets"]) {
      assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE user_id=2`)).rows[0].count, 0);
    }
    await client.query(`UPDATE user_relationship_levels SET items='{"gift":2}'::jsonb WHERE user_id=2`);
    const batchOriginal = await snapshot();
    const started = Date.now();
    const batched = await cli("backfill");
    const batchedMs = Date.now() - started;
    assert.equal(batched.code, 0, batched.stderr);
    assert.match(batched.stdout, /backfill progress users=2\/2/);
    for (const table of ["student_states", "student_targets"]) {
      assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE user_id=2`)).rows[0].count, 401);
    }
    assert.equal((await client.query("SELECT to_char(recruited_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS exact FROM student_states WHERE student_uid='batch-401'")).rows[0].exact, "2026-09-01T00:00:00.000123Z");
    assert.equal((await client.query("SELECT to_char(planner_added_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS exact FROM student_targets WHERE student_uid='batch-401'")).rows[0].exact, "2026-09-01T00:00:00.000456Z");
    if (process.env.STUDENT_STATE_BACKFILL_BASELINE) {
      const baselineStarted = Date.now();
      const baseline = await cli("backfill", { script: process.env.STUDENT_STATE_BACKFILL_BASELINE, timeout: 60_000 });
      assert.equal(baseline.code, 0, baseline.stderr);
      console.log(`backfill benchmark rows=406 batched_ms=${batchedMs} per_row_ms=${Date.now() - baselineStarted}`);
    }
    const identities = async () => (await client.query("SELECT student_uid,uid,created_at,deleted_at FROM student_states UNION ALL SELECT student_uid,uid,created_at,deleted_at FROM student_targets ORDER BY student_uid,uid")).rows;
    const beforeReplay = await identities();
    assert.equal((await cli("backfill")).code, 0);
    assert.deepEqual(await identities(), beforeReplay);
    const batchParity = await cli("parity");
    assert.equal(batchParity.code, 0, batchParity.stderr);
    assert.match(batchParity.stdout, /mismatches=0/);
    // Reconcile source deletions, including projection-only rows and one-sided deletions.
    await client.query("DELETE FROM recruited_students WHERE user_id=2 AND student_uid IN ('batch-001','batch-002'); DELETE FROM student_growth WHERE user_id=2 AND student_uid='batch-001'");
    assert.equal((await cli("backfill")).code, 0);
    const removed = (await client.query("SELECT student_uid,deleted_at IS NOT NULL AS deleted,level,recruited_student_uid FROM student_states WHERE user_id=2 AND student_uid IN ('batch-001','batch-002') ORDER BY student_uid")).rows;
    assert.deepEqual(removed, [
      { student_uid: "batch-001", deleted: true, level: null, recruited_student_uid: null },
      { student_uid: "batch-002", deleted: true, level: null, recruited_student_uid: null },
    ]);
    assert.equal((await client.query("SELECT deleted_at IS NULL AS active FROM student_targets WHERE student_uid='batch-002'")).rows[0].active, true);
    assert.equal((await cli("parity")).code, 0);
    const tombstones = await identities();
    assert.equal((await cli("backfill")).code, 0);
    assert.deepEqual(await identities(), tombstones);
    const retained = await snapshot();
    for (const table of Object.keys(original)) {
      assert.deepEqual(retained[table].filter((row) => row.user_id === 1), original[table]);
      assert.deepEqual(retained[table].filter((row) => row.user_id === 2 && !["batch-001", "batch-002"].includes(row.student_uid)), batchOriginal[table].filter((row) => row.user_id === 2 && !["batch-001", "batch-002"].includes(row.student_uid)));
    }
    assert.equal((await client.query("SELECT count(*)::int AS count FROM student_state_audits")).rows[0].count, 0);
    // Repeated student UIDs across users and more than two parity groups must not collide.
    await client.query(`
      INSERT INTO recruited_students (uid,user_id,student_uid,tier,level,created_at)
      SELECT 'r-shared-'||i,i,'match',5,i,'2026-09-01T00:00:00.000123Z'::timestamptz
      FROM generate_series(3,55) i;
      INSERT INTO student_growth (uid,user_id,student_uid,target_level)
      SELECT 'g-shared-'||i,i,'match',i+1 FROM generate_series(3,55) i;
    `);
    assert.equal((await cli("backfill", { timeout: 60_000 })).code, 0);
    const allRows = async () => {
      const tables = {};
      for (const table of ["student_states", "student_targets", "student_state_audits", "student_state_migration_control", "student_growth", "recruited_students", "user_relationship_levels"]) {
        tables[table] = (await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS data FROM ${table} t`)).rows[0].data;
      }
      return tables;
    };
    const beforeParity = await allRows();
    const parityStarted = Date.now();
    const groupedParity = await cli("parity");
    const groupedMs = Date.now() - parityStarted;
    assert.equal(groupedParity.code, 0, groupedParity.stderr);
    assert.match(groupedParity.stdout, /parity progress users=25\/55/);
    assert.match(groupedParity.stdout, /parity users=55 mismatches=0/);
    assert.deepEqual(await allRows(), beforeParity);
    if (process.env.STUDENT_STATE_PARITY_BASELINE) {
      const baselineStarted = Date.now();
      const baseline = await cli("parity", { script: process.env.STUDENT_STATE_PARITY_BASELINE, timeout: 60_000 });
      assert.equal(baseline.code, 0, baseline.stderr);
      console.log(`parity benchmark users=55 grouped_ms=${groupedMs} per_user_ms=${Date.now() - baselineStarted}`);
    }
    await client.query("UPDATE student_states SET level=1 WHERE user_id IN (3,28,55) AND student_uid='match'; UPDATE student_targets SET target_level=1 WHERE user_id=28 AND student_uid='match'");
    const acrossGroups = await cli("parity");
    assert.equal(acrossGroups.code, 2);
    assert.match(acrossGroups.stdout, /parity users=55 mismatches=4/);
    await client.query("DELETE FROM student_states WHERE user_id=55 AND student_uid='match'");
    const missing = await cli("parity");
    assert.equal(missing.code, 2);
    assert.match(missing.stdout, /parity users=55 mismatches=4/);
    await client.query("UPDATE user_relationship_levels SET items='[]'::jsonb WHERE user_id=2");
    const invalidInGroup = await cli("parity");
    assert.equal(invalidInGroup.code, 1);
    assert.match(invalidInGroup.stderr, /Legacy gift plan is invalid/);
    await client.query(`UPDATE user_relationship_levels SET items='{"gift":2}'::jsonb WHERE user_id=2`);
    await client.query("UPDATE student_state_migration_control SET nullable_semantics_enabled=true WHERE key='default'");
    for (const action of ["backfill", "parity"]) {
      const activated = await cli(action);
      assert.equal(activated.code, 1);
      assert.match(activated.stderr, /disabled after nullable semantics activation/);
    }
  } finally {
    try {
      if (created) {
        await client.query(`DROP SCHEMA "${schema}" CASCADE`);
        assert.equal((await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema])).rowCount, 0);
      }
    } finally {
      await client.end();
    }
  }
});
