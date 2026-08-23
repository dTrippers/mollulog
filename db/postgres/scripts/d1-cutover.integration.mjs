import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const requiredEnvironment = [
  "D1_CUTOVER_TEST_PGHOST",
  "D1_CUTOVER_TEST_PGPORT",
  "D1_CUTOVER_TEST_PGDATABASE",
  "D1_CUTOVER_TEST_PGUSER",
  "D1_CUTOVER_TEST_PGPASSWORD",
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

const tables = [
  "pickup_histories",
  "event_shop_states",
  "pyroxene_owned_resources",
  "pyroxene_collected_sources",
  "pyroxene_timeline_items",
  "pyroxene_planner_options",
  "pyroxene_event_data",
  "pyroxene_guest_import_items",
  "connect_api_keys",
  "connect_request_logs",
];

const migrations = [
  "db/postgres/migrations/20260823000200_create_pyroxene_planner.sql",
  "db/postgres/migrations/20260824000100_create_pickup_histories.sql",
  "db/postgres/migrations/20260824000200_create_event_shop_states.sql",
  "db/postgres/migrations/20260824000300_create_mollu_connect_auth_logs.sql",
];

const timestamp = "2026-08-23 00:00:00+00";

function rowFor(table, id) {
  switch (table) {
    case "pickup_histories":
      return {
        id,
        uid: `pickup-${id}`,
        userId: 1,
        eventId: "event-1",
        result: JSON.stringify([{ trial: 10, tier3Count: 1, tier3StudentIds: ["student-1"] }]),
        rawResult: "raw pickup",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "event_shop_states":
      return {
        id,
        uid: `shop-${id}`,
        userId: 1,
        eventUid: "event-1",
        itemQuantities: JSON.stringify({ item: 2 }),
        itemPurchaseDays: JSON.stringify({ item: 1 }),
        selectedBonusStudentUids: JSON.stringify(["student-1"]),
        bonusStudentSelectionMode: "shared",
        selectedBonusStudentUidsByItem: JSON.stringify({ item: ["student-1"] }),
        enabledStages: JSON.stringify({ stage: true }),
        includeRecruitedStudents: 1,
        existingPaymentItemQuantities: JSON.stringify({ payment: 3 }),
        includeFirstClear: 0,
        extraStageRuns: JSON.stringify({ stage: 1 }),
        minigameStartRound: 2,
        minigamePlayCount: 3,
        minigamePaymentQuantityMode: "expected",
        overriddenRequiredQuantities: JSON.stringify({ item: 4 }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "pyroxene_owned_resources":
      return {
        id,
        uid: `owned-${id}`,
        userId: 1,
        inputAt: timestamp,
        pyroxene: 100,
        oneTimeTicket: 2,
        tenTimeTicket: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "pyroxene_collected_sources":
      return { id, uid: `collected-${id}`, userId: 1, sourceKey: `source-${id}`, collectedAt: timestamp, createdAt: timestamp };
    case "pyroxene_timeline_items":
      return {
        id,
        uid: `timeline-${id}`,
        userId: 1,
        eventAt: timestamp,
        source: "test",
        repeatType: "daily",
        repeatIntervalDays: 1,
        repeatCount: 2,
        autoRepurchase: 1,
        description: "description",
        pyroxeneDelta: 10,
        oneTimeTicketDelta: 1,
        tenTimeTicketDelta: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "pyroxene_planner_options":
      return { id, userId: 1, options: "{\"days\":7}", createdAt: timestamp, updatedAt: timestamp };
    case "pyroxene_event_data":
      return {
        id,
        uid: `event-data-${id}`,
        userId: 1,
        eventUid: `event-${id}`,
        completed: 1,
        expectedTrials: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    case "pyroxene_guest_import_items":
      return { id, userId: 1, datasetId: "dataset-1", itemType: "material", itemKey: "type\u0000key", importedAt: timestamp };
    case "connect_api_keys":
      return {
        id,
        uid: `key-${id}`,
        userId: 1,
        name: "Integration key",
        keyPrefix: "mlk_test",
        keyHash: "hash-test",
        scopes: "[\"catalog:read\",\"draft:write\"]",
        createdAt: timestamp,
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      };
    case "connect_request_logs":
      return { id, uid: `log-${id}`, apiKeyUid: "key-1", endpoint: "/api/v1/drafts", status: 200, createdAt: timestamp };
    default:
      throw new Error(`Unknown table ${table}`);
  }
}

function buildSnapshot({ pickupId = 100, includeEventShop = true } = {}) {
  const rowsByTable = Object.fromEntries(
    tables.map((table) => {
      const rows = table === "event_shop_states" && !includeEventShop ? [] : [rowFor(table, table === "pickup_histories" ? pickupId : 1)];
      return [table, { rows, rowCount: rows.length, lastId: rows.at(-1)?.id ?? 0 }];
    }),
  );
  return {
    format: "mollulog.d1.snapshot.v1",
    pageSize: 500,
    generatedAt: "2026-08-23T00:00:00.000Z",
    tables: rowsByTable,
  };
}

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) throw new Error(`Unsafe test identifier: ${identifier}`);
  return `"${identifier}"`;
}

async function migrate(client) {
  for (const path of migrations) await client.query(await readFile(path, "utf8"));
}

async function sequenceState(client, table) {
  const result = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name", [table]);
  const name = result.rows[0]?.sequence_name;
  assert.equal(typeof name, "string");
  const quoted = name.split(".").map(quoteIdentifier).join(".");
  const sequence = await client.query(`SELECT last_value::bigint AS last_value, is_called FROM ${quoted}`);
  return sequence.rows[0];
}

async function state(client) {
  const result = {};
  for (const table of tables) {
    const rows = await client.query(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY id`);
    result[table] = { rows: rows.rows, sequence: await sequenceState(client, table) };
  }
  return JSON.parse(JSON.stringify(result));
}

const integrationTest = missingEnvironment.length === 0 ? test : test.skip;

integrationTest("imports all ten tables against disposable PostgreSQL and rolls rows plus identities back on parity failure", async () => {
  const host = process.env.D1_CUTOVER_TEST_PGHOST;
  const database = process.env.D1_CUTOVER_TEST_PGDATABASE;
  if (process.env.D1_CUTOVER_TEST_CONFIRM !== "local-disposable") {
    throw new Error("Set D1_CUTOVER_TEST_CONFIRM=local-disposable; this test must never target production PostgreSQL");
  }
  if (!host || !database || !["127.0.0.1", "localhost", "::1"].includes(host) || !database.startsWith("test_")) {
    throw new Error("D1 cutover integration requires a loopback host and a test_ database");
  }

  const { Client } = await import("pg");
  const { transferD1CutoverSnapshot } = await import("./d1-cutover-transfer.mjs");
  const client = new Client({
    host,
    port: Number(process.env.D1_CUTOVER_TEST_PGPORT),
    database,
    user: process.env.D1_CUTOVER_TEST_PGUSER,
    password: process.env.D1_CUTOVER_TEST_PGPASSWORD,
  });
  const schema = `cutover_test_${process.pid}_${Date.now()}`;

  try {
    await client.connect();
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
    await migrate(client);

    const source = buildSnapshot({ pickupId: 2_000_000_000, includeEventShop: false });
    await transferD1CutoverSnapshot(source, { client, closeClient: false });
    const afterImport = await state(client);
    assert.equal(afterImport.pickup_histories.rows[0].id, 2_000_000_000);
    assert.deepEqual(afterImport.pickup_histories.rows[0].result, [{ trial: 10, tier3Count: 1, tier3StudentIds: ["student-1"] }]);
    assert.equal(afterImport.event_shop_states.rows.length, 0);
    assert.equal(afterImport.event_shop_states.sequence.last_value, "1");
    assert.equal(afterImport.pyroxene_guest_import_items.rows[0].item_key, "v1:dHlwZQBrZXk");
    assert.deepEqual(afterImport.connect_api_keys.rows[0].scopes, ["catalog:read", "draft:write"]);
    assert.equal(afterImport.event_shop_states.sequence.is_called, false);

    await client.query(`CREATE OR REPLACE FUNCTION ${quoteIdentifier("d1_cutover_test_parity")}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('d1_test.parity', true) = 'on' AND TG_TABLE_NAME = 'connect_request_logs' THEN
          UPDATE connect_request_logs SET status = status + 1 WHERE id = NEW.id;
        END IF;
        RETURN NEW;
      END;
    $$`);
    await client.query(`CREATE TRIGGER ${quoteIdentifier("d1_cutover_test_parity_trigger")} AFTER INSERT ON connect_request_logs FOR EACH ROW EXECUTE FUNCTION ${quoteIdentifier("d1_cutover_test_parity")}()`);
    const beforeFailure = await state(client);
    await client.query("SET d1_test.parity = 'on'");
    await assert.rejects(
      transferD1CutoverSnapshot(buildSnapshot({ pickupId: 2_000_000_001, includeEventShop: true }), { client, closeClient: false }),
      /Parity mismatch/,
    );
    await client.query("SET d1_test.parity = 'off'");
    assert.deepEqual(await state(client), beforeFailure);
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The importer owns transaction rollback; cleanup remains best-effort.
    }
    try {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    } finally {
      await client.end();
    }
  }
});
