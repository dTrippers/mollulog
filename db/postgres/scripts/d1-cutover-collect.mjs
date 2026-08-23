#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import {
  D1_CUTOVER_BOOLEAN_COLUMNS,
  D1_CUTOVER_INTEGER_COLUMNS,
  D1_CUTOVER_JSON_COLUMNS,
  D1_CUTOVER_NULLABLE_COLUMNS,
  D1_CUTOVER_TABLE_COLUMNS,
  D1_CUTOVER_TABLES,
  D1_CUTOVER_TIMESTAMP_COLUMNS,
  D1_CUTOVER_UNIQUE_KEYS,
  D1_CUTOVER_SNAPSHOT_FORMAT,
} from "./d1-cutover-tables.mjs";

export const DEFAULT_PAGE_SIZE = 500;
export const DEFAULT_MAX_TOTAL_ROWS = 100_000;
export const DEFAULT_MAX_SOURCE_BYTES = 256 * 1024 * 1024;
export const D1_CUTOVER_PREFLIGHT_FORMAT = "mollulog.d1.preflight.v1";
const execFile = promisify(execFileCallback);

/**
 * Wrangler versions observed during the cutover rehearsal returned one of these
 * JSON envelopes; keep the accepted shapes explicit so a future CLI change
 * fails with an actionable error instead of silently collecting the wrong data.
 */
const SUPPORTED_WRANGLER_JSON_SHAPES = [
  "a top-level raw row array: [{...}]",
  "{ results: [{...}] }",
  "{ result: [{...}] }",
  "{ result: { results: [{...}] } }",
  "a one-element wrapper array containing one of the object shapes",
].join("; ");

function assertTable(table) {
  if (!D1_CUTOVER_TABLES.includes(table)) throw new Error(`Table is not allowlisted: ${table}`);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) throw new Error(`Invalid identifier: ${identifier}`);
  return `"${identifier}"`;
}

export function buildKeysetQuery(table, lastId = 0, pageSize = DEFAULT_PAGE_SIZE) {
  assertTable(table);
  if (!Number.isSafeInteger(lastId) || lastId < 0) throw new Error("lastId must be a non-negative integer");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${DEFAULT_PAGE_SIZE}`);
  }
  return `SELECT * FROM ${quoteIdentifier(table)} WHERE id > ${lastId} ORDER BY id LIMIT ${pageSize}`;
}

function isRawRow(value) {
  return isPlainObject(value) && !Object.hasOwn(value, "results") && !Object.hasOwn(value, "result");
}

export function parseWranglerJson(output) {
  const parsed = typeof output === "string" ? JSON.parse(output) : output;

  if (Array.isArray(parsed)) {
    if (parsed.length === 0 || parsed.every(isRawRow)) return parsed;
    if (parsed.length === 1) return parseWranglerJson(parsed[0]);
    throw new Error(
      `wrangler d1 execute returned an unsupported JSON shape (array length ${parsed.length}); supported shapes: ${SUPPORTED_WRANGLER_JSON_SHAPES}`,
    );
  }
  if (Array.isArray(parsed?.results)) return parsed.results;
  if (Array.isArray(parsed?.result)) return parsed.result;
  if (parsed?.result && typeof parsed.result === "object") return parseWranglerJson(parsed.result);
  const observed = isPlainObject(parsed) ? `object keys=${Object.keys(parsed).join(",") || "<none>"}` : typeof parsed;
  throw new Error(
    `wrangler d1 execute returned an unsupported JSON shape (${observed}); expected a results array; supported shapes: ${SUPPORTED_WRANGLER_JSON_SHAPES}`,
  );
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const TIMESTAMP_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?(?<timezone>Z|[+-]\d{2}(?::?\d{2})?)?$/i;

function assertTimestamp(value, key) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid timestamp for ${key}`);
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match?.groups) throw new Error(`Invalid timestamp for ${key}`);

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(`Invalid timestamp for ${key}`);
  }

  const timezone = match.groups.timezone;
  if (timezone && timezone.toUpperCase() !== "Z") {
    const offsetMatch = /^(?<sign>[+-])(?<hours>\d{2})(?::?(?<minutes>\d{2}))?$/.exec(timezone);
    if (!offsetMatch?.groups) throw new Error(`Invalid timestamp for ${key}`);
    const offsetHours = Number(offsetMatch.groups.hours);
    const offsetMinutes = Number(offsetMatch.groups.minutes ?? "0");
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error(`Invalid timestamp for ${key}`);
  }
}

