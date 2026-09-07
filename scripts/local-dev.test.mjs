import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertLocalConnection,
  assertNoRepositoryEnvironmentFiles,
  connectionKey,
  connectionStringFromPostgresEnvironment,
  loadLocalEnvironment,
  workerBindingsFromEnvironment,
} from "./local-dev-env.mjs";
import { connectLocalDatabase, databaseStatus, migrateFiles, transactionalSql } from "./local-postgres.mjs";

const localEnv = {
  PGHOST: "127.0.0.1",
  PGPORT: "5432",
  PGDATABASE: "mollulog",
  PGUSER: "test-user",
  PGPASSWORD: "secret@example",
  PGSSLMODE: "disable",
};

function fixtureEnv(overrides = {}) {
  return {
    ...localEnv,
    HOST: "http://127.0.0.1:8787",
    SESSION_SECRET: "test-only",
    ...overrides,
  };
}

function fixtureRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "mollulog-dev-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("derives the Hyperdrive connection from the PG environment only", () => {
  const connection = connectionStringFromPostgresEnvironment({
    ...localEnv,
    PGDATABASE: "database/name",
    PGUSER: "user@example",
    PGPASSWORD: "pass/word?",
  });
  assert.equal(
    connection,
    "postgresql://user%40example:pass%2Fword%3F@127.0.0.1:5432/database%2Fname?sslmode=disable",
  );
});

test("accepts IPv6 hosts and rejects ambiguous PostgreSQL hosts", () => {
  const connection = connectionStringFromPostgresEnvironment({ ...localEnv, PGHOST: "::1" });
  assert.equal(new URL(connection).hostname, "[::1]");

  for (const PGHOST of ["remote:5432", "bad@host", "host/path", "[::1", "::1]"]) {
    assert.throws(
      () => connectionStringFromPostgresEnvironment({ ...localEnv, PGHOST }),
      /Invalid PGHOST/,
    );
  }
});

test("loadLocalEnvironment uses inherited variables and replaces only the derived Hyperdrive key", () => {
  const inherited = fixtureEnv({
    [connectionKey]: "postgresql://wrong-host/old",
    OP_SERVICE_ACCOUNT_TOKEN: "must-not-be-bound",
    UNRELATED_SECRET: "must-not-be-bound",
  });
  const env = loadLocalEnvironment(inherited, { requireWorker: true });
  assert.notEqual(env[connectionKey], inherited[connectionKey]);
  assert.match(env[connectionKey], /^postgresql:\/\/test-user:/);
  assert.equal(env.OP_SERVICE_ACCOUNT_TOKEN, "must-not-be-bound");
});

test("repository dotenv files fail explicitly instead of becoming an implicit configuration source", (t) => {
  const root = fixtureRoot(t);
  writeFileSync(join(root, ".dev.vars"), "SESSION_SECRET=must-not-be-read");
  assert.throws(
    () => assertNoRepositoryEnvironmentFiles(root),
    (error) => error.message.includes(".dev.vars") && !error.message.includes("must-not-be-read"),
  );
});

test("worker bindings expose only the explicit Worker allowlist", () => {
  const bindings = workerBindingsFromEnvironment({
    ...fixtureEnv(),
    CONNECT_API_URL: "http://127.0.0.1:8788",
    PGHOST: "127.0.0.1",
    PGPASSWORD: "secret-must-not-be-bound",
    OP_SERVICE_ACCOUNT_TOKEN: "token-must-not-be-bound",
    UNRELATED_SECRET: "unrelated-must-not-be-bound",
  });
  assert.equal(bindings.HOST, "http://127.0.0.1:8787");
  assert.equal(bindings.PGPASSWORD, undefined);
  assert.equal(bindings.OP_SERVICE_ACCOUNT_TOKEN, undefined);
  assert.equal(bindings.UNRELATED_SECRET, undefined);
});

