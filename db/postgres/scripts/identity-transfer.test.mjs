const runningUnderJest = Boolean(process.env.JEST_WORKER_ID);

const tables = [
  "senseis",
  "auth_identities",
  "passkeys",
  "pending_sensei_registrations",
  "sensei_privacies",
  "followerships",
];

function snapshot({ mismatch = false } = {}) {
  const pendingRows = Array.from({ length: 469 }, (_, index) => ({
    id: index + 1,
    uid: `pending-${index + 1}`,
    provider: "google",
    providerUserId: `google-${index + 1}`,
    createdAt: "2026-08-01 00:00:00",
    updatedAt: "2026-08-01 00:00:00",
  }));
  const snapshotTables = {
    senseis: {
      rows: [
        {
          id: 7,
          uid: "sensei-7",
          username: "teacher",
          friendCode: null,
          profileStudentId: null,
          googleId: "google-7",
          githubId: null,
          active: 1,
          bio: null,
          role: "guest",
          profileVisibility: "public",
          createdAt: "2026-08-01 00:00:00",
          updatedAt: "2026-08-01 00:00:00",
        },
      ],
    },
    auth_identities: { rows: [] },
    passkeys: { rows: [] },
    pending_sensei_registrations: { rows: pendingRows },
    sensei_privacies: { rows: [] },
    followerships: { rows: [] },
  };
  if (mismatch) snapshotTables.senseis.rows[0].username = "different";
  return { format: "mollulog.identity.snapshot.v1", tables: snapshotTables };
}

function targetRows(source, mismatch = false) {
  return {
    senseis: [
      {
        id: 7,
        uid: "sensei-7",
        username: mismatch ? "different" : "teacher",
        friend_code: null,
        profile_student_id: null,
        google_id: "google-7",
        github_id: null,
        active: true,
        bio: null,
        role: "guest",
        profile_visibility: "public",
        created_at: new Date("2026-08-01T00:00:00.000Z"),
        updated_at: new Date("2026-08-01T00:00:00.000Z"),
      },
    ],
    auth_identities: [],
    passkeys: [],
    pending_sensei_registrations: source.tables.pending_sensei_registrations.rows,
    sensei_privacies: [],
    followerships: [],
  };
}

function fakeClient(rowsByTable, { sourceDifferenceTables = [], targetDifferenceTables = [] } = {}) {
  const calls = [];
  const client = {
    calls,
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.includes(" EXCEPT ")) {
        const table = tables.find((candidate) => text.includes(`identity_stage_${candidate}`));
        const isSourceDifference = text.includes(`FROM "identity_stage_${table}" EXCEPT`);
        const differenceTables = isSourceDifference ? sourceDifferenceTables : targetDifferenceTables;
        return { rows: [{ count: differenceTables.includes(table) ? "1" : "0" }] };
      }
      if (text.startsWith("CREATE TEMP TABLE ")) return { rows: [] };
      if (text.startsWith("SELECT COUNT(*)")) {
        const table = tables.find(
          (candidate) => text.includes(`"${candidate}"`) || text.includes(`"identity_stage_${candidate}"`),
        );
        return { rows: [{ count: String(rowsByTable[table]?.length ?? 0) }] };
      }
      if (text.startsWith("SELECT * FROM ")) {
        const table = tables.find((candidate) => text.includes(`"${candidate}"`));
        return { rows: rowsByTable[table] ?? [] };
      }
      return { rows: [] };
    },
  };
  return client;
}

