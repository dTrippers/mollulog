const runningUnderJest = Boolean(process.env.JEST_WORKER_ID);

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

const booleanColumns = new Set(["autoRepurchase", "completed", "includeRecruitedStudents", "includeFirstClear"]);
const timestampColumns = new Set([
  "inputAt",
  "collectedAt",
  "eventAt",
  "createdAt",
  "updatedAt",
  "importedAt",
  "expiresAt",
  "lastUsedAt",
  "revokedAt",
]);
const jsonColumns = new Set([
  "result",
  "itemQuantities",
  "itemPurchaseDays",
  "selectedBonusStudentUids",
  "selectedBonusStudentUidsByItem",
  "enabledStages",
  "existingPaymentItemQuantities",
  "extraStageRuns",
  "overriddenRequiredQuantities",
  "scopes",
]);

function rowFor(table, id, overrides = {}) {
  const timestamp = "2026-08-23 00:00:00";
  const rows = {
    pickup_histories: {
      id,
      uid: `pickup-${id}`,
      userId: id,
      eventId: `event-${id}`,
      result: JSON.stringify([{ trial: 10, tier3Count: 1, tier3StudentIds: [`student-${id}`] }]),
      rawResult: id % 2 === 0 ? null : `raw-${id}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    event_shop_states: {
      id,
      uid: `shop-${id}`,
      userId: id,
      eventUid: `event-${id}`,
      itemQuantities: JSON.stringify({ item: id }),
      itemPurchaseDays: JSON.stringify({ item: id % 3 }),
      selectedBonusStudentUids: JSON.stringify([`student-${id}`]),
      bonusStudentSelectionMode: "shared",
      selectedBonusStudentUidsByItem: JSON.stringify({ item: [`student-${id}`] }),
      enabledStages: JSON.stringify({ stage: true }),
      includeRecruitedStudents: id % 2,
      existingPaymentItemQuantities: JSON.stringify({ payment: 1 }),
      includeFirstClear: (id + 1) % 2,
      extraStageRuns: JSON.stringify({ stage: id }),
      minigameStartRound: 1,
      minigamePlayCount: id,
      minigamePaymentQuantityMode: "expected",
      overriddenRequiredQuantities: JSON.stringify({ item: id }),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    pyroxene_owned_resources: {
      id,
      uid: `owned-${id}`,
      userId: id,
      inputAt: timestamp,
      pyroxene: 100 + id,
      oneTimeTicket: 1,
      tenTimeTicket: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    pyroxene_collected_sources: {
      id,
      uid: `collected-${id}`,
      userId: id,
      sourceKey: `source-${id}`,
      collectedAt: timestamp,
      createdAt: timestamp,
    },
    pyroxene_timeline_items: {
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
    },
    pyroxene_planner_options: {
      id,
      userId: id,
      options: `{"days":${id}}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    pyroxene_event_data: {
      id,
      uid: `event-${id}`,
      userId: id,
      eventUid: `event-uid-${id}`,
      completed: id % 2,
      expectedTrials: id % 2 === 0 ? null : 3,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    pyroxene_guest_import_items: {
      id,
      userId: id,
      datasetId: `dataset-${id}`,
      itemType: "material",
      itemKey: id === 1 ? "type\u0000key" : `key-${id}`,
      importedAt: timestamp,
    },
    connect_api_keys: {
      id,
      uid: `key-${id}`,
      userId: id,
      name: `Key ${id}`,
      keyPrefix: `mlk_${id}`,
      keyHash: `hash-${id}`,
      scopes: "[\"catalog:read\"]",
      createdAt: timestamp,
      expiresAt: id % 2 === 0 ? null : timestamp,
      lastUsedAt: null,
      revokedAt: null,
    },
    connect_request_logs: {
      id,
      uid: `log-${id}`,
      apiKeyUid: id % 2 === 0 ? null : `key-${id}`,
      endpoint: "/api/v1/drafts",
      status: 200,
      createdAt: timestamp,
    },
  };
  if (!rows[table]) throw new Error(`Unknown test table ${table}`);
  return { ...rows[table], ...overrides };
}

function snapshot(overrides = {}) {
  const tablesByName = Object.fromEntries(
    tables.map((table, index) => {
      const rows = [rowFor(table, index + 1)];
      return [table, { rows, rowCount: rows.length, lastId: rows.at(-1).id }];
    }),
  );
  for (const [table, tableOverride] of Object.entries(overrides)) {
    const rows = tableOverride.rows ?? tablesByName[table].rows;
    tablesByName[table] = {
      ...tablesByName[table],
      ...tableOverride,
      rows,
      rowCount: tableOverride.rowCount ?? rows.length,
      lastId: tableOverride.lastId ?? rows.at(-1)?.id ?? 0,
    };
  }
  return {
    format: "mollulog.d1.snapshot.v1",
    pageSize: 500,
    generatedAt: "2026-08-23T00:00:00.000Z",
    tables: tablesByName,
  };
}

function encodeReceiptKey(itemKey) {
  return `v1:${Buffer.from(new TextEncoder().encode(itemKey)).toString("base64url")}`;
}

function targetRow(sourceRow) {
  return Object.fromEntries(
    Object.entries(sourceRow).map(([column, value]) => {
      const snake = column.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      if (timestampColumns.has(column)) return [snake, value === null ? null : new Date("2026-08-23T00:00:00.000Z")];
      if (booleanColumns.has(column)) return [snake, value === 1];
      if (jsonColumns.has(column)) return [snake, JSON.parse(value)];
      if (column === "itemKey") return [snake, encodeReceiptKey(value)];
      return [snake, value];
    }),
  );
}

function targetRowsFor(source) {
  return Object.fromEntries(tables.map((table) => [table, source.tables[table].rows.map(targetRow)]));
}

function tableInQuery(text, { includeStage = true } = {}) {
  return tables.find((table) => text.includes(`"${table}"`) && (includeStage || !text.includes(`"d1_cutover_stage_${table}"`)));
}

function fakeClient(rowsByTable, { sourceDifferenceTables = [], targetDifferenceTables = [], sequenceNames = {}, throwWhen } = {}) {
  const calls = [];
  const client = {
    calls,
    connected: false,
    ended: false,
    async connect() {
      client.connected = true;
    },
    async query(text, values = []) {
      calls.push({ text, values });
      if (throwWhen?.(text, values)) throw new Error("injected PostgreSQL failure");
      if (text.includes(" EXCEPT ")) {
        const table = tables.find((candidate) => text.includes(`"d1_cutover_stage_${candidate}"`));
        const sourceDifference = text.includes(`FROM "d1_cutover_stage_${table}" EXCEPT`);
        const differenceTables = sourceDifference ? sourceDifferenceTables : targetDifferenceTables;
        return { rows: [{ count: differenceTables.includes(table) ? "1" : "0" }] };
      }
      if (text.startsWith("CREATE TEMP TABLE ")) return { rows: [] };
      if (text.startsWith("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name")) {
        const table = values[0];
        const sequenceName = Object.hasOwn(sequenceNames, table) ? sequenceNames[table] : `public.${table}_id_seq`;
        return { rows: [{ sequence_name: sequenceName }] };
      }
      if (text.startsWith("SELECT COALESCE(MAX(id), 0)::bigint + 1 AS next_id FROM ")) {
        const table = tableInQuery(text, { includeStage: false });
        const maximumId = Math.max(0, ...(rowsByTable[table] ?? []).map(({ id }) => id));
        return { rows: [{ next_id: String(maximumId + 1) }] };
      }
      if (text.startsWith("ALTER SEQUENCE ")) return { rows: [] };
      if (text.startsWith("SELECT COUNT(*)::bigint")) {
        const table = tableInQuery(text, { includeStage: false });
        return { rows: [{ count: String(rowsByTable[table]?.length ?? 0) }] };
      }
      if (text.startsWith("SELECT * FROM ")) {
        const table = tableInQuery(text, { includeStage: false });
        return { rows: rowsByTable[table] ?? [] };
      }
      return { rows: [] };
    },
    async end() {
      client.ended = true;
    },
  };
  return client;
}

if (!runningUnderJest) {
  const { test } = process.getBuiltinModule("node:test");
  const assert = process.getBuiltinModule("node:assert/strict");

  test("maps every table to typed PostgreSQL parameters", async () => {
    const { buildInsertStatement } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    for (const table of tables) {
      const statement = buildInsertStatement(table, source.tables[table].rows);
      assert.match(statement.text, new RegExp(`INSERT INTO "${table}"`));
      if (table !== "connect_request_logs") assert.match(statement.text, /"user_id"/);
      assert.ok(statement.values.every((value) => !(typeof value === "string" && /At$/.test(value))));
    }

    const timeline = buildInsertStatement("pyroxene_timeline_items", source.tables.pyroxene_timeline_items.rows);
    assert.equal(timeline.values[8], true);
    assert.ok(timeline.values[3] instanceof Date);
    assert.equal(timeline.values[3].toISOString(), "2026-08-23T00:00:00.000Z");

    const guest = buildInsertStatement("pyroxene_guest_import_items", [rowFor("pyroxene_guest_import_items", 1)]);
    assert.equal(guest.values[4], "v1:dHlwZQBrZXk");
  });

  test("normalizes timezone-less timestamps as UTC and preserves explicit offsets", async () => {
    const { buildInsertStatement } = await import("./pyroxene-transfer.mjs");
    const variants = [
      ["space", "2024-06-16 11:50:47", "2024-06-16T11:50:47.000Z"],
      ["timezone-less T", "2024-06-16T11:50:47", "2024-06-16T11:50:47.000Z"],
      ["Z", "2024-06-16T11:50:47Z", "2024-06-16T11:50:47.000Z"],
      ["positive offset", "2024-06-16T11:50:47+09:00", "2024-06-16T02:50:47.000Z"],
      ["negative offset", "2024-06-16T11:50:47-05:00", "2024-06-16T16:50:47.000Z"],
    ];
    for (const [label, value, expected] of variants) {
      const statement = buildInsertStatement("pyroxene_owned_resources", [
        rowFor("pyroxene_owned_resources", 1, { inputAt: value, createdAt: value, updatedAt: value }),
      ]);
      assert.equal(statement.values[3].toISOString(), expected, label);
      assert.equal(statement.values[7].toISOString(), expected, label);
      assert.equal(statement.values[8].toISOString(), expected, label);
    }
  });

  test("uses the frozen v1 receipt-key vectors and rejects noncanonical keys", async () => {
    const { decodePostgresPyroxeneReceiptItemKey, encodePostgresPyroxeneReceiptItemKey } = await import("./pyroxene-transfer.mjs");
    const vectors = [
      ["", "v1:"],
      ["a\u0000b", "v1:YQBi"],
      ["현\u0000A", "v1:7ZiEAEE"],
    ];
    for (const [raw, encoded] of vectors) {
      assert.equal(encodePostgresPyroxeneReceiptItemKey(raw), encoded);
      assert.equal(decodePostgresPyroxeneReceiptItemKey(encoded), raw);
    }
    assert.throws(() => decodePostgresPyroxeneReceiptItemKey("v2:YQ"), /Unsupported/);
    assert.throws(() => decodePostgresPyroxeneReceiptItemKey("v1:YQ="), /Invalid/);
    assert.throws(() => decodePostgresPyroxeneReceiptItemKey("v1:___"), /Invalid/);
  });

  test("keeps chunk parameter order and limits chunks to 500 rows", async () => {
    const { INSERT_CHUNK_SIZE, buildInsertStatement } = await import("./pyroxene-transfer.mjs");
    const rows = Array.from({ length: INSERT_CHUNK_SIZE + 1 }, (_, index) => rowFor("pyroxene_planner_options", index + 1));
    const first = buildInsertStatement("pyroxene_planner_options", rows, 0, INSERT_CHUNK_SIZE);
    const second = buildInsertStatement("pyroxene_planner_options", rows, INSERT_CHUNK_SIZE, rows.length);
    assert.equal(first.values.length, INSERT_CHUNK_SIZE * 5);
    assert.deepEqual(first.values.slice(0, 5), [1, 1, '{"days":1}', new Date("2026-08-23T00:00:00.000Z"), new Date("2026-08-23T00:00:00.000Z")]);
    assert.equal(first.values[first.values.length - 5], INSERT_CHUNK_SIZE);
    assert.match(first.text, /\$2500\)/);
    assert.deepEqual(second.values.slice(0, 5), [INSERT_CHUNK_SIZE + 1, INSERT_CHUNK_SIZE + 1, `{"days":${INSERT_CHUNK_SIZE + 1}}`, new Date("2026-08-23T00:00:00.000Z"), new Date("2026-08-23T00:00:00.000Z")]);
  });

  test("imports all ten tables in one transaction, repairs sequences, and proves bidirectional parity", async () => {
    const { parityDifferenceStatement, transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    const client = fakeClient(targetRowsFor(source));
    const result = await transferPyroxeneSnapshot(source, { client, statementTimeoutMs: 12345 });

    assert.deepEqual(result.tables.map(({ table }) => table), tables);
    assert.equal(client.calls.filter(({ text }) => text === "BEGIN").length, 1);
    assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 1);
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 0);
    assert.deepEqual(client.calls.find(({ text }) => text.includes("set_config"))?.values, ["12345ms"]);
    const sequenceResolutionCalls = client.calls.filter(({ text }) => text.startsWith("SELECT pg_get_serial_sequence($1, 'id')"));
    const sequenceRestartCalls = client.calls.filter(({ text }) => text.startsWith("ALTER SEQUENCE "));
    assert.equal(sequenceResolutionCalls.length, tables.length);
    assert.deepEqual(sequenceResolutionCalls.map(({ values }) => values[0]), tables);
    assert.equal(sequenceRestartCalls.length, tables.length);
    assert.deepEqual(
      sequenceRestartCalls.map(({ text }) => text.match(/RESTART WITH (\d+)$/)?.[1]),
      ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
    );
    assert.equal(client.calls.filter(({ text }) => text.startsWith("DELETE FROM ")).length, tables.length);
    assert.equal(client.calls.filter(({ text }) => text.includes(" EXCEPT ")).length, tables.length * 2);
    assert.ok(client.calls.some(({ text }) => text.includes('INSERT INTO "pyroxene_guest_import_items"') && text.includes('"item_key"')));
    assert.match(parityDifferenceStatement("pyroxene_owned_resources", "source_minus_target"), /EXCEPT/);
    assert.match(parityDifferenceStatement("pyroxene_owned_resources", "target_minus_source"), /EXCEPT/);
  });

  test("restarts an empty table identity sequence at one", async () => {
    const { transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot({ pyroxene_planner_options: { rows: [] } });
    const client = fakeClient(targetRowsFor(source));
    await transferPyroxeneSnapshot(source, { client });
    const restart = client.calls.find(({ text }) => text.includes('"pyroxene_planner_options_id_seq"'));
    assert.equal(restart?.text, 'ALTER SEQUENCE "public"."pyroxene_planner_options_id_seq" RESTART WITH 1');
  });

  test("rolls back a valid maximum integer ID before issuing an overflowing restart", async () => {
    const { transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot({
      pyroxene_owned_resources: {
        rows: [rowFor("pyroxene_owned_resources", 2147483647, { pyroxene: 1 })],
      },
    });
    const client = fakeClient(targetRowsFor(source));
    await assert.rejects(transferPyroxeneSnapshot(source, { client }), /expected 1-2147483647/);
    assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
    assert.equal(client.calls.some(({ text }) => text.includes("RESTART WITH 2147483648")), false);
    assert.equal(client.calls.some(({ text }) => text.includes('"pyroxene_owned_resources_id_seq"')), false);
  });

  test("rolls back the whole import when either typed parity direction fails", async () => {
    const { transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    for (const option of [{ sourceDifferenceTables: [tables[0]] }, { targetDifferenceTables: [tables[0]] }]) {
      const client = fakeClient(targetRowsFor(source), option);
      await assert.rejects(transferPyroxeneSnapshot(source, { client }), /Parity mismatch/);
      assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
      assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
    }
  });

  test("rolls back on an import failure and preserves the original error", async () => {
    const { transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    const client = fakeClient(targetRowsFor(source), {
      throwWhen: (text) => text.startsWith('INSERT INTO "d1_cutover_stage_pyroxene_event_data"'),
    });
    await assert.rejects(transferPyroxeneSnapshot(source, { client }), /injected PostgreSQL failure/);
    assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
  });

  test("fails closed for missing, malformed, or untrusted identity sequence results", async () => {
    const { transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    for (const sequenceName of [undefined, null, "public.bad-name", "public.one.two", "public.seq;DROP TABLE users"]) {
      const client = fakeClient(targetRowsFor(source), { sequenceNames: { [tables[0]]: sequenceName } });
      await assert.rejects(transferPyroxeneSnapshot(source, { client }), /identity sequence/);
      assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
      assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
    }
  });

  test("accepts both unqualified and schema-qualified sequence identifiers", async () => {
    const { transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    const client = fakeClient(targetRowsFor(source), {
      sequenceNames: { [tables[0]]: "pyroxene_owned_resources_id_seq", [tables[1]]: "custom.pyroxene_collected_sources_id_seq" },
    });
    await transferPyroxeneSnapshot(source, { client });
    assert.ok(client.calls.some(({ text }) => text === 'ALTER SEQUENCE "pyroxene_owned_resources_id_seq" RESTART WITH 2'));
    assert.ok(client.calls.some(({ text }) => text === 'ALTER SEQUENCE "custom"."pyroxene_collected_sources_id_seq" RESTART WITH 3'));
  });

  test("requires the exact snapshot envelope and per-table metadata before import", async () => {
    const { transferPyroxeneSnapshot, validateSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    for (const field of ["format", "pageSize", "generatedAt", "tables"]) {
      const missing = { ...source };
      delete missing[field];
      assert.throws(() => validateSnapshot(missing), new RegExp(`missing=.*${field}`));
    }
    for (const table of tables) {
      for (const field of ["rows", "rowCount", "lastId"]) {
        const missingTables = { ...source.tables, [table]: { ...source.tables[table] } };
        delete missingTables[table][field];
        assert.throws(
          () => validateSnapshot({ ...source, tables: missingTables }),
          new RegExp(`missing=.*${field}`),
          `${table}.${field}`,
        );
      }
    }

    const invalid = { ...source };
    delete invalid.pageSize;
    const client = { query: async () => { throw new Error("PostgreSQL mutation must not start"); } };
    await assert.rejects(transferPyroxeneSnapshot(invalid, { client }), /missing=.*pageSize/);
  });

  test("rejects unique IDs that are out of order even when lastId is the maximum", async () => {
    const { validateSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    const rows = [rowFor("pyroxene_owned_resources", 2), rowFor("pyroxene_owned_resources", 1)];
    const outOfOrder = {
      ...source,
      tables: {
        ...source.tables,
        pyroxene_owned_resources: { rows, rowCount: rows.length, lastId: 2 },
      },
    };
    assert.throws(() => validateSnapshot(outOfOrder), /strictly increasing/);
  });

  test("rejects unsupported versions, missing or extra tables, duplicate IDs, and duplicate physical keys", async () => {
    const { validateSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    assert.throws(() => validateSnapshot({ ...source, format: "mollulog.d1.snapshot.v2" }), /Unsupported snapshot format/);
    assert.throws(() => validateSnapshot({ ...source, unexpected: true }), /unknown=unexpected/);
    const missing = { ...source, tables: { ...source.tables } };
    delete missing.tables.pyroxene_event_data;
    assert.throws(() => validateSnapshot(missing), /missing tables/);
    assert.throws(() => validateSnapshot({ ...source, tables: { ...source.tables, users: { rows: [] } } }), /non-allowlisted/);

    const duplicateId = {
      ...source,
      tables: {
        ...source.tables,
        pyroxene_owned_resources: {
          rows: [source.tables.pyroxene_owned_resources.rows[0], source.tables.pyroxene_owned_resources.rows[0]],
          rowCount: 2,
          lastId: 1,
        },
      },
    };
    assert.throws(() => validateSnapshot(duplicateId), /Duplicate id/);

    const duplicateKey = {
      ...source,
      tables: {
        ...source.tables,
        pyroxene_collected_sources: {
          rows: [
            source.tables.pyroxene_collected_sources.rows[0],
            rowFor("pyroxene_collected_sources", 5, { uid: "other", userId: 4, sourceKey: "source-4" }),
          ],
          rowCount: 2,
          lastId: 5,
        },
      },
    };
    assert.throws(() => validateSnapshot(duplicateKey), /Duplicate unique key/);
    assert.throws(
      () =>
        validateSnapshot({
          ...source,
          tables: {
            ...source.tables,
            pyroxene_owned_resources: {
              rows: [{ ...source.tables.pyroxene_owned_resources.rows[0], unknown: true }],
              rowCount: 1,
              lastId: 1,
            },
          },
        }),
      /Unknown columns/,
    );

    const { buildInsertStatement } = await import("./pyroxene-transfer.mjs");
    assert.throws(() => buildInsertStatement("pyroxene_owned_resources", source.tables.pyroxene_owned_resources.rows, 0, 1, "users"), /Target table is not allowlisted/);
  });

  test("connects and closes a client created by the factory", async () => {
    const { transferPyroxeneSnapshot } = await import("./pyroxene-transfer.mjs");
    const source = snapshot();
    const client = fakeClient(targetRowsFor(source));
    const result = await transferPyroxeneSnapshot(source, { clientFactory: async () => client });
    assert.equal(result.tables.length, tables.length);
    assert.equal(client.connected, true);
    assert.equal(client.ended, true);
  });
} else {
  test("pyroxene transfer contracts run with node:test", () => {});
}
