import test from "node:test";
import assert from "node:assert/strict";
import { STUDENT_STATE_TABLES, buildKeysetQuery, collectStudentStateSnapshot } from "./student-state-d1-collect.mjs";

test("collector uses the explicit allowlist and keyset query", async () => {
  assert.equal(buildKeysetQuery("recruited_students", 7, 500), 'SELECT * FROM "recruited_students" WHERE id > 7 ORDER BY id LIMIT 500');
  assert.throws(() => buildKeysetQuery("posts", 0, 500), /allowlisted/);
  assert.throws(() => buildKeysetQuery("recruited_students", 0, 501), /between 1 and 500/);
});

test("collector converges each table with id keyset pagination", async () => {
  const rowsByTable = Object.fromEntries(STUDENT_STATE_TABLES.map((table) => [table, [{ id: 1, uid: `${table}-1` }, { id: 700, uid: `${table}-2` }]]));
  const queries = [];
  const environments = [];
  const snapshot = await collectStudentStateSnapshot({
    database: "local",
    pageSize: 1,
    env: "production",
    execute: async ({ query, env }) => {
      queries.push(query);
      environments.push(env);
      const match = query.match(/FROM "([^"]+)" WHERE id > (\d+)/);
      const [, table, lastId] = match;
      return rowsByTable[table].filter((row) => row.id > Number(lastId)).slice(0, 1);
    },
  });
  assert.deepEqual(snapshot.tables.recruited_students.rows, rowsByTable.recruited_students);
  assert.equal(queries.length, STUDENT_STATE_TABLES.length * 3);
  assert.ok(queries.every((query) => query.includes("ORDER BY id LIMIT 1")));
  assert.ok(environments.every((env) => env === "production"));
});