function assertRowColumns(table, row) {
  if (!isPlainObject(row)) throw new Error(`Malformed row in ${table}`);
  const expected = D1_CUTOVER_TABLE_COLUMNS[table];
  const unknown = Object.keys(row).filter((column) => !expected.includes(column));
  if (unknown.length > 0) throw new Error(`Unknown columns in ${table}: ${unknown.join(",")}`);
  const missing = expected.filter((column) => !Object.hasOwn(row, column));
  if (missing.length > 0) throw new Error(`Missing columns in ${table}: ${missing.join(",")}`);
}

function assertRawValue(table, column, value) {
  if (value === null) {
    if (!D1_CUTOVER_NULLABLE_COLUMNS.has(column)) throw new Error(`Invalid null value for ${table}.${column}`);
    return;
  }
  if (D1_CUTOVER_INTEGER_COLUMNS.has(column)) {
    if (!Number.isSafeInteger(value)) throw new Error(`Invalid integer for ${table}.${column}`);
    if (column === "id" && value <= 0) throw new Error(`Invalid id for ${table}`);
    if (column === "userId" && value <= 0) throw new Error(`Invalid userId for ${table}`);
    return;
  }
  if (D1_CUTOVER_BOOLEAN_COLUMNS.has(column)) {
    if (value !== 0 && value !== 1) throw new Error(`Invalid boolean for ${table}.${column}`);
    return;
  }
  if (D1_CUTOVER_TIMESTAMP_COLUMNS.has(column)) {
    assertTimestamp(value, `${table}.${column}`);
    return;
  }
  if (D1_CUTOVER_JSON_COLUMNS.has(column)) {
    if (typeof value !== "string") throw new Error(`Invalid JSON text for ${table}.${column}`);
    try {
      JSON.parse(value);
    } catch {
      throw new Error(`Invalid JSON text for ${table}.${column}`);
    }
    return;
  }
  if (typeof value !== "string") throw new Error(`Invalid text for ${table}.${column}`);
}

export function validateRawRow(table, row) {
  assertTable(table);
  assertRowColumns(table, row);
  for (const column of D1_CUTOVER_TABLE_COLUMNS[table]) assertRawValue(table, column, row[column]);
  return row;
}

function tupleKey(row, columns) {
  return JSON.stringify(columns.map((column) => row[column]));
}

export function validateTableRows(table, rows) {
  assertTable(table);
  if (!Array.isArray(rows)) throw new Error(`Snapshot rows must be an array for ${table}`);
  const ids = new Set();
  let previousId = 0;
  for (const row of rows) {
    validateRawRow(table, row);
    if (row.id <= previousId) throw new Error(`D1 keyset order is invalid for ${table}`);
    if (ids.has(row.id)) throw new Error(`Duplicate id in ${table}: ${row.id}`);
    ids.add(row.id);
    previousId = row.id;
  }

  for (const columns of D1_CUTOVER_UNIQUE_KEYS[table]) {
    const keys = new Set();
    for (const row of rows) {
      const key = tupleKey(row, columns);
      if (keys.has(key)) throw new Error(`Duplicate unique key in ${table}: ${columns.join(",")}`);
      keys.add(key);
    }
  }
  return rows;
}

export async function executeD1Select({ database, query, accountId, env, command = "wrangler", execute }) {
  if (execute) return parseWranglerJson(await execute({ database, query, accountId, env }));
  const args = ["d1", "execute", database, "--remote", "--command", query, "--json"];
  if (env) args.push("--env", env);
  if (accountId) args.push("--account-id", accountId);
  const result = await execFile(command, args, { maxBuffer: 64 * 1024 * 1024 });
  return parseWranglerJson(result.stdout);
}

