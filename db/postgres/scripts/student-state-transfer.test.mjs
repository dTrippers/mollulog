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

function fakeClient({ mismatch = false } = {}) {
  const rows = new Map();
  const calls = [];
  return {
    calls,
    async query(text, values = []) {
      calls.push({ text, values });
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK" || text.startsWith("SELECT set_config")) return { rows: [] };
      const deleteMatch = text.match(/^DELETE FROM "([^"]+)"/);
      if (deleteMatch) {
        rows.set(deleteMatch[1], []);
        return { rows: [] };
      }
      const insertMatch = text.match(/^INSERT INTO "([^"]+)" \(([^)]+)\) VALUES/);
      if (insertMatch) {
        const table = insertMatch[1];
        const columns = insertMatch[2].split(", ").map((column) => column.replaceAll('"', ""));
        const width = columns.length;
        const inserted = rows.get(table) ?? [];
        for (let index = 0; index < values.length; index += width) {
          inserted.push(Object.fromEntries(columns.map((column, offset) => [column, values[index + offset]])));
        }
        rows.set(table, inserted);
        return { rows: [] };
      }
      const selectMatch = text.match(/^SELECT \* FROM "([^"]+)" ORDER BY id/);
      if (selectMatch) {
        const table = selectMatch[1];
        const selected = rows.get(table) ?? [];
        if (mismatch && table === "recruited_students") return { rows: [] };
        return { rows: selected.map((row) => ({ ...row })) };
      }
      if (text.startsWith("SELECT setval")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
}

test("transfer is allowlisted, bounded, convergent and commits after parity", async () => {
  const client = fakeClient();
  const result = await transferStudentStateSnapshot(snapshot(), { client, closeClient: false });
  assert.equal(result.tables.length, 8);
  assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 1);
  assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 0);
});

test("transfer rolls back on canonical parity mismatch", async () => {
  const client = fakeClient({ mismatch: true });
  await assert.rejects(() => transferStudentStateSnapshot(snapshot(), { client, closeClient: false }), /Parity mismatch/);
  assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
  assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
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
