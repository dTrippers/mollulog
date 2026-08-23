#!/usr/bin/env node

import { readFile } from "node:fs/promises";
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

export const INSERT_CHUNK_SIZE = 500;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_STATEMENT_TIMEOUT_MS = DEFAULT_STATEMENT_TIMEOUT_MS;
export const POSTGRES_INTEGER_MAX = 2147483647;
export const PYROXENE_RECEIPT_KEY_VERSION = "v1";
export const PYROXENE_RECEIPT_KEY_PREFIX = `${PYROXENE_RECEIPT_KEY_VERSION}:`;
const SNAPSHOT_ENVELOPE_FIELDS = ["format", "pageSize", "generatedAt", "tables"];
const SNAPSHOT_TABLE_FIELDS = ["rows", "rowCount", "lastId"];
const TIMESTAMP_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?(?<timezone>Z|[+-]\d{2}(?::?\d{2})?)?$/i;

function assertTable(table) {
  if (!D1_CUTOVER_TABLES.includes(table)) throw new Error(`Table is not allowlisted: ${table}`);
}

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) throw new Error(`Invalid identifier: ${identifier}`);
  return `"${identifier}"`;
}

function camelToSnake(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `${label} must contain exactly ${expected.join(",")}; missing=${missing.join(",")}; unknown=${unknown.join(",")}`,
    );
  }
}

function isDate(value) {
  return value instanceof Date;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function normalizeTimestamp(value, key) {
  if (isDate(value)) {
    if (Number.isNaN(value.valueOf())) throw new Error(`Invalid timestamp for ${key}`);
    return new Date(value.valueOf());
  }
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

  const fraction = match.groups.fraction ?? "";
  const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));
  const timezone = match.groups.timezone;
  let timezoneOffsetMinutes = 0;
  if (timezone && timezone.toUpperCase() !== "Z") {
    const offsetMatch = /^(?<sign>[+-])(?<hours>\d{2})(?::?(?<minutes>\d{2}))?$/.exec(timezone);
    if (!offsetMatch?.groups) throw new Error(`Invalid timestamp for ${key}`);
    const offsetHours = Number(offsetMatch.groups.hours);
    const offsetMinutes = Number(offsetMatch.groups.minutes ?? "0");
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error(`Invalid timestamp for ${key}`);
    timezoneOffsetMinutes = (offsetHours * 60 + offsetMinutes) * (offsetMatch.groups.sign === "+" ? 1 : -1);
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  date.setTime(date.getTime() - timezoneOffsetMinutes * 60 * 1000);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid timestamp for ${key}`);
  return date;
}

function normalizeInteger(table, column, value) {
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid integer for ${table}.${column}`);
  if (value < -2147483648 || value > POSTGRES_INTEGER_MAX) throw new Error(`Invalid integer for ${table}.${column}`);
  if (column === "id" && value <= 0) throw new Error(`Invalid id for ${table}`);
  if (column === "userId" && value <= 0) throw new Error(`Invalid userId for ${table}`);
  return value;
}

function normalizeBoolean(table, column, value, source) {
  if (source) {
    if (value !== 0 && value !== 1) throw new Error(`Invalid boolean for ${table}.${column}`);
    return value === 1;
  }
  if (typeof value !== "boolean") throw new Error(`Invalid PostgreSQL boolean for ${table}.${column}`);
  return value;
}