test("Vite config uses inherited Worker values only during development", async (t) => {
  const root = fixtureRoot(t);
  const previousCwd = process.cwd();
  const previousLoadFlag = process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
  process.chdir(root);
  try {
    const viteConfig = await import(`../vite.config.js?local-dev-test=${Date.now()}`);
    const inherited = {
      HOST: "http://127.0.0.1:8787",
      SESSION_SECRET: "vite-sentinel-secret",
      PGPASSWORD: "must-not-be-bound",
      OP_SERVICE_ACCOUNT_TOKEN: "must-not-be-bound",
    };
    const serveWorkerConfig = viteConfig.workerConfigForCommand("serve", inherited);
    assert.equal(serveWorkerConfig.vars, undefined);
    assert.ok(serveWorkerConfig.secrets.required.includes("SESSION_SECRET"));
    assert.ok(serveWorkerConfig.secrets.required.includes("HOST"));
    assert.equal(serveWorkerConfig.secrets.required.includes("PGPASSWORD"), false);
    assert.equal(serveWorkerConfig.secrets.required.includes("OP_SERVICE_ACCOUNT_TOKEN"), false);
    assert.equal(viteConfig.workerConfigForCommand("build", inherited), undefined);
    const resolved = viteConfig.default({ command: "serve", mode: "development" });
    assert.equal(resolved.envDir, false);
    assert.equal(process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, "true");
  } finally {
    process.chdir(previousCwd);
    if (previousLoadFlag === undefined) delete process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
    else process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = previousLoadFlag;
  }
});

test("local development uses default Wrangler configs; named deploy environments still resolve", async (t) => {
  const root = fixtureRoot(t);
  const previousEnv = process.env.CLOUDFLARE_ENV;
  const previousLogPath = process.env.WRANGLER_LOG_PATH;
  process.env.WRANGLER_LOG_PATH = join(root, "wrangler.log");
  try {
    const { unstable_readConfig } = await import("wrangler");
    for (const name of ["development", "staging", "production"]) {
      assert.throws(
        () => loadLocalEnvironment(fixtureEnv({ CLOUDFLARE_ENV: name })),
        /Unset CLOUDFLARE_ENV/,
      );
    }
    for (const filename of ["wrangler.jsonc", "wrangler.cron.jsonc"]) {
      const config = new URL(`../${filename}`, import.meta.url).pathname;
      process.env.CLOUDFLARE_ENV = "development";
      assert.throws(
        () => unstable_readConfig({ config }),
        /No environment found.*development/s,
      );
      delete process.env.CLOUDFLARE_ENV;
      const local = unstable_readConfig({ config });
      assert.ok(local.hyperdrive.some((binding) => binding.binding === "HYPERDRIVE"));
      for (const name of ["staging", "production"]) {
        const deployed = unstable_readConfig({ config, env: name });
        assert.equal(deployed.vars.STAGE, name === "production" ? "prod" : "staging");
      }
    }
  } finally {
    if (previousEnv === undefined) delete process.env.CLOUDFLARE_ENV;
    else process.env.CLOUDFLARE_ENV = previousEnv;
    if (previousLogPath === undefined) delete process.env.WRANGLER_LOG_PATH;
    else process.env.WRANGLER_LOG_PATH = previousLogPath;
  }
});

test("Wrangler materializes only allowlisted development values as hidden secrets", async (t) => {
  const root = fixtureRoot(t);
  const inherited = {
    HOST: "http://127.0.0.1:8787",
    SESSION_SECRET: "wrangler-sentinel-secret",
    PGPASSWORD: "must-not-bind",
    OP_SERVICE_ACCOUNT_TOKEN: "must-not-bind",
    UNRELATED_SECRET: "must-not-bind",
  };
  const previous = new Map(
    Object.keys(inherited).map((key) => [key, process.env[key]]),
  );
  const previousLoadFlag = process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
  const previousLogPath = process.env.WRANGLER_LOG_PATH;
  Object.assign(process.env, inherited, {
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
    WRANGLER_LOG_PATH: join(root, "wrangler.log"),
  });
  try {
    const viteConfig = await import(`../vite.config.js?wrangler-test=${Date.now()}`);
    const { unstable_getVarsForDev, unstable_printBindings } = await import("wrangler");
    const required = viteConfig.workerConfigForCommand("serve", inherited).secrets.required;
    const values = unstable_getVarsForDev(
      join(root, "wrangler.jsonc"),
      undefined,
      {},
      undefined,
      true,
      { required },
    );
    assert.equal(values.SESSION_SECRET.type, "secret_text");
    assert.equal(values.PGPASSWORD, undefined);
    assert.equal(values.OP_SERVICE_ACCOUNT_TOKEN, undefined);
    assert.equal(values.UNRELATED_SECRET, undefined);
    const logs = [];
    unstable_printBindings(values, [], [], [], { log: (line) => logs.push(line), local: true });
    const output = logs.join("\n");
    assert.equal(output.includes("wrangler-sentinel-secret"), false);
    assert.match(output, /\(hidden\)/);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousLoadFlag === undefined) delete process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
    else process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = previousLoadFlag;
    if (previousLogPath === undefined) delete process.env.WRANGLER_LOG_PATH;
    else process.env.WRANGLER_LOG_PATH = previousLogPath;
  }
});