function assertPositiveLimit(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
}

function snapshotRowBytes(row) {
  return Buffer.byteLength(JSON.stringify(row), "utf8");
}

export async function collectTable({ table, database, pageSize = DEFAULT_PAGE_SIZE, accountId, env, execute, onRow }) {
  assertTable(table);
  if (!database) throw new Error("A D1 database name is required");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${DEFAULT_PAGE_SIZE}`);
  }

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
      if (!isPlainObject(row)) throw new Error(`Malformed row in ${table}`);
      if (!Number.isSafeInteger(row.id) || row.id <= previousId) {
        throw new Error(`D1 keyset order is invalid for ${table}`);
      }
      rows.push(row);
      onRow?.(row);
      previousId = row.id;
    }
    lastId = previousId;
    if (page.length < pageSize) break;
  }
  return { rows, lastId };
}

export function validateSnapshotTables(tables) {
  if (!isPlainObject(tables)) throw new Error("Snapshot tables must be an object");
  const actual = Object.keys(tables);
  const unexpected = actual.filter((table) => !D1_CUTOVER_TABLES.includes(table));
  const missing = D1_CUTOVER_TABLES.filter((table) => !actual.includes(table));
  if (unexpected.length > 0) throw new Error(`Snapshot contains non-allowlisted tables: ${unexpected.join(",")}`);
  if (missing.length > 0) throw new Error(`Snapshot is missing tables: ${missing.join(",")}`);
  return tables;
}

export async function collectD1CutoverSnapshot({
  database,
  pageSize = DEFAULT_PAGE_SIZE,
  accountId,
  env,
  execute,
  maxTotalRows = DEFAULT_MAX_TOTAL_ROWS,
  maxSnapshotBytes = DEFAULT_MAX_SOURCE_BYTES,
}) {
  if (!database) throw new Error("A D1 database name is required");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${DEFAULT_PAGE_SIZE}`);
  }
  assertPositiveLimit(maxTotalRows, "maxTotalRows");
  assertPositiveLimit(maxSnapshotBytes, "maxSnapshotBytes");

  const tables = {};
  let totalRows = 0;
  let totalSnapshotBytes = 0;
  for (const table of D1_CUTOVER_TABLES) {
    const collected = await collectTable({
      table,
      database,
      pageSize,
      accountId,
      env,
      execute,
      onRow: (row) => {
        totalRows += 1;
        totalSnapshotBytes += snapshotRowBytes(row);
        if (totalRows > maxTotalRows) {
          throw new Error(`D1 cutover snapshot exceeded maxTotalRows=${maxTotalRows}; abort and reassess source size`);
        }
        if (totalSnapshotBytes > maxSnapshotBytes) {
          throw new Error(
            `D1 cutover snapshot exceeded maxSnapshotBytes=${maxSnapshotBytes}; abort and reassess source size`,
          );
        }
      },
    });
    validateTableRows(table, collected.rows);
    tables[table] = {
      rows: collected.rows,
      lastId: collected.lastId,
      rowCount: collected.rows.length,
    };
  }
  return {
    format: D1_CUTOVER_SNAPSHOT_FORMAT,
    pageSize,
    generatedAt: new Date().toISOString(),
    tables,
  };
}

function buildPreflightQuery(table) {
  assertTable(table);
  const sourceBytesExpression = D1_CUTOVER_TABLE_COLUMNS[table]
    .map((column) => `COALESCE(length(CAST(${quoteIdentifier(column)} AS BLOB)), 0)`)
    .join(" + ");
  return `SELECT COUNT(*) AS "rowCount", COALESCE(MAX(${quoteIdentifier("id")}), 0) AS "lastId", COALESCE(SUM(${sourceBytesExpression}), 0) AS "sourceBytes" FROM ${quoteIdentifier(table)}`;
}