function parseJsonValue(table, column, value) {
  const parsed = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Invalid JSON value for ${table}.${column}`);
    }
  })() : value;
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`Invalid JSON value for ${table}.${column}`);
  }
  return parsed;
}

function canonicalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeValue(value[key])]));
  }
  return value;
}

function assertSourceColumns(table, row) {
  if (!isPlainObject(row)) throw new Error(`Malformed row in ${table}`);
  const expected = D1_CUTOVER_TABLE_COLUMNS[table];
  const unknown = Object.keys(row).filter((column) => !expected.includes(column));
  if (unknown.length > 0) throw new Error(`Unknown columns in ${table}: ${unknown.join(",")}`);
  const missing = expected.filter((column) => !Object.hasOwn(row, column));
  if (missing.length > 0) throw new Error(`Missing columns in ${table}: ${missing.join(",")}`);
}

function assertTargetColumns(table, row) {
  if (!isPlainObject(row)) throw new Error(`Malformed PostgreSQL row in ${table}`);
  const expected = D1_CUTOVER_TABLE_COLUMNS[table].map(camelToSnake);
  const unknown = Object.keys(row).filter((column) => !expected.includes(column));
  if (unknown.length > 0) throw new Error(`Unknown PostgreSQL columns in ${table}: ${unknown.join(",")}`);
  const missing = expected.filter((column) => !Object.hasOwn(row, column));
  if (missing.length > 0) throw new Error(`Missing PostgreSQL columns in ${table}: ${missing.join(",")}`);
}

function sourceValue(table, row, column) {
  assertTable(table);
  return row[column];
}

function targetValue(table, row, column) {
  assertTable(table);
  return row[camelToSnake(column)];
}

function normalizeSourceValue(table, column, value) {
  if (value === null) {
    if (!D1_CUTOVER_NULLABLE_COLUMNS.has(column)) throw new Error(`Invalid null value for ${table}.${column}`);
    return null;
  }
  if (D1_CUTOVER_INTEGER_COLUMNS.has(column)) return normalizeInteger(table, column, value);
  if (D1_CUTOVER_BOOLEAN_COLUMNS.has(column)) return normalizeBoolean(table, column, value, true);
  if (D1_CUTOVER_TIMESTAMP_COLUMNS.has(column)) return normalizeTimestamp(value, `${table}.${column}`);
  if (D1_CUTOVER_JSON_COLUMNS.has(column)) return parseJsonValue(table, column, value);
  if (typeof value !== "string") throw new Error(`Invalid text for ${table}.${column}`);
  return value;
}

function normalizeTargetValue(table, column, value) {
  if (value === null) {
    if (!D1_CUTOVER_NULLABLE_COLUMNS.has(column)) throw new Error(`Invalid null value for ${table}.${column}`);
    return null;
  }
  if (D1_CUTOVER_INTEGER_COLUMNS.has(column)) return normalizeInteger(table, column, value);
  if (D1_CUTOVER_BOOLEAN_COLUMNS.has(column)) return normalizeBoolean(table, column, value, false);
  if (D1_CUTOVER_TIMESTAMP_COLUMNS.has(column)) return normalizeTimestamp(value, `${table}.${column}`);
  if (D1_CUTOVER_JSON_COLUMNS.has(column)) return parseJsonValue(table, column, value);
  if (typeof value !== "string") throw new Error(`Invalid text for ${table}.${column}`);
  if (table === "pyroxene_guest_import_items" && column === "itemKey") {
    return decodePostgresPyroxeneReceiptItemKey(value);
  }
  return value;
}

function normalizedSourceRow(table, row) {
  assertSourceColumns(table, row);
  return Object.fromEntries(
    D1_CUTOVER_TABLE_COLUMNS[table].map((column) => [column, normalizeSourceValue(table, column, sourceValue(table, row, column))]),
  );
}

function normalizedTargetRow(table, row) {
  assertTargetColumns(table, row);
  return Object.fromEntries(
    D1_CUTOVER_TABLE_COLUMNS[table].map((column) => [column, normalizeTargetValue(table, column, targetValue(table, row, column))]),
  );
}

export function canonicalRow(row, table) {
  assertTable(table);
  const isTarget = D1_CUTOVER_TABLE_COLUMNS[table].some(
    (column) => column !== camelToSnake(column) && Object.hasOwn(row ?? {}, camelToSnake(column)),
  );
  const normalized = isTarget ? normalizedTargetRow(table, row) : normalizedSourceRow(table, row);
  return JSON.stringify(
    canonicalizeValue(normalized),
  );
}

export function canonicalIdentity(row, table) {
  assertTable(table);
  const value = row?.id;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Snapshot rows must have an id for ${table}`);
  return String(value);
}

function tupleKey(row, columns) {
  return JSON.stringify(columns.map((column) => row[column]));
}

function validateUniqueKeys(table, rows) {
  for (const columns of D1_CUTOVER_UNIQUE_KEYS[table]) {
    const keys = new Set();
    for (const row of rows) {
      const key = tupleKey(row, columns);
      if (keys.has(key)) throw new Error(`Duplicate unique key in ${table}: ${columns.join(",")}`);
      keys.add(key);
    }
  }
}

export function parseSnapshotTable(snapshot, table) {
  assertTable(table);
  const value = snapshot?.tables?.[table];
  if (!isPlainObject(value)) throw new Error(`Snapshot is missing ${table}`);
  assertExactKeys(value, SNAPSHOT_TABLE_FIELDS, `Snapshot table ${table}`);
  if (!Array.isArray(value.rows)) throw new Error(`Snapshot rows are invalid for ${table}`);
  if (!Number.isSafeInteger(value.rowCount) || value.rowCount !== value.rows.length) {
    throw new Error(`Snapshot row count is invalid for ${table}`);
  }
  const ids = new Set();
  let maximumId = 0;
  let previousId = 0;
  for (const row of value.rows) {
    const normalized = normalizedSourceRow(table, row);
    const id = normalized.id;
    if (ids.has(id)) throw new Error(`Duplicate id in ${table}: ${id}`);
    if (id <= 0 || id <= previousId) throw new Error(`Snapshot IDs must be strictly increasing for ${table}: ${id}`);
    ids.add(id);
    maximumId = Math.max(maximumId, id);
    previousId = id;
  }
  if (!Number.isSafeInteger(value.lastId) || value.lastId !== maximumId) {
    throw new Error(`Snapshot lastId is invalid for ${table}`);
  }
  validateUniqueKeys(table, value.rows);
  return value.rows;
}

