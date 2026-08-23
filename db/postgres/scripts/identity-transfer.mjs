#!/usr/bin/env node

import { readFile } from "node:fs/promises";

export const IDENTITY_TABLES = [
  "senseis",
  "auth_identities",
  "passkeys",
  "pending_sensei_registrations",
  "sensei_privacies",
  "followerships",
];
export const INSERT_CHUNK_SIZE = 500;

const TABLE_COLUMNS = {
  senseis: [
    "id",
    "uid",
    "username",
    "friendCode",
    "profileStudentId",
    "googleId",
    "githubId",
    "active",
    "bio",
    "role",
    "profileVisibility",
    "createdAt",
    "updatedAt",
  ],
  auth_identities: ["id", "senseiId", "provider", "providerUserId", "createdAt", "updatedAt"],
  passkeys: [
    "id",
    "uid",
    "userId",
    "memo",
    "keyId",
    "publicKey",
    "rawRequest",
    "counter",
    "createdAt",
    "updatedAt",
  ],
  pending_sensei_registrations: ["id", "uid", "provider", "providerUserId", "createdAt", "updatedAt"],
  sensei_privacies: ["id", "userId", "memberCode", "createdAt", "updatedAt"],
  followerships: ["id", "followerId", "followeeId", "createdAt", "updatedAt"],
};

function assertTable(table) {
  if (!IDENTITY_TABLES.includes(table)) throw new Error(`Table is not allowlisted: ${table}`);
}

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) throw new Error(`Invalid identifier: ${identifier}`);
  return `"${identifier}"`;
}

function camelToSnake(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function sourceValue(table, row, column) {
  const snakeColumn = camelToSnake(column);
  if (Object.hasOwn(row, column)) return row[column];
  if (Object.hasOwn(row, snakeColumn)) return row[snakeColumn];
  if (table === "senseis" && column === "role") return "guest";
  if (table === "senseis" && column === "profileVisibility") return "public";
  return null;
}

const TIMESTAMP_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?(?<timezone>Z|[+-]\d{2}(?::?\d{2})?)?(?![\s\S])/i;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function normalizeTimestamp(value, key) {
  const isTimestamp = key.endsWith("At") || key.endsWith("_at");
  if (!isTimestamp) return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) throw new Error(`Invalid timestamp for ${key}`);
    return value.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid timestamp for ${key}`);

  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match?.groups) throw new Error(`Invalid timestamp for ${key}: ${value}`);

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
    throw new Error(`Invalid timestamp for ${key}: ${value}`);
  }

  const fraction = match.groups.fraction ?? "";
  const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));
  const timezone = match.groups.timezone;
  let timezoneOffsetMinutes = 0;
  if (timezone && timezone.toUpperCase() !== "Z") {
    const offsetMatch = /^(?<sign>[+-])(?<hours>\d{2})(?::?(?<minutes>\d{2}))?$/.exec(timezone);
    if (!offsetMatch?.groups) throw new Error(`Invalid timestamp for ${key}: ${value}`);
    const offsetHours = Number(offsetMatch.groups.hours);
    const offsetMinutes = Number(offsetMatch.groups.minutes ?? "0");
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error(`Invalid timestamp for ${key}: ${value}`);
    timezoneOffsetMinutes = (offsetHours * 60 + offsetMinutes) * (offsetMatch.groups.sign === "+" ? 1 : -1);
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  date.setTime(date.getTime() - timezoneOffsetMinutes * 60 * 1000);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid timestamp for ${key}: ${value}`);
  return date.toISOString();
}

