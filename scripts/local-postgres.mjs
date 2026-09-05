import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import pg from "pg";
import { assertLocalConnection, connectionKey, LocalDevError } from "./local-dev-env.mjs";

const historyTable = "_mollulog_local_migrations";

export function reportDatabaseError(error) {
  const code = error.code;
  if (["EPERM", "EACCES"].includes(code)) return "Local DB access was denied by the execution environment. Retry the same command with local network permission; do not replace credentials.";
  if (["ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH"].includes(code) || /timeout/i.test(error.message || "")) {
    return "Local DB is unreachable. Run dev:doctor with local network permission first; if it still fails, check the existing PostgreSQL service. Do not create another DB.";
  }
  if (code === "28P01" || code === "28000") return "Local DB authentication failed. Check the shared local.env credentials; no production credentials are needed.";
  if (code === "3D000") return "The configured local database does not exist. Check the shared local.env database name.";
  if (code === "42501") return "The local PostgreSQL role lacks permission for this operation.";
  return `Local development operation failed${/^[A-Z0-9]{5}$/.test(code || "") ? ` (SQLSTATE ${code})` : ""}. No raw connection details are logged.`;
}

export async function connectLocalDatabase(env) {
  assertLocalConnection(env[connectionKey]);
  const client = new pg.Client({
    connectionString: env[connectionKey], connectionTimeoutMillis: 3000,
    application_name: "mollulog-local-dev", statement_timeout: 60000, lock_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query("SET search_path TO public");
    await client.query("SELECT 1");
    return client;
  } catch (error) { await client.end().catch(() => {}); throw error; }
}

export function readMigrations(root) {
  const directory = join(root, "db/postgres/migrations");
  return readdirSync(directory).filter((name) => name.endsWith(".sql")).sort().map((name) => {
    const sql = readFileSync(join(directory, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });
}

// The runner owns the transaction, including the ledger write. Existing files
// with one outer BEGIN/COMMIT pair remain usable without changing their hashes.
export function transactionalSql(sql) {
  const body = sql.replace(/^\s*BEGIN\s*;([\s\S]*)\bCOMMIT\s*;\s*$/i, "$1");
  const searchable = body.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\$([A-Za-z_][A-Za-z_0-9]*|)\$[\s\S]*?\$\1\$/g, " ");
  if (/\b(BEGIN|COMMIT|ROLLBACK|ABORT)\b|\bSTART\s+TRANSACTION\b|\bEND\s*;|\bPREPARE\s+TRANSACTION\b/i.test(searchable)) {
    throw new LocalDevError("Migration contains transaction control. Use plain SQL or a single outer BEGIN/COMMIT pair.");
  }
  return body;
}

async function readHistory(client) {
  const { rows } = await client.query("SELECT to_regclass($1) AS name", [historyTable]);
  return rows[0].name ? (await client.query(`SELECT filename, checksum FROM ${historyTable} ORDER BY filename`)).rows : [];
}

function validateChecksums(migrations, history) {
  const local = new Map(migrations.map((migration) => [migration.name, migration.checksum]));
  for (const row of history) {
    if (local.has(row.filename) && local.get(row.filename) !== row.checksum) {
      throw new LocalDevError(`Previously applied migration changed: ${row.filename}. Add a forward migration instead.`);
    }
  }
}

export async function databaseStatus(client, root, log = console.log) {
  const migrations = readMigrations(root);
  const history = await readHistory(client);
  validateChecksums(migrations, history);
  log("Local PostgreSQL connection: OK");
  const applied = new Set(history.map((row) => row.filename));
  for (const migration of migrations) log(`${applied.has(migration.name) ? "recorded" : "untracked"} ${migration.name}`);
  const local = new Set(migrations.map((migration) => migration.name));
  for (const row of history) if (!local.has(row.filename)) log(`other-worktree ${row.filename}`);
  log("Untracked means unknown history, not pending. Existing SQL must not be replayed automatically.");
}

export async function migrateFiles(client, root, filenames, log = console.log) {
  if (!filenames.length) throw new LocalDevError("Specify the new SQL file(s): pnpm dev:db:migrate <filename.sql>. Existing migrations are never replayed automatically.");
  const migrations = readMigrations(root);
  const requested = new Set();
  for (const filename of filenames) {
    const name = basename(filename);
    if (filename !== name && resolve(root, filename) !== join(root, "db/postgres/migrations", name)) {
      throw new LocalDevError("Migration files must be inside db/postgres/migrations.");
    }
    if (!migrations.some((migration) => migration.name === name)) throw new LocalDevError("Requested migration does not exist in db/postgres/migrations.");
    requested.add(name);
  }
  const selected = migrations.filter((migration) => requested.has(migration.name));
  for (const migration of selected) migration.body = transactionalSql(migration.sql);
  const messages = [];
  await client.query("BEGIN");
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_xact_lock(1836018796, 1) AS locked");
    if (!rows[0].locked) throw new LocalDevError("Another worktree is migrating the shared DB. Retry after it finishes.");
    await client.query(`CREATE TABLE IF NOT EXISTS ${historyTable} (
      filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const history = await readHistory(client);
    validateChecksums(migrations, history);
    const applied = new Set(history.map((row) => row.filename));
    for (const migration of selected) {
      if (applied.has(migration.name)) { messages.push(`Already applied: ${migration.name}`); continue; }
      try { await client.query(migration.body); }
      catch (error) { throw new LocalDevError(`Failed: ${migration.name}. ${reportDatabaseError(error)} The entire batch was rolled back.`); }
      await client.query(`INSERT INTO ${historyTable} (filename, checksum) VALUES ($1, $2)`, [migration.name, migration.checksum]);
      messages.push(`Applied: ${migration.name}`);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  for (const message of messages) log(message);
}