export function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Unsupported snapshot format");
  assertExactKeys(snapshot, SNAPSHOT_ENVELOPE_FIELDS, "Snapshot envelope");
  if (snapshot.format !== D1_CUTOVER_SNAPSHOT_FORMAT) throw new Error("Unsupported snapshot format");
  if (!Number.isSafeInteger(snapshot.pageSize) || snapshot.pageSize < 1 || snapshot.pageSize > INSERT_CHUNK_SIZE) {
    throw new Error(`Snapshot pageSize must be between 1 and ${INSERT_CHUNK_SIZE}`);
  }
  const tables = snapshot.tables;
  if (!isPlainObject(tables)) throw new Error("Snapshot tables must be an object");
  const actual = Object.keys(tables);
  const unexpected = actual.filter((table) => !D1_CUTOVER_TABLES.includes(table));
  const missing = D1_CUTOVER_TABLES.filter((table) => !actual.includes(table));
  if (unexpected.length > 0) throw new Error(`Snapshot contains non-allowlisted tables: ${unexpected.join(",")}`);
  if (missing.length > 0) throw new Error(`Snapshot is missing tables: ${missing.join(",")}`);
  if (typeof snapshot.generatedAt !== "string") throw new Error("Snapshot generatedAt must be a timestamp string");
  normalizeTimestamp(snapshot.generatedAt, "generatedAt");
  return Object.fromEntries(D1_CUTOVER_TABLES.map((table) => [table, parseSnapshotTable(snapshot, table)]));
}

function encodeBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

export function encodePostgresPyroxeneReceiptItemKey(itemKey) {
  if (typeof itemKey !== "string") throw new Error("Receipt item key must be a string");
  return `${PYROXENE_RECEIPT_KEY_PREFIX}${encodeBase64Url(new TextEncoder().encode(itemKey))}`;
}

function invalidReceiptKeyError() {
  return new Error(`Invalid ${PYROXENE_RECEIPT_KEY_VERSION} PostgreSQL receipt item key`);
}

export function decodePostgresPyroxeneReceiptItemKey(storedKey) {
  if (typeof storedKey !== "string" || !storedKey.startsWith(PYROXENE_RECEIPT_KEY_PREFIX)) {
    const version = typeof storedKey === "string" && storedKey.includes(":") ? `${storedKey.slice(0, storedKey.indexOf(":") + 1)}` : "<missing>";
    throw new Error(`Unsupported PostgreSQL receipt item key version: ${version}`);
  }
  const encoded = storedKey.slice(PYROXENE_RECEIPT_KEY_PREFIX.length);
  if (!/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1) throw invalidReceiptKeyError();
  let bytes;
  try {
    bytes = Buffer.from(encoded, "base64url");
  } catch {
    throw invalidReceiptKeyError();
  }
  let itemKey;
  try {
    itemKey = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidReceiptKeyError();
  }
  if (encodePostgresPyroxeneReceiptItemKey(itemKey) !== storedKey) throw invalidReceiptKeyError();
  return itemKey;
}

function toPgValue(table, column, value) {
  const normalized = normalizeSourceValue(table, column, value);
  if (table === "pyroxene_guest_import_items" && column === "itemKey") {
    return encodePostgresPyroxeneReceiptItemKey(normalized);
  }
  return normalized;
}

export function buildInsertStatement(table, rows, start = 0, end = rows.length, targetTable = table) {
  assertTable(table);
  if (targetTable !== table && targetTable !== stageTableName(table)) {
    throw new Error(`Target table is not allowlisted: ${targetTable}`);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new Error("Invalid insert range");
  }
  const chunk = rows.slice(start, end);
  if (chunk.length === 0) return null;
  const columns = D1_CUTOVER_TABLE_COLUMNS[table];
  const values = [];
  const placeholders = chunk.map((row, rowIndex) => {
    const rowValues = columns.map((column) => toPgValue(table, column, row[column]));
    values.push(...rowValues);
    return `(${rowValues.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`;
  });
  return {
    text: `INSERT INTO ${quoteIdentifier(targetTable)} (${columns.map((column) => quoteIdentifier(camelToSnake(column))).join(", ")}) VALUES ${placeholders.join(", ")}`,
    values,
  };
}

