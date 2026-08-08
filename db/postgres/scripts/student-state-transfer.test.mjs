import test from "node:test";
import assert from "node:assert/strict";
import {
  STUDENT_STATE_TABLES,
  buildInsertStatement,
  compareTableParity,
  transferStudentStateSnapshot,
} from "./student-state-transfer.mjs";

function snapshot() {
  return {
    format: "mollulog.student-state.snapshot.v1",
    tables: Object.fromEntries(
      STUDENT_STATE_TABLES.map((table) => [
        table,
        { rows: [{ id: 1, uid: `${table}-uid`, userId: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] },
      ]),
    ),
  };
}

function cloneRows(rows) {
  return new Map([...rows].map(([table, tableRows]) => [table, tableRows.map((row) => structuredClone(row))]));
}

function fakeClient({ mismatch = false, sequenceFailureTable } = {}) {
  let committedRows = new Map(STUDENT_STATE_TABLES.map((table) => [table, [{ id: 900, uid: `existing-${table}` }]]));
  let transactionRows;
  let inTransaction = false;
  const sequences = new Map(STUDENT_STATE_TABLES.map((table) => [table, { value: 900, isCalled: true }]));
  const calls = [];

  const client = {
    calls,
    sequences,
    get rows() {
      return committedRows;
    },
    async query(text, values = []) {
      calls.push({ text, values });
      if (text === "BEGIN") {
        assert.equal(inTransaction, false);
        transactionRows = cloneRows(committedRows);
        inTransaction = true;
        return { rows: [] };
      }
      if (text === "COMMIT") {
        assert.equal(inTransaction, true);
        committedRows = transactionRows;
        transactionRows = undefined;
        inTransaction = false;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        assert.equal(inTransaction, true);
        transactionRows = undefined;
        inTransaction = false;
        return { rows: [] };
      }
      if (text.startsWith("SELECT set_config")) {
        assert.equal(inTransaction, true);
        return { rows: [] };
      }
      const activeRows = transactionRows ?? committedRows;
      const deleteMatch = text.match(/^DELETE FROM "([^"]+)"/);
      if (deleteMatch) {
        assert.equal(inTransaction, true);
        activeRows.set(deleteMatch[1], []);
        return { rows: [] };
      }
      const insertMatch = text.match(/^INSERT INTO "([^"]+)" \(([^)]+)\) VALUES/);
      if (insertMatch) {
        assert.equal(inTransaction, true);
        const table = insertMatch[1];
        const columns = insertMatch[2].split(", ").map((column) => column.replaceAll('"', ""));
        const width = columns.length;
        const inserted = activeRows.get(table) ?? [];
        for (let index = 0; index < values.length; index += width) {
          inserted.push(Object.fromEntries(columns.map((column, offset) => [column, values[index + offset]])));
        }
        activeRows.set(table, inserted);
        return { rows: [] };
      }
      const selectMatch = text.match(/^SELECT \* FROM "([^"]+)" ORDER BY id/);
      if (selectMatch) {
        const table = selectMatch[1];
        const selected = activeRows.get(table) ?? [];
        if (mismatch && table === "recruited_students") return { rows: [] };
        return { rows: selected.map((row) => ({ ...row })) };
      }
      if (text.startsWith("SELECT setval")) {
        const table = text.match(/FROM "([^"]+)"/)?.[1];
        assert.ok(table);
        if (table === sequenceFailureTable) throw new Error(`sequence repair failed for ${table}`);
        const selected = activeRows.get(table) ?? [];
        const maxId = selected.reduce((max, row) => Math.max(max, Number(row.id)), 0);
        sequences.set(table, { value: maxId || 1, isCalled: maxId > 0 });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
  return client;
}

test("transfer is allowlisted, bounded, convergent and commits after parity", async () => {
  const client = fakeClient();
  const result = await transferStudentStateSnapshot(snapshot(), { client, closeClient: false });
  assert.equal(result.tables.length, 8);
  assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 1);
  assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 0);
  const commitIndex = client.calls.findIndex(({ text }) => text === "COMMIT");
  const sequenceIndexes = client.calls.flatMap(({ text }, index) => (text.startsWith("SELECT setval") ? [index] : []));
  assert.equal(sequenceIndexes.length, STUDENT_STATE_TABLES.length);
  assert.ok(sequenceIndexes.every((index) => index > commitIndex));
  for (const table of STUDENT_STATE_TABLES) assert.deepEqual(client.sequences.get(table), { value: 1, isCalled: true });
});

