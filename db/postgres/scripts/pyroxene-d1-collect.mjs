#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

export const PYROXENE_TABLES = [
  "pyroxene_owned_resources",
  "pyroxene_collected_sources",
  "pyroxene_timeline_items",
  "pyroxene_planner_options",
  "pyroxene_event_data",
  "pyroxene_guest_import_items",
];
export const DEFAULT_PAGE_SIZE = 500;
export const PYROXENE_SNAPSHOT_FORMAT = "mollulog.pyroxene.snapshot.v1";

export const PYROXENE_TABLE_COLUMNS = {
  pyroxene_owned_resources: [
    "id",
    "uid",
    "userId",
    "inputAt",
    "pyroxene",
    "oneTimeTicket",
    "tenTimeTicket",
    "createdAt",
    "updatedAt",
  ],
  pyroxene_collected_sources: ["id", "uid", "userId", "sourceKey", "collectedAt", "createdAt"],
  pyroxene_timeline_items: [
    "id",
    "uid",
    "userId",
    "eventAt",
    "source",
    "repeatType",
    "repeatIntervalDays",
    "repeatCount",
    "autoRepurchase",
    "description",
    "pyroxeneDelta",
    "oneTimeTicketDelta",
    "tenTimeTicketDelta",
    "createdAt",
    "updatedAt",
  ],
  pyroxene_planner_options: ["id", "userId", "options", "createdAt", "updatedAt"],
  pyroxene_event_data: ["id", "uid", "userId", "eventUid", "completed", "expectedTrials", "createdAt", "updatedAt"],
  pyroxene_guest_import_items: ["id", "userId", "datasetId", "itemType", "itemKey", "importedAt"],
};

export const PYROXENE_UNIQUE_KEYS = {
  pyroxene_owned_resources: [["uid"]],
  pyroxene_collected_sources: [["uid"], ["userId", "sourceKey"]],
  pyroxene_timeline_items: [["uid"]],
  pyroxene_planner_options: [["userId"]],
  pyroxene_event_data: [["uid"], ["userId", "eventUid"]],
  pyroxene_guest_import_items: [["userId", "datasetId", "itemType", "itemKey"]],
};

const INTEGER_COLUMNS = new Set([
  "id",
  "userId",
  "pyroxene",
  "oneTimeTicket",
  "tenTimeTicket",
  "repeatIntervalDays",
  "repeatCount",
  "pyroxeneDelta",
  "oneTimeTicketDelta",
  "tenTimeTicketDelta",
  "expectedTrials",
]);
const BOOLEAN_COLUMNS = new Set(["autoRepurchase", "completed"]);
const TIMESTAMP_COLUMNS = new Set([
  "inputAt",
  "collectedAt",
  "eventAt",
  "createdAt",
  "updatedAt",
  "importedAt",
]);
const NULLABLE_COLUMNS = new Set(["repeatType", "repeatIntervalDays", "repeatCount", "expectedTrials"]);
const execFile = promisify(execFileCallback);

function assertTable(table) {
  if (!PYROXENE_TABLES.includes(table)) throw new Error(`Table is not allowlisted: ${table}`);
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
    throw new Error("wrangler d1 execute did not return a results array");
  }
  if (Array.isArray(parsed?.results)) return parsed.results;
  if (Array.isArray(parsed?.result)) return parsed.result;
  if (parsed?.result && typeof parsed.result === "object") return parseWranglerJson(parsed.result);
  throw new Error("wrangler d1 execute did not return a results array");
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
  const expected = PYROXENE_TABLE_COLUMNS[table];
  const unknown = Object.keys(row).filter((column) => !expected.includes(column));
  if (unknown.length > 0) throw new Error(`Unknown columns in ${table}: ${unknown.join(",")}`);
  const missing = expected.filter((column) => !Object.hasOwn(row, column));
  if (missing.length > 0) throw new Error(`Missing columns in ${table}: ${missing.join(",")}`);
}