export function compareTableParity(table, sourceRows, targetRows) {
  assertTable(table);
  const sourceByKey = new Map();
  const targetByKey = new Map();
  for (const row of sourceRows) {
    const key = canonicalIdentity(row, table);
    if (sourceByKey.has(key)) throw new Error(`Duplicate id in ${table} source: ${key}`);
    sourceByKey.set(key, canonicalRow(row, table));
  }
  for (const row of targetRows) {
    const key = canonicalIdentity(row, table);
    if (targetByKey.has(key)) throw new Error(`Duplicate id in ${table} target: ${key}`);
    targetByKey.set(key, canonicalRow(row, table));
  }
  const missing = [...sourceByKey.keys()].filter((key) => !targetByKey.has(key));
  const extra = [...targetByKey.keys()].filter((key) => !sourceByKey.has(key));
  const mismatched = [...sourceByKey.keys()].filter(
    (key) => targetByKey.has(key) && sourceByKey.get(key) !== targetByKey.get(key),
  );
  if (missing.length || extra.length || mismatched.length || sourceRows.length !== targetRows.length) {
    throw new Error(
      `Parity mismatch for ${table}: count ${sourceRows.length}/${targetRows.length}, missing=${missing.join(",")}, extra=${extra.join(",")}, content=${mismatched.join(",")}`,
    );
  }
}

function stageTableName(table) {
  assertTable(table);
  return `d1_cutover_stage_${table}`;
}

function typedColumnList(table) {
  assertTable(table);
  return D1_CUTOVER_TABLE_COLUMNS[table].map((column) => quoteIdentifier(camelToSnake(column))).join(", ");
}

export function createTypedStageStatement(table) {
  assertTable(table);
  return `CREATE TEMP TABLE ${quoteIdentifier(stageTableName(table))} ON COMMIT DROP AS SELECT ${typedColumnList(table)} FROM ${quoteIdentifier(table)} WITH NO DATA`;
}

export function parityDifferenceStatement(table, direction) {
  assertTable(table);
  if (direction !== "source_minus_target" && direction !== "target_minus_source") {
    throw new Error(`Unknown parity direction: ${direction}`);
  }
  const stage = quoteIdentifier(stageTableName(table));
  const target = quoteIdentifier(table);
  const columns = typedColumnList(table);
  const [left, right] = direction === "source_minus_target" ? [stage, target] : [target, stage];
  const label = direction === "source_minus_target" ? "source_difference" : "target_difference";
  return `SELECT COUNT(*)::bigint AS count FROM (SELECT ${columns} FROM ${left} EXCEPT SELECT ${columns} FROM ${right}) AS ${label}`;
}

function insertTargetFromStageStatement(table) {
  assertTable(table);
  const columns = typedColumnList(table);
  return `INSERT INTO ${quoteIdentifier(table)} (${columns}) SELECT ${columns} FROM ${quoteIdentifier(stageTableName(table))}`;
}

async function readCount(client, statement) {
  const result = await client.query(statement);
  const value = result.rows?.[0]?.count;
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("PostgreSQL parity count was invalid");
  return count;
}

async function assertSqlParity(client, table, sourceCount) {
  const targetCount = await readCount(client, `SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(table)}`);
  if (sourceCount !== targetCount) throw new Error(`Parity mismatch for ${table}: count ${sourceCount}/${targetCount}`);
  const sourceDifference = await readCount(client, parityDifferenceStatement(table, "source_minus_target"));
  const targetDifference = await readCount(client, parityDifferenceStatement(table, "target_minus_source"));
  if (sourceDifference !== 0 || targetDifference !== 0) {
    throw new Error(
      `Parity mismatch for ${table}: source_minus_target=${sourceDifference}, target_minus_source=${targetDifference}`,
    );
  }
}

async function assertRoundTripParity(client, table, sourceRows) {
  const result = await client.query(`SELECT * FROM ${quoteIdentifier(table)}`);
  compareTableParity(table, sourceRows, result.rows ?? []);
}

async function setImportTimeout(client, statementTimeoutMs) {
  if (
    !Number.isSafeInteger(statementTimeoutMs) ||
    statementTimeoutMs <= 0 ||
    statementTimeoutMs > MAX_STATEMENT_TIMEOUT_MS
  ) {
    throw new Error(`Import timeout must be between 1 and ${MAX_STATEMENT_TIMEOUT_MS}ms`);
  }
  await client.query("SELECT set_config('statement_timeout', $1, true)", [`${statementTimeoutMs}ms`]);
}