function normalizeValue(table, column, value) {
  const integerColumns = ["id", "senseiId", "userId", "followerId", "followeeId", "counter"];
  if (value == null) {
    if (column === "active" || integerColumns.includes(column) || column.endsWith("At") || column.endsWith("_at")) {
      throw new Error(`Invalid null value for ${table}.${column}`);
    }
    return null;
  }
  if (table === "senseis" && column === "active") {
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
    if (typeof value === "string" && (value === "0" || value.toLowerCase() === "false")) return false;
    if (typeof value === "string" && (value === "1" || value.toLowerCase() === "true")) return true;
    throw new Error(`Invalid boolean for ${table}.${column}`);
  }
  if (integerColumns.includes(column)) {
    if (typeof value === "boolean" || (typeof value === "string" && !/^-?\d+$/.test(value))) {
      throw new Error(`Invalid integer for ${table}.${column}`);
    }
    const number = Number(value);
    const minimum = column === "counter" ? 0 : 1;
    if (Number.isSafeInteger(number) && number >= minimum) return number;
    throw new Error(`Invalid integer for ${table}.${column}`);
  }
  if (typeof value === "object" && Buffer.isBuffer(value)) return value.toString("utf8");
  return normalizeTimestamp(value, column);
}

export function canonicalRow(row, table) {
  assertTable(table);
  const canonical = {};
  for (const column of TABLE_COLUMNS[table]) {
    canonical[column] = normalizeValue(table, column, sourceValue(table, row, column));
  }
  return JSON.stringify(canonical);
}