function assertRawValue(table, column, value) {
  if (value === null) {
    if (!NULLABLE_COLUMNS.has(column)) throw new Error(`Invalid null value for ${table}.${column}`);
    return;
  }
  if (INTEGER_COLUMNS.has(column)) {
    if (!Number.isSafeInteger(value)) throw new Error(`Invalid integer for ${table}.${column}`);
    if (column === "id" && value <= 0) throw new Error(`Invalid id for ${table}`);
    if (column === "userId" && value <= 0) throw new Error(`Invalid userId for ${table}`);
    return;
  }
  if (BOOLEAN_COLUMNS.has(column)) {
    if (value !== 0 && value !== 1) throw new Error(`Invalid boolean for ${table}.${column}`);
    return;
  }
  if (TIMESTAMP_COLUMNS.has(column)) {
    assertTimestamp(value, `${table}.${column}`);
    return;
  }
  if (typeof value !== "string") throw new Error(`Invalid text for ${table}.${column}`);
}

export function validateRawRow(table, row) {
  assertTable(table);
  assertRowColumns(table, row);
  for (const column of PYROXENE_TABLE_COLUMNS[table]) assertRawValue(table, column, row[column]);
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

  for (const columns of PYROXENE_UNIQUE_KEYS[table]) {
    const keys = new Set();
    for (const row of rows) {
      const key = tupleKey(row, columns);
      if (keys.has(key)) throw new Error(`Duplicate unique key in ${table}: ${columns.join(",")}`);
      keys.add(key);
    }
  }
  return rows;
}

async function executeD1Select({ database, query, accountId, env, command = "wrangler", execute }) {
  if (execute) return parseWranglerJson(await execute({ database, query, accountId, env }));
  const args = ["d1", "execute", database, "--remote", "--command", query, "--json"];
  if (env) args.push("--env", env);
  if (accountId) args.push("--account-id", accountId);
  const result = await execFile(command, args, { maxBuffer: 64 * 1024 * 1024 });
  return parseWranglerJson(result.stdout);
}

export async function collectTable({ table, database, pageSize = DEFAULT_PAGE_SIZE, accountId, env, execute }) {
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
  const unexpected = actual.filter((table) => !PYROXENE_TABLES.includes(table));
  const missing = PYROXENE_TABLES.filter((table) => !actual.includes(table));
  if (unexpected.length > 0) throw new Error(`Snapshot contains non-allowlisted tables: ${unexpected.join(",")}`);
  if (missing.length > 0) throw new Error(`Snapshot is missing tables: ${missing.join(",")}`);
  return tables;
}

export async function collectPyroxeneSnapshot({ database, pageSize = DEFAULT_PAGE_SIZE, accountId, env, execute }) {
  if (!database) throw new Error("A D1 database name is required");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${DEFAULT_PAGE_SIZE}`);
  }

  const tables = {};
  for (const table of PYROXENE_TABLES) {
    const collected = await collectTable({ table, database, pageSize, accountId, env, execute });
    validateTableRows(table, collected.rows);
    tables[table] = {
      rows: collected.rows,
      lastId: collected.lastId,
      rowCount: collected.rows.length,
    };
  }
  return {
    format: PYROXENE_SNAPSHOT_FORMAT,
    pageSize,
    generatedAt: new Date().toISOString(),
    tables,
  };
}

/** Writes a snapshot using exclusive mode 0600 and never overwrites an existing file. */
export async function writePyroxeneSnapshot(output, snapshot) {
  if (!output) throw new Error("A snapshot output path is required");
  await mkdir(dirname(output), { recursive: true });
  const file = await open(output, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  } finally {
    await file.close();
  }
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
  if (!database || !output) {
    throw new Error("Usage: pyroxene-d1-collect.mjs --database NAME --output FILE [--env ENV] [--page-size N]");
  }
  const snapshot = await collectPyroxeneSnapshot({ database, pageSize, accountId, env });
  await writePyroxeneSnapshot(output, snapshot);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