function quoteIdentitySequence(sequenceName) {
  if (typeof sequenceName !== "string" || sequenceName.length === 0) {
    throw new Error("PostgreSQL identity sequence result is missing");
  }
  const components = sequenceName.split(".");
  if (components.length < 1 || components.length > 2 || components.some((component) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(component))) {
    throw new Error(`PostgreSQL identity sequence identifier is untrusted: ${sequenceName}`);
  }
  return components.map((component) => quoteIdentifier(component)).join(".");
}

function parsePositiveSequenceRestart(value, table) {
  const restartValue =
    typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(restartValue) || restartValue <= 0 || restartValue > POSTGRES_INTEGER_MAX) {
    throw new Error(`PostgreSQL sequence restart value is invalid for ${table}; expected 1-${POSTGRES_INTEGER_MAX}`);
  }
  return restartValue;
}

async function repairIdentitySequence(client, table) {
  assertTable(table);
  const sequenceResult = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name", [table]);
  const sequenceName = sequenceResult?.rows?.[0]?.sequence_name;
  const quotedSequence = quoteIdentitySequence(sequenceName);
  const nextIdResult = await client.query(
    `SELECT COALESCE(MAX(id), 0)::bigint + 1 AS next_id FROM ${quoteIdentifier(table)}`,
  );
  const nextId = parsePositiveSequenceRestart(nextIdResult?.rows?.[0]?.next_id, table);
  await client.query(`ALTER SEQUENCE ${quotedSequence} RESTART WITH ${nextId}`);
}

function pgConfigFromEnvironment() {
  const missing = ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"].filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing PostgreSQL environment fields: ${missing.join(",")}`);
  const port = process.env.PGPORT === undefined ? undefined : Number(process.env.PGPORT);
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("Invalid PGPORT");
  }
  return {
    host: process.env.PGHOST,
    port,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  };
}

export async function transferPyroxeneSnapshot(
  snapshot,
  { client, clientFactory, statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS, closeClient = true } = {},
) {
  const rowsByTable = validateSnapshot(snapshot);
  const pgClient =
    client ??
    (clientFactory
      ? await clientFactory()
      : new (await import("pg")).Client(pgConfigFromEnvironment()));
  if (!pgClient) throw new Error("A PostgreSQL client or clientFactory is required");

  let operationError;
  try {
    if (!client && typeof pgClient.connect === "function") await pgClient.connect();
    await pgClient.query("BEGIN");
    await setImportTimeout(pgClient, statementTimeoutMs);

    for (const table of D1_CUTOVER_TABLES) await pgClient.query(createTypedStageStatement(table));
    for (const table of D1_CUTOVER_TABLES) {
      const rows = rowsByTable[table];
      for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
        const statement = buildInsertStatement(table, rows, offset, offset + INSERT_CHUNK_SIZE, stageTableName(table));
        if (statement) await pgClient.query(statement.text, statement.values);
      }
    }
    for (const table of D1_CUTOVER_TABLES) {
      await pgClient.query(`DELETE FROM ${quoteIdentifier(table)}`);
      await pgClient.query(insertTargetFromStageStatement(table));
    }
    for (const table of D1_CUTOVER_TABLES) {
      await repairIdentitySequence(pgClient, table);
    }
    for (const table of D1_CUTOVER_TABLES) {
      await assertRoundTripParity(pgClient, table, rowsByTable[table]);
      await assertSqlParity(pgClient, table, rowsByTable[table].length);
    }
    await pgClient.query("COMMIT");
    return { tables: D1_CUTOVER_TABLES.map((table) => ({ table, rows: rowsByTable[table].length })) };
  } catch (error) {
    operationError = error;
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // Preserve the original import/parity error when rollback also fails.
    }
    throw error;
  } finally {
    if (closeClient && typeof pgClient.end === "function") {
      try {
        await pgClient.end();
      } catch (error) {
        if (!operationError) throw error;
      }
    }
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
  const snapshotPath = optionValue(args, "--snapshot");
  const timeoutValue = optionValue(args, "--statement-timeout-ms");
  if (!snapshotPath) throw new Error("Usage: PGHOST=... PGDATABASE=... PGUSER=... PGPASSWORD=... d1-cutover-transfer.mjs --snapshot FILE");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const result = await transferPyroxeneSnapshot(snapshot, {
    statementTimeoutMs: timeoutValue === undefined ? DEFAULT_STATEMENT_TIMEOUT_MS : Number(timeoutValue),
  });
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