test("missing required variables identify names without including values", () => {
  const missingSessionSecret = { ...localEnv, HOST: "http://private.example" };
  assert.throws(
    () => loadLocalEnvironment(missingSessionSecret, { requireWorker: true }),
    (error) => error.message.includes("SESSION_SECRET") && !error.message.includes("secret-value"),
  );
  assert.throws(
    () => loadLocalEnvironment({ ...localEnv, PGPASSWORD: "" }),
    /PGPASSWORD/,
  );
});

test("local DB guard permits only loopback PostgreSQL connections and sslmode", () => {
  assert.equal(assertLocalConnection(loadLocalEnvironment(fixtureEnv())[connectionKey]).hostname, "127.0.0.1");
  for (const url of [
    "postgres://user:secret@production/db",
    "postgres://user:secret@127.0.0.1/db?host=production",
    "postgres://user:secret@127.0.0.1/db?sslmode=unknown",
    "postgres://user:secret@127.0.0.1/db?sslmode=disable&sslmode=require",
    "postgres://user@127.0.0.1/",
    "http://user@127.0.0.1/db",
  ]) {
    assert.throws(() => assertLocalConnection(url));
  }
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
  const root = fixtureRoot(t);
  const env = loadLocalEnvironment(process.env);
  const client = await connectLocalDatabase(env);
  const other = await connectLocalDatabase(env);
  const schema = `mollulog_dev_test_${process.pid}_${Date.now()}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await other.query(`SET search_path TO ${schema}`);
    const directory = join(root, "db/postgres/migrations");
    mkdirSync(directory, { recursive: true });
    const first = "20260905000100_first.sql";
    writeFileSync(join(directory, first), "BEGIN; CREATE TABLE sample (id integer); COMMIT;");
    const messages = [];
    await migrateFiles(client, root, [first], (line) => messages.push(line));
    await migrateFiles(client, root, [first], (line) => messages.push(line));
    assert.match(messages[1], /Already applied/);
    const second = "20260905000200_second.sql";
    const fail = "20260905000300_failure.sql";
    writeFileSync(join(directory, second), "CREATE TABLE rolled_back (id integer);");
    writeFileSync(join(directory, fail), "ALTER TABLE does_not_exist ADD COLUMN value integer;");
    await assert.rejects(migrateFiles(client, root, [second, fail], () => {}), /rolled back/);
    assert.equal((await client.query("SELECT to_regclass('rolled_back') AS name")).rows[0].name, null);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM _mollulog_local_migrations")).rows[0].count, 1);
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1836018796, 1)");
    await assert.rejects(migrateFiles(other, root, [second], () => {}), /Another worktree/);
    await client.query("ROLLBACK");
    const status = [];
    await databaseStatus(client, root, (line) => status.push(line));
    assert.ok(status.some((line) => line === `untracked ${second}`));
    await assert.rejects(migrateFiles(client, root, [], () => {}), /Specify/);
    await assert.rejects(migrateFiles(client, root, ["../../outside.sql"], () => {}), /inside/);
    writeFileSync(join(directory, first), "CREATE TABLE sample (id text);");
    await assert.rejects(migrateFiles(client, root, [first], () => {}), /Previously applied migration changed/);
  } finally {
    await client.query("ROLLBACK");
    await other.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await Promise.all([client.end(), other.end()]);
  }
});
