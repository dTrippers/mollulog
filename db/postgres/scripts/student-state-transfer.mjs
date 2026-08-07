#!/usr/bin/env node

import { readFile } from "node:fs/promises";

export const STUDENT_STATE_TABLES = [
  "recruited_students",
  "student_growth",
  "user_relationship_levels",
  "growth_resource_inventory",
  "sync_drafts",
  "sync_draft_entries",
  "user_resource_inventory_drafts",
  "user_resource_inventory_draft_items",
];
export const INSERT_CHUNK_SIZE = 500;

function assertTable(table) {
  if (!STUDENT_STATE_TABLES.includes(table)) throw new Error(`Table is not allowlisted: ${table}`);
}

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) throw new Error(`Invalid identifier: ${identifier}`);
  return `"${identifier}"`;
}

function camelToSnake(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(value) {
  return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeTableValue(table, column, value) {
  if (table !== "user_relationship_levels" || column !== "items") return value;
  let normalized = value;
  if (typeof value === "string") {
    try {
      normalized = JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid JSON in ${table}.${column}`, { cause: error });
    }
  }
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error(`${table}.${column} must be a JSON object`);
  }
  return normalized;
}

function normalizeValue(value, key = "") {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && (key.endsWith("At") || key.endsWith("_at"))) {
    const candidate = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const date = new Date(candidate);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  if (value && typeof value === "object" && Buffer.isBuffer(value)) return value.toString("utf8");
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([childKey, item]) => [childKey, normalizeValue(item, childKey)]),
    );
  }
  return value;
}

export function canonicalRow(row, table) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(row)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, normalizeValue(normalizeTableValue(table, key, value), key)]),
    ),
  );
}

export function canonicalIdentity(row) {
  if (row?.uid == null) throw new Error("Snapshot rows must have unconditional uid identity");
  return String(row.uid);
}

function parseSnapshotTable(snapshot, table) {
  assertTable(table);
  const value = snapshot?.tables?.[table];
  if (!value || !Array.isArray(value.rows)) throw new Error(`Snapshot is missing ${table}`);
  const rows = value.rows;
  const identities = new Set();
  for (const row of rows) {
    const identity = canonicalIdentity(row);
    if (identities.has(identity)) throw new Error(`Duplicate uid in ${table}: ${identity}`);
    identities.add(identity);
  }
  return rows;
}

function tableColumns(rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  for (const column of columns) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) throw new Error(`Invalid snapshot column: ${column}`);
  }
  return columns;
}

function toPgRow(table, row, columns) {
  return columns.map((column) => normalizeTableValue(table, column, row[column]) ?? null);
}

export function buildInsertStatement(table, rows, start = 0, end = rows.length) {
  assertTable(table);
  const chunk = rows.slice(start, end);
  if (chunk.length === 0) return null;
  const sourceColumns = tableColumns(chunk);
  const columns = sourceColumns.map(camelToSnake);
  const values = [];
  const placeholders = chunk.map((row, rowIndex) => {
    const rowValues = toPgRow(table, row, sourceColumns);
    values.push(...rowValues);
    return `(${rowValues.map((_, columnIndex) => `$${rowIndex * sourceColumns.length + columnIndex + 1}`).join(", ")})`;
  });
  return {
    text: `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES ${placeholders.join(", ")}`,
    values,
  };
}

function rowFromPg(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [snakeToCamel(key), value]));
}

export function compareTableParity(table, sourceRows, targetRows) {
  assertTable(table);
  const sourceByKey = new Map(sourceRows.map((row) => [canonicalIdentity(row), canonicalRow(row, table)]));
  const targetByKey = new Map(targetRows.map((row) => [canonicalIdentity(row), canonicalRow(row, table)]));
  const missing = [...sourceByKey.keys()].filter((key) => !targetByKey.has(key));
  const extra = [...targetByKey.keys()].filter((key) => !sourceByKey.has(key));
  const mismatched = [...sourceByKey.keys()].filter((key) => targetByKey.has(key) && sourceByKey.get(key) !== targetByKey.get(key));
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

export async function transferStudentStateSnapshot(
  snapshot,
  { client, clientFactory, targetUrl, statementTimeoutMs = 10 * 60 * 1000, closeClient = true } = {},
) {
  if (!snapshot || snapshot.format !== "mollulog.student-state.snapshot.v1") throw new Error("Unsupported snapshot format");
  const snapshotTables = Object.keys(snapshot.tables ?? {});
  const disallowed = snapshotTables.filter((table) => !STUDENT_STATE_TABLES.includes(table));
  if (disallowed.length > 0) throw new Error(`Snapshot contains non-allowlisted tables: ${disallowed.join(",")}`);
  const pgClient = client ?? (clientFactory ? await clientFactory(targetUrl) : new (await import("pg")).Client({ connectionString: targetUrl }));
  if (!pgClient) throw new Error("A PostgreSQL client or TARGET_PG_URL is required");
  if (!client && typeof pgClient.connect === "function") await pgClient.connect();
  try {
    await pgClient.query("BEGIN");
    await setImportTimeout(pgClient, statementTimeoutMs);
    for (const table of STUDENT_STATE_TABLES) {
      const rows = parseSnapshotTable(snapshot, table);
      await pgClient.query(`DELETE FROM ${quoteIdentifier(table)}`);
      for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
        const statement = buildInsertStatement(table, rows, offset, offset + INSERT_CHUNK_SIZE);
        if (statement) await pgClient.query(statement.text, statement.values);
      }
      await pgClient.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${quoteIdentifier(table)}`,
        [table],
      );
    }

    for (const table of STUDENT_STATE_TABLES) {
      const sourceRows = parseSnapshotTable(snapshot, table);
      const result = await pgClient.query(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY id`);
      compareTableParity(table, sourceRows, result.rows.map(rowFromPg));
    }
    await pgClient.query("COMMIT");
    return { tables: STUDENT_STATE_TABLES.map((table) => ({ table, rows: parseSnapshotTable(snapshot, table).length })) };
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
  if (!snapshotPath || !targetUrl) throw new Error("Usage: TARGET_PG_URL=... student-state-transfer.mjs --snapshot FILE");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  await transferStudentStateSnapshot(snapshot, { targetUrl });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
