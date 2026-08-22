#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

export const IDENTITY_TABLES = [
  "senseis",
  "auth_identities",
  "passkeys",
  "pending_sensei_registrations",
  "sensei_privacies",
  "followerships",
];
export const DEFAULT_PAGE_SIZE = 500;
const execFile = promisify(execFileCallback);

function quoteIdentifier(identifier) {
  if (!IDENTITY_TABLES.includes(identifier)) throw new Error(`Table is not allowlisted: ${identifier}`);
  return `"${identifier}"`;
}

export function buildKeysetQuery(table, lastId = 0, pageSize = DEFAULT_PAGE_SIZE) {
  quoteIdentifier(table);
  if (!Number.isSafeInteger(lastId) || lastId < 0) throw new Error("lastId must be a non-negative integer");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${DEFAULT_PAGE_SIZE}`);
  }
  return `SELECT * FROM ${quoteIdentifier(table)} WHERE id > ${lastId} ORDER BY id LIMIT ${pageSize}`;
}

export function parseWranglerJson(output) {
  const parsed = typeof output === "string" ? JSON.parse(output) : output;
  if (
    Array.isArray(parsed) &&
    parsed.every((row) => !row || (typeof row === "object" && !Object.hasOwn(row, "results") && !Object.hasOwn(row, "result")))
  ) {
    return parsed;
  }
  const payload = Array.isArray(parsed) ? parsed[0] : parsed;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.result?.results)) return payload.result.results;
  throw new Error("wrangler d1 execute did not return a results array");
}

async function executeD1Select({ database, query, accountId, env, command = "wrangler", execute }) {
  if (execute) return parseWranglerJson(await execute({ database, query, env }));
  const args = ["d1", "execute", database, "--remote", "--command", query, "--json"];
  if (env) args.push("--env", env);
  if (accountId) args.push("--account-id", accountId);
  const result = await execFile(command, args, { maxBuffer: 64 * 1024 * 1024 });
  return parseWranglerJson(result.stdout);
}

export async function collectTable({ table, database, pageSize = DEFAULT_PAGE_SIZE, accountId, env, execute }) {
  quoteIdentifier(table);
  const rows = [];
  let lastId = 0;
  for (;;) {
    const page = await executeD1Select({
      database,
      query: buildKeysetQuery(table, lastId, pageSize),
      accountId,
      env,
      execute,
    });
    if (page.length > pageSize) throw new Error(`D1 returned more than ${pageSize} rows for ${table}`);
    let previousId = lastId;
    for (const row of page) {
      const id = Number(row?.id);
      if (!Number.isSafeInteger(id) || id <= previousId) {
        throw new Error(`D1 keyset order is invalid for ${table}`);
      }
      rows.push(row);
      previousId = id;
    }
    lastId = previousId;
    if (page.length < pageSize) break;
  }
  return { rows, lastId };
}

export async function collectIdentitySnapshot({ database, pageSize = DEFAULT_PAGE_SIZE, accountId, env, execute }) {
  if (!database) throw new Error("A D1 database name is required");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${DEFAULT_PAGE_SIZE}`);
  }
  const tables = {};
  for (const table of IDENTITY_TABLES) {
    const collected = await collectTable({ table, database, pageSize, accountId, env, execute });
    tables[table] = { rows: collected.rows, lastId: collected.lastId, rowCount: collected.rows.length };
  }
  return {
    format: "mollulog.identity.snapshot.v1",
    pageSize,
    generatedAt: new Date().toISOString(),
    tables,
  };
}

/** Writes a snapshot without exposing its contents through a group/world-readable file. */
export async function writeIdentitySnapshot(output, snapshot) {
  await mkdir(dirname(output), { recursive: true });
  const file = await open(output, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  } finally {
    await file.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const database = value("--database");
  const output = value("--output") ?? "identity.snapshot.json";
  const pageSize = Number(value("--page-size") ?? DEFAULT_PAGE_SIZE);
  const accountId = value("--account-id");
  const env = value("--env");
  if (!database) throw new Error("Usage: identity-d1-collect.mjs --database NAME --output FILE");
  const snapshot = await collectIdentitySnapshot({ database, pageSize, accountId, env });
  await writeIdentitySnapshot(output, snapshot);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
