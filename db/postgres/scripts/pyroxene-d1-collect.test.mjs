const runningUnderJest = Boolean(process.env.JEST_WORKER_ID);

const tables = [
  "pyroxene_owned_resources",
  "pyroxene_collected_sources",
  "pyroxene_timeline_items",
  "pyroxene_planner_options",
  "pyroxene_event_data",
  "pyroxene_guest_import_items",
];

function rowFor(table, id) {
  const timestamp = "2026-08-23 00:00:00";
  switch (table) {
    case "pyroxene_owned_resources":
      return {
        id,
        uid: `owned-${id}`,
        userId: id,
        inputAt: timestamp,
        pyroxene: 100 + id,
        oneTimeTicket: 1,
        tenTimeTicket: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "pyroxene_collected_sources":
      return { id, uid: `collected-${id}`, userId: id, sourceKey: `source-${id}`, collectedAt: timestamp, createdAt: timestamp };
    case "pyroxene_timeline_items":
      return {
        id,
        uid: `timeline-${id}`,
        userId: id,
        eventAt: timestamp,
        source: "test",
        repeatType: id % 2 === 0 ? null : "daily",
        repeatIntervalDays: id % 2 === 0 ? null : 1,
        repeatCount: id % 2 === 0 ? null : 2,
        autoRepurchase: id % 2,
        description: `description-${id}`,
        pyroxeneDelta: 10,
        oneTimeTicketDelta: 1,
        tenTimeTicketDelta: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "pyroxene_planner_options":
      return { id, userId: id, options: `{"days":${id}}`, createdAt: timestamp, updatedAt: timestamp };
    case "pyroxene_event_data":
      return {
        id,
        uid: `event-${id}`,
        userId: id,
        eventUid: `event-uid-${id}`,
        completed: id % 2,
        expectedTrials: id % 2 === 0 ? null : 3,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "pyroxene_guest_import_items":
      return { id, userId: id, datasetId: `dataset-${id}`, itemType: "material", itemKey: id === 1 ? "type\u0000key" : `key-${id}`, importedAt: timestamp };
    default:
      throw new Error(`Unknown test table ${table}`);
  }
}

if (!runningUnderJest) {
  const { test } = process.getBuiltinModule("node:test");
  const assert = process.getBuiltinModule("node:assert/strict");

  test("builds an allowlisted id keyset query capped at 500 rows", async () => {
    const { buildKeysetQuery } = await import("./pyroxene-d1-collect.mjs");
    assert.equal(
      buildKeysetQuery("pyroxene_guest_import_items", 12, 500),
      'SELECT * FROM "pyroxene_guest_import_items" WHERE id > 12 ORDER BY id LIMIT 500',
    );
    assert.throws(() => buildKeysetQuery("users"), /allowlisted/);
    assert.throws(() => buildKeysetQuery("pyroxene_owned_resources", 0, 501), /between 1 and 500/);
    assert.throws(() => buildKeysetQuery("pyroxene_owned_resources", -1), /non-negative/);
  });

  test("parses the supported wrangler JSON result shapes", async () => {
    const { parseWranglerJson } = await import("./pyroxene-d1-collect.mjs");
    const row = { id: 1, itemKey: "type\u0000key" };
    assert.deepEqual(parseWranglerJson(JSON.stringify({ results: [row] })), [row]);
    assert.deepEqual(parseWranglerJson({ result: [row] }), [row]);
    assert.deepEqual(parseWranglerJson({ result: { results: [row] } }), [row]);
    assert.deepEqual(parseWranglerJson([row]), [row]);
    assert.throws(() => parseWranglerJson({ success: true }), /results array/);
  });

  test("collects successive keyset pages for every allowlisted table", async () => {
    const { collectPyroxeneSnapshot } = await import("./pyroxene-d1-collect.mjs");
    const calls = [];
    const snapshot = await collectPyroxeneSnapshot({
      database: "mollulog",
      pageSize: 2,
      accountId: "account",
      env: "production",
      execute: async ({ database, query, accountId, env }) => {
        calls.push({ database, query, accountId, env });
        const table = tables.find((candidate) => query.includes(`"${candidate}"`));
        const lastId = Number(query.match(/id > (\d+)/)?.[1] ?? 0);
        const ids = lastId === 0 ? [1, 2] : [3];
        return { results: ids.map((id) => rowFor(table, id)) };
      },
    });

    assert.equal(snapshot.format, "mollulog.pyroxene.snapshot.v1");
    assert.equal(snapshot.pageSize, 2);
    assert.match(snapshot.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(calls.length, tables.length * 2);
    assert.ok(calls.every(({ database, accountId, env, query }) => database === "mollulog" && accountId === "account" && env === "production" && query.includes("ORDER BY id")));
    for (const table of tables) {
      assert.deepEqual(snapshot.tables[table].rows.map(({ id }) => id), [1, 2, 3]);
      assert.equal(snapshot.tables[table].lastId, 3);
      assert.equal(snapshot.tables[table].rowCount, 3);
    }
    assert.equal(snapshot.tables.pyroxene_guest_import_items.rows[0].itemKey, "type\u0000key");
  });

  test("rejects duplicate physical uniqueness keys and disallowed tables", async () => {
    const { validateTableRows, validateSnapshotTables } = await import("./pyroxene-d1-collect.mjs");
    const duplicateUid = [rowFor("pyroxene_owned_resources", 1), { ...rowFor("pyroxene_owned_resources", 2), uid: "owned-1" }];
    assert.throws(() => validateTableRows("pyroxene_owned_resources", duplicateUid), /Duplicate unique key/);

    const duplicateGuest = [rowFor("pyroxene_guest_import_items", 1), { ...rowFor("pyroxene_guest_import_items", 2), userId: 1, datasetId: "dataset-1", itemKey: "type\u0000key" }];
    assert.throws(() => validateTableRows("pyroxene_guest_import_items", duplicateGuest), /Duplicate unique key/);
    assert.throws(() => validateSnapshotTables({ ...Object.fromEntries(tables.map((table) => [table, {}])), users: {} }), /non-allowlisted/);
    assert.throws(() => validateSnapshotTables({ pyroxene_owned_resources: {} }), /missing/);
  });

  test("rejects malformed rows while preserving NUL-bearing values", async () => {
    const { validateRawRow } = await import("./pyroxene-d1-collect.mjs");
    const row = rowFor("pyroxene_guest_import_items", 1);
    assert.equal(validateRawRow("pyroxene_guest_import_items", row).itemKey, "type\u0000key");
    assert.throws(() => validateRawRow("pyroxene_guest_import_items", { ...row, autoRepurchase: 0 }), /Unknown columns/);
    assert.throws(() => validateRawRow("pyroxene_guest_import_items", { ...row, userId: 0 }), /userId/);
    assert.throws(() => validateRawRow("pyroxene_guest_import_items", { ...row, importedAt: "not-a-timestamp" }), /timestamp/);
  });

  test("writes snapshots with mode 0600 and refuses overwrite", async () => {
    const { mkdtemp, open, rm, stat } = process.getBuiltinModule("node:fs/promises");
    const { join } = process.getBuiltinModule("node:path");
    const { tmpdir } = process.getBuiltinModule("node:os");
    const { writePyroxeneSnapshot } = await import("./pyroxene-d1-collect.mjs");
    const directory = await mkdtemp(join(tmpdir(), "mollulog-pyroxene-"));
    const output = join(directory, "snapshot.json");
    const rawItemKey = "type\u0000key";
    const snapshotTables = Object.fromEntries(tables.map((table) => [table, { rows: [], rowCount: 0, lastId: 0 }]));
    snapshotTables.pyroxene_guest_import_items = {
      rows: [{ ...rowFor("pyroxene_guest_import_items", 1), itemKey: rawItemKey }],
      rowCount: 1,
      lastId: 1,
    };
    const snapshot = {
      format: "mollulog.pyroxene.snapshot.v1",
      pageSize: 500,
      generatedAt: "2026-08-23T00:00:00.000Z",
      tables: snapshotTables,
    };
    try {
      await writePyroxeneSnapshot(output, snapshot);
      assert.equal((await stat(output)).mode & 0o777, 0o600);
      const handle = await open(output, "r");
      const parsed = JSON.parse(await handle.readFile("utf8"));
      assert.equal(parsed.tables.pyroxene_guest_import_items.rows[0].itemKey, rawItemKey);
      await handle.close();
      await assert.rejects(writePyroxeneSnapshot(output, snapshot), { code: "EEXIST" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
} else {
  test("pyroxene collector contracts run with node:test", () => {});
}