export function canonicalIdentity(row, table) {
  assertTable(table);
  const id = normalizeValue(table, "id", sourceValue(table, row, "id"));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Snapshot rows must have an id for ${table}`);
  return String(id);
}

export function parseSnapshotTable(snapshot, table) {
  assertTable(table);
  const value = snapshot?.tables?.[table];
  if (!value || !Array.isArray(value.rows)) throw new Error(`Snapshot is missing ${table}`);
  const identities = new Set();
  for (const row of value.rows) {
    const identity = canonicalIdentity(row, table);
    if (identities.has(identity)) throw new Error(`Duplicate id in ${table}: ${identity}`);
    identities.add(identity);
    canonicalRow(row, table);
  }
  return value.rows;
}

function toPgRow(table, row) {
  return TABLE_COLUMNS[table].map((column) => sourceValue(table, row, column));
}

function stageTableName(table) {
  assertTable(table);
  return `identity_stage_${table}`;
}

function typedColumnList(table) {
  assertTable(table);
  return TABLE_COLUMNS[table].map((column) => quoteIdentifier(camelToSnake(column))).join(", ");
}

function createTypedStageStatement(table) {
  const stage = quoteIdentifier(stageTableName(table));
  const target = quoteIdentifier(table);
  return `CREATE TEMP TABLE ${stage} ON COMMIT DROP AS SELECT ${typedColumnList(table)} FROM ${target} WITH NO DATA`;
}

function parityDifferenceStatement(table, direction) {
  assertTable(table);
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
  const count = Number(result.rows?.[0]?.count ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("PostgreSQL parity count was invalid");
  return count;
}

async function assertSqlParity(client, table, sourceCount) {
  const targetCount = await readCount(client, `SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(table)}`);
  if (sourceCount !== targetCount) {
    throw new Error(`Parity mismatch for ${table}: count ${sourceCount}/${targetCount}`);
  }

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

export function buildInsertStatement(table, rows, start = 0, end = rows.length, targetTable = table) {
  assertTable(table);
  const quotedTargetTable = quoteIdentifier(targetTable);
  const chunk = rows.slice(start, end);
  if (chunk.length === 0) return null;
  const columns = TABLE_COLUMNS[table];
  const values = [];
  const placeholders = chunk.map((row, rowIndex) => {
    const rowValues = toPgRow(table, row).map((value, columnIndex) =>
      normalizeValue(table, columns[columnIndex], value),
    );
    values.push(...rowValues);
    return `(${rowValues.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`;
  });
  return {
    text: `INSERT INTO ${quotedTargetTable} (${columns.map((column) => quoteIdentifier(camelToSnake(column))).join(", ")}) VALUES ${placeholders.join(", ")}`,
    values,
  };
}

export function compareTableParity(table, sourceRows, targetRows) {
  assertTable(table);
  for (const [label, rows] of [["source", sourceRows], ["target", targetRows]]) {
    const identities = new Set();
    for (const row of rows) {
      const identity = canonicalIdentity(row, table);
      if (identities.has(identity)) throw new Error(`Duplicate id in ${table} ${label}: ${identity}`);
      identities.add(identity);
    }
  }
  const sourceByKey = new Map(sourceRows.map((row) => [canonicalIdentity(row, table), canonicalRow(row, table)]));
  const targetByKey = new Map(targetRows.map((row) => [canonicalIdentity(row, table), canonicalRow(row, table)]));
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

async function setImportTimeout(client, statementTimeoutMs) {
  if (!Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs <= 0) throw new Error("Invalid import timeout");
  await client.query("SELECT set_config('statement_timeout', $1, true)", [`${statementTimeoutMs}ms`]);
}

export async function transferIdentitySnapshot(
  snapshot,
  { client, clientFactory, targetUrl, statementTimeoutMs = 10 * 60 * 1000, closeClient = true } = {},
) {
  if (!snapshot || snapshot.format !== "mollulog.identity.snapshot.v1") throw new Error("Unsupported snapshot format");
  const snapshotTables = Object.keys(snapshot.tables ?? {});
  const disallowed = snapshotTables.filter((table) => !IDENTITY_TABLES.includes(table));
  if (disallowed.length > 0) throw new Error(`Snapshot contains non-allowlisted tables: ${disallowed.join(",")}`);
  const rowsByTable = Object.fromEntries(IDENTITY_TABLES.map((table) => [table, parseSnapshotTable(snapshot, table)]));
  const pgClient =
    client ?? (clientFactory ? await clientFactory(targetUrl) : new (await import("pg")).Client({ connectionString: targetUrl }));
  if (!pgClient) throw new Error("A PostgreSQL client or TARGET_PG_URL is required");
  if (!client && typeof pgClient.connect === "function") await pgClient.connect();
  try {
    await pgClient.query("BEGIN");
    await setImportTimeout(pgClient, statementTimeoutMs);
    for (const table of IDENTITY_TABLES) {
      const rows = rowsByTable[table];
      await pgClient.query(createTypedStageStatement(table));
      for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
        const statement = buildInsertStatement(table, rows, offset, offset + INSERT_CHUNK_SIZE, stageTableName(table));
        if (statement) await pgClient.query(statement.text, statement.values);
      }
      await pgClient.query(`DELETE FROM ${quoteIdentifier(table)}`);
      await pgClient.query(insertTargetFromStageStatement(table));
      await pgClient.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${quoteIdentifier(table)}`,
        [table],
      );
    }

    for (const table of IDENTITY_TABLES) {
      const sourceRows = rowsByTable[table];
      await assertRoundTripParity(pgClient, table, sourceRows);
      await assertSqlParity(pgClient, table, sourceRows.length);
    }
    await pgClient.query("COMMIT");
    return { tables: IDENTITY_TABLES.map((table) => ({ table, rows: rowsByTable[table].length })) };
  } catch (error) {
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // Preserve the original parity/import error.
    }
    throw error;
  } finally {
    if (closeClient && typeof pgClient.end === "function") await pgClient.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const snapshotPath = value("--snapshot");
  const targetUrl = process.env.TARGET_PG_URL;
  const pgConfig = targetUrl
    ? { connectionString: targetUrl }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      };
  const hasSeparatePgConfig =
    Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD);
  if (!snapshotPath || (!targetUrl && !hasSeparatePgConfig)) {
    throw new Error(
      "Usage: TARGET_PG_URL=... identity-transfer.mjs --snapshot FILE or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD with --snapshot FILE",
    );
  }
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  await transferIdentitySnapshot(snapshot, {
    clientFactory: async () => new (await import("pg")).Client(pgConfig),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