if (!runningUnderJest) {
  const { test } = process.getBuiltinModule("node:test");
  const assert = process.getBuiltinModule("node:assert/strict");

  test("builds typed inserts with preserved IDs and UTC values", async () => {
    const { buildInsertStatement, canonicalRow } = await import("./identity-transfer.mjs");
    const statement = buildInsertStatement("senseis", snapshot().tables.senseis.rows);
    assert.match(statement.text, /INSERT INTO "senseis"/);
    assert.match(statement.text, /"created_at"/);
    assert.equal(statement.values[0], 7);
    assert.equal(statement.values.at(-2), "2026-08-01T00:00:00.000Z");
    assert.equal(statement.values.at(-1), "2026-08-01T00:00:00.000Z");
    assert.equal(
      canonicalRow({ ...snapshot().tables.senseis.rows[0], active: true }, "senseis"),
      canonicalRow(targetRows(snapshot()).senseis[0], "senseis"),
    );
  });

  test("normalizes timezone-less timestamps as UTC and preserves explicit offsets", async () => {
    const { buildInsertStatement } = await import("./identity-transfer.mjs");
    const variants = [
      ["space", "2024-06-16 11:50:47", "2024-06-16T11:50:47.000Z"],
      ["timezone-less T", "2024-06-16T11:50:47", "2024-06-16T11:50:47.000Z"],
      ["Z", "2024-06-16T11:50:47Z", "2024-06-16T11:50:47.000Z"],
      ["positive offset", "2024-06-16T11:50:47+09:00", "2024-06-16T02:50:47.000Z"],
      ["negative offset", "2024-06-16T11:50:47-05:00", "2024-06-16T16:50:47.000Z"],
    ];
    for (const [label, value, expected] of variants) {
      const statement = buildInsertStatement("senseis", [
        { ...snapshot().tables.senseis.rows[0], createdAt: value, updatedAt: value },
      ]);
      assert.equal(statement.values.at(-2), expected, label);
      assert.equal(statement.values.at(-1), expected, label);
    }
  });

  test("imports all six tables, repairs sequences, and commits parity", async () => {
    const { transferIdentitySnapshot } = await import("./identity-transfer.mjs");
    const source = snapshot();
    const client = fakeClient(targetRows(source));
    const result = await transferIdentitySnapshot(source, { client });
    assert.deepEqual(result.tables.map(({ table }) => table), [...tables]);
    assert.equal(client.calls.filter(({ text }) => text === "BEGIN").length, 1);
    assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 1);
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 0);
    assert.equal(
      client.calls.filter(({ text }) => text.startsWith("SELECT setval(pg_get_serial_sequence")).length,
      tables.length,
    );
    assert.ok(
      client.calls.some(
        ({ text }) =>
          text.includes('INSERT INTO "pending_sensei_registrations"') &&
          text.includes('SELECT "id", "uid"') &&
          text.includes('FROM "identity_stage_pending_sensei_registrations"'),
      ),
    );
    const exceptCalls = client.calls.filter(({ text }) => text.includes(" EXCEPT "));
    assert.equal(exceptCalls.length, tables.length * 2);
    assert.equal(client.calls.filter(({ text }) => text.startsWith("SELECT * FROM ")).length, tables.length);
    assert.ok(exceptCalls.every(({ text }) => text.includes("identity_stage_")));
    assert.ok(exceptCalls.every(({ text }) => text.includes('"created_at"')));
    assert.ok(exceptCalls.every(({ text }) => text.includes('"updated_at"')));
    assert.ok(exceptCalls.every(({ text }) => text.indexOf("EXCEPT") > text.indexOf("SELECT")));
  });

  test("rolls back the whole import when typed parity fails", async () => {
    const { transferIdentitySnapshot } = await import("./identity-transfer.mjs");
    const source = snapshot();
    const client = fakeClient(targetRows(source, true), { sourceDifferenceTables: ["senseis"] });
    await assert.rejects(transferIdentitySnapshot(source, { client }), /Parity mismatch for senseis/);
    assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
  });

  test("rolls back when the target-minus-source SQL gate fails", async () => {
    const { transferIdentitySnapshot } = await import("./identity-transfer.mjs");
    const source = snapshot();
    const client = fakeClient(targetRows(source), { targetDifferenceTables: ["senseis"] });
    await assert.rejects(transferIdentitySnapshot(source, { client }), /target_minus_source=1/);
    assert.equal(client.calls.filter(({ text }) => text === "COMMIT").length, 0);
    assert.equal(client.calls.filter(({ text }) => text === "ROLLBACK").length, 1);
  });

  test("compares identity rows by id and rejects duplicate IDs", async () => {
    const { compareTableParity } = await import("./identity-transfer.mjs");
    const rows = snapshot().tables.senseis.rows;
    assert.throws(() => compareTableParity("senseis", [...rows, rows[0]], rows), /Duplicate id/);
  });

  test("rejects invalid snapshot values before beginning or mutating the target", async () => {
    const { transferIdentitySnapshot } = await import("./identity-transfer.mjs");
    for (const [label, mutate, message] of [
      ["timestamp", (value) => ({ ...value, createdAt: "not-a-timestamp" }), /Invalid timestamp/],
      ["impossible calendar date", (value) => ({ ...value, createdAt: "2026-02-30 10:00:00" }), /Invalid timestamp/],
      ["timestamp trailing junk", (value) => ({ ...value, createdAt: "2026-01-01junk" }), /Invalid timestamp/],
      ["timestamp trailing newline", (value) => ({ ...value, createdAt: "2026-01-01 00:00:00\n" }), /Invalid timestamp/],
      ["invalid clock time", (value) => ({ ...value, createdAt: "2026-01-01 24:00:00" }), /Invalid timestamp/],
      ["invalid timezone offset", (value) => ({ ...value, createdAt: "2026-01-01T00:00:00+24:00" }), /Invalid timestamp/],
      ["integer", (value) => ({ ...value, id: "not-an-integer" }), /Invalid integer/],
      ["boolean", (value) => ({ ...value, active: "maybe" }), /Invalid boolean/],
    ]) {
      const source = snapshot();
      source.tables.senseis.rows[0] = mutate(source.tables.senseis.rows[0]);
      const client = fakeClient(targetRows(source));
      await assert.rejects(transferIdentitySnapshot(source, { client }), message, label);
      assert.equal(client.calls.length, 0, `${label} validation must precede target mutation`);
    }
  });
} else {
  test("identity transfer contracts run with node:test", () => {});
}
