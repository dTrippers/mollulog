import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertLocalConnection, connectionKey, loadLocalEnvironment, locations, prepareDevVars, setupShared } from "./local-dev-env.mjs";
import { connectLocalDatabase, databaseStatus, migrateFiles, transactionalSql } from "./local-postgres.mjs";

const localUrl = "postgres://test:password@127.0.0.1:5432/mollulog";
function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), "mollulog-dev-test-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const paths = { root: join(base, "feature"), primary: join(base, "main"), shared: join(base, ".mollulog-dev") };
  mkdirSync(paths.root); mkdirSync(paths.primary);
  writeFileSync(join(base, ".envrc"), `export ${connectionKey}='${localUrl}'\nexport UNRELATED_SECRET=do-not-copy\n`);
  writeFileSync(join(paths.primary, ".dev.vars"), "HOST=http://127.0.0.1:8787\nSESSION_SECRET=test-only\n");
  return paths;
}

test("one-time import filters shell settings, preserves sources and is reusable by another worktree", (t) => {
  const paths = fixture(t);
  setupShared(paths);
  const shared = readFileSync(join(paths.shared, "local.env"), "utf8");
  assert.ok(!shared.includes("UNRELATED_SECRET"));
  assert.equal(statSync(join(paths.shared, "local.env")).mode & 0o777, 0o600);
  assert.equal(statSync(join(paths.shared, ".dev.vars")).mode & 0o777, 0o600);
  assert.equal(prepareDevVars(paths), "shared");
  assert.equal(realpathSync(join(paths.root, ".dev.vars")), realpathSync(join(paths.shared, ".dev.vars")));
  const second = join(paths.root, "second"); mkdirSync(second);
  assert.equal(prepareDevVars({ ...paths, root: second }), "shared");
  setupShared(paths);
  assert.equal(readFileSync(join(paths.shared, "local.env"), "utf8"), shared);
  const env = loadLocalEnvironment(paths, { [connectionKey]: "invalid-inherited-value" });
  assert.equal(env[connectionKey], localUrl);
  assert.equal(readFileSync(join(paths.primary, ".dev.vars"), "utf8"), readFileSync(join(paths.shared, ".dev.vars"), "utf8"));
});

test("existing worktree secrets are never overwritten", (t) => {
  const paths = fixture(t); setupShared(paths);
  const content = "HOST=http://127.0.0.1:8790\nSESSION_SECRET=existing\n";
  writeFileSync(join(paths.root, ".dev.vars"), content);
  assert.equal(prepareDevVars(paths), "existing worktree file (preserved)");
  assert.equal(readFileSync(join(paths.root, ".dev.vars"), "utf8"), content);
  assert.throws(() => loadLocalEnvironment(paths, { CLOUDFLARE_ENV: "production" }), /cannot use/);
});

test("missing settings fail without shell execution or secret output", (t) => {
  const paths = fixture(t);
  assert.throws(() => loadLocalEnvironment(paths, {}), /dev:setup/);
  writeFileSync(join(paths.primary, "..", ".envrc"), `${connectionKey}=$(touch should-not-exist)\n`);
  assert.throws(() => setupShared(paths), (error) => !error.message.includes("touch") && /invalid/.test(error.message));
});

test("local DB guard rejects remote hosts and URL parameter overrides", () => {
  for (const url of ["postgres://user:secret@production/db", `${localUrl}?host=production`, "postgres://user@127.0.0.1/", "http://user@127.0.0.1/db"]) {
    assert.throws(() => assertLocalConnection(url));
  }
  assert.equal(assertLocalConnection(localUrl).hostname, "127.0.0.1");
});

test("runner owns transactions even for existing wrapped SQL", () => {
  assert.equal(transactionalSql("BEGIN;\nCREATE TABLE example(id int);\nCOMMIT;"), "\nCREATE TABLE example(id int);\n");
  assert.throws(() => transactionalSql("CREATE TABLE example(id int); COMMIT;"), /transaction control/);
  assert.throws(() => transactionalSql("BEGIN; SELECT 1; COMMIT; BEGIN; SELECT 2; COMMIT;"), /transaction control/);
  assert.equal(transactionalSql("SELECT 'COMMIT;'"), "SELECT 'COMMIT;'");
});

test("real PostgreSQL: atomic batch, duplicate protection, drift, and shared lock", {
  skip: process.env.MOLLULOG_TEST_LOCAL_DB !== "1",
}, async (t) => {
  const paths = fixture(t);
  const root = new URL("..", import.meta.url).pathname;
  const env = loadLocalEnvironment(locations(root));
  const client = await connectLocalDatabase(env);
  const other = await connectLocalDatabase(env);
  const schema = `mollulog_dev_test_${process.pid}_${Date.now()}`;
  // Only this test-owned schema is created and dropped. Application tables and data are untouched.
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await other.query(`SET search_path TO ${schema}`);
    const directory = join(paths.root, "db/postgres/migrations"); mkdirSync(directory, { recursive: true });
    const first = "20260905000100_first.sql";
    writeFileSync(join(directory, first), "BEGIN; CREATE TABLE sample (id integer); COMMIT;");
    const messages = [];
    await migrateFiles(client, paths.root, [first], (line) => messages.push(line));
    await migrateFiles(client, paths.root, [first], (line) => messages.push(line));
    assert.match(messages[1], /Already applied/);
    const second = "20260905000200_second.sql";
    const fail = "20260905000300_failure.sql";
    writeFileSync(join(directory, second), "CREATE TABLE rolled_back (id integer);");
    writeFileSync(join(directory, fail), "ALTER TABLE does_not_exist ADD COLUMN value integer;");
    await assert.rejects(migrateFiles(client, paths.root, [second, fail], () => {}), /rolled back/);
    assert.equal((await client.query("SELECT to_regclass('rolled_back') AS name")).rows[0].name, null);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM _mollulog_local_migrations")).rows[0].count, 1);
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(1836018796, 1)");
    await assert.rejects(migrateFiles(other, paths.root, [second], () => {}), /Another worktree/);
    await client.query("ROLLBACK");
    const status = [];
    await databaseStatus(client, paths.root, (line) => status.push(line));
    assert.ok(status.some((line) => line === `untracked ${second}`));
    await assert.rejects(migrateFiles(client, paths.root, [], () => {}), /Specify/);
    await assert.rejects(migrateFiles(client, paths.root, ["../../outside.sql"], () => {}), /inside/);
    writeFileSync(join(directory, first), "CREATE TABLE sample (id text);");
    await assert.rejects(migrateFiles(client, paths.root, [first], () => {}), /Previously applied migration changed/);
  } finally {
    await client.query("ROLLBACK");
    await other.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await Promise.all([client.end(), other.end()]);
  }
});