function parseNonNegativeInteger(value, label) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return parsed;
}

export async function preflightD1Cutover({
  database,
  accountId,
  env,
  execute,
  maxTotalRows = DEFAULT_MAX_TOTAL_ROWS,
  maxSourceBytes = DEFAULT_MAX_SOURCE_BYTES,
}) {
  if (!database) throw new Error("A D1 database name is required");
  assertPositiveLimit(maxTotalRows, "maxTotalRows");
  assertPositiveLimit(maxSourceBytes, "maxSourceBytes");

  const tables = {};
  let totalRows = 0;
  let totalSourceBytes = 0;
  for (const table of D1_CUTOVER_TABLES) {
    const result = await executeD1Select({
      database,
      query: buildPreflightQuery(table),
      accountId,
      env,
      execute,
    });
    if (result.length !== 1 || !isPlainObject(result[0])) {
      throw new Error(`D1 preflight returned an unexpected result for ${table}`);
    }
    const rowCount = parseNonNegativeInteger(result[0].rowCount, `${table}.rowCount`);
    const lastId = parseNonNegativeInteger(result[0].lastId, `${table}.lastId`);
    const sourceBytes = parseNonNegativeInteger(result[0].sourceBytes, `${table}.sourceBytes`);
    totalRows += rowCount;
    totalSourceBytes += sourceBytes;
    if (totalRows > maxTotalRows) {
      throw new Error(`D1 cutover preflight exceeded maxTotalRows=${maxTotalRows}; abort and reassess source size`);
    }
    if (totalSourceBytes > maxSourceBytes) {
      throw new Error(`D1 cutover preflight exceeded maxSourceBytes=${maxSourceBytes}; abort and reassess source size`);
    }
    tables[table] = { rowCount, lastId, sourceBytes };
  }

  return {
    format: D1_CUTOVER_PREFLIGHT_FORMAT,
    generatedAt: new Date().toISOString(),
    maxTotalRows,
    maxSourceBytes,
    totalRows,
    totalSourceBytes,
    tables,
  };
}

/** Writes protected JSON using exclusive mode 0600 and never overwrites an existing file. */
async function writeProtectedJson(output, value, label) {
  if (!output) throw new Error(`A ${label} output path is required`);
  await mkdir(dirname(output), { recursive: true });
  const file = await open(output, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await file.close();
  }
}

/** Writes a snapshot using exclusive mode 0600 and never overwrites an existing file. */
export async function writeD1CutoverSnapshot(output, snapshot) {
  await writeProtectedJson(output, snapshot, "snapshot");
}

export async function writeD1CutoverPreflight(output, preflight) {
  await writeProtectedJson(output, preflight, "preflight");
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const database = optionValue(args, "--database");
  const output = optionValue(args, "--output");
  const pageSize = Number(optionValue(args, "--page-size") ?? DEFAULT_PAGE_SIZE);
  const accountId = optionValue(args, "--account-id");
  const env = optionValue(args, "--env");
  const maxTotalRows = Number(optionValue(args, "--max-total-rows") ?? DEFAULT_MAX_TOTAL_ROWS);
  const maxSourceBytes = Number(optionValue(args, "--max-source-bytes") ?? DEFAULT_MAX_SOURCE_BYTES);
  if (!database || !output) {
    throw new Error(
      "Usage: d1-cutover-collect.mjs [--preflight] --database NAME --output FILE [--env ENV] [--page-size N] [--max-total-rows N] [--max-source-bytes N]",
    );
  }
  if (args.includes("--preflight")) {
    const preflight = await preflightD1Cutover({ database, accountId, env, maxTotalRows, maxSourceBytes });
    await writeD1CutoverPreflight(output, preflight);
    return;
  }
  const snapshot = await collectD1CutoverSnapshot({
    database,
    pageSize,
    accountId,
    env,
    maxTotalRows,
    maxSnapshotBytes: maxSourceBytes,
  });
  await writeD1CutoverSnapshot(output, snapshot);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