test("transfer rolls back on canonical parity mismatch", async () => {
  const client = fakeClient({ mismatch: true });
  const originalRows = cloneRows(client.rows);
  const originalSequences = new Map([...client.sequences].map(([table, sequence]) => [table, { ...sequence }]));
  await assert.rejects(() => transferStudentStateSnapshot(snapshot(), { client, closeClient: false }), /Parity mismatch/);
  assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
  assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
  assert.equal(client.calls.filter(({ text }) => text.startsWith("SELECT setval")).length, 0);
  assert.deepEqual(client.rows, originalRows);
  assert.deepEqual(client.sequences, originalSequences);
});

test("sequence repair failure is explicit after the data transaction commits", async () => {
  const client = fakeClient({ sequenceFailureTable: "student_growth" });
  await assert.rejects(
    () => transferStudentStateSnapshot(snapshot(), { client, closeClient: false }),
    (error) => {
      assert.match(error.message, /data replacement committed.*sequence repair failed/i);
      assert.equal(error.dataCommitted, true);
      return true;
    },
  );
  assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 1);
  assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 0);
  assert.deepEqual(client.sequences.get("recruited_students"), { value: 1, isCalled: true });
  assert.deepEqual(client.sequences.get("student_growth"), { value: 900, isCalled: true });
});

test("parity uses uid as unconditional identity, including nullable source_ref", () => {
  assert.doesNotThrow(() => compareTableParity("sync_drafts", [{ uid: "a", sourceRef: null }], [{ uid: "a", sourceRef: null }]));
  assert.throws(() => compareTableParity("sync_drafts", [{ uid: "a", sourceRef: null }], [{ uid: "b", sourceRef: null }]), /Parity mismatch/);
});

test("relationship items JSON text and jsonb object have equal canonical parity and insert as jsonb", () => {
  const source = [{ uid: "relationship-uid", items: '{"student-a":3}' }];
  const target = [{ uid: "relationship-uid", items: { "student-a": 3 } }];
  assert.doesNotThrow(() => compareTableParity("user_relationship_levels", source, target));

  const statement = buildInsertStatement("user_relationship_levels", source);
  assert.deepEqual(statement.values, ["relationship-uid", { "student-a": 3 }]);
});

test("relationship items rejects null, arrays, and non-object JSON", () => {
  for (const items of [null, "null", "[]", 3]) {
    assert.throws(
      () => buildInsertStatement("user_relationship_levels", [{ uid: "relationship-uid", items }]),
      /user_relationship_levels\.items must be a JSON object/,
    );
  }
});

test("D1 timezone-less timestamps are normalized to explicit UTC before insert", () => {
  const statement = buildInsertStatement("recruited_students", [
    {
      id: 1,
      uid: "student-uid",
      createdAt: "2026-01-01 00:00:00",
      updatedAt: "2026-01-01T00:00:00",
    },
  ]);
  assert.deepEqual(statement.values, [1, "student-uid", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]);

  const offsetStatement = buildInsertStatement("recruited_students", [
    { uid: "student-uid", createdAt: "2026-01-01T00:00:00+09:00" },
  ]);
  assert.deepEqual(offsetStatement.values, ["student-uid", "2025-12-31T15:00:00.000Z"]);
});

test("legacy D1 rows derive missing updatedAt from createdAt for deterministic parity", async () => {
  const imported = snapshot();
  for (const table of ["sync_draft_entries", "user_resource_inventory_draft_items"]) {
    delete imported.tables[table].rows[0].updatedAt;
  }

  const client = fakeClient();
  await transferStudentStateSnapshot(imported, { client, closeClient: false });

  for (const table of ["sync_draft_entries", "user_resource_inventory_draft_items"]) {
    const inserted = client.rows.get(table);
    assert.equal(inserted?.[0]?.created_at, inserted?.[0]?.updated_at);
  }
});

test("legacy updatedAt normalization stops when createdAt is missing", () => {
  assert.throws(
    () => buildInsertStatement("sync_draft_entries", [{ id: 1, uid: "entry-uid" }]),
    /missing createdAt required for updatedAt normalization/,
  );
});
