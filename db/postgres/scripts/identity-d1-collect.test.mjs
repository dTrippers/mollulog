const runningUnderJest = Boolean(process.env.JEST_WORKER_ID);

if (!runningUnderJest) {
  const { test } = process.getBuiltinModule("node:test");
  const assert = process.getBuiltinModule("node:assert/strict");
  const tables = [
    "senseis",
    "auth_identities",
    "passkeys",
    "pending_sensei_registrations",
    "sensei_privacies",
    "followerships",
  ];

  test("uses an allowlisted id keyset query capped at 500 rows", async () => {
    const { buildKeysetQuery } = await import("./identity-d1-collect.mjs");
    assert.equal(
      buildKeysetQuery("senseis", 12, 500),
      'SELECT * FROM "senseis" WHERE id > 12 ORDER BY id LIMIT 500',
    );
    assert.throws(() => buildKeysetQuery("posts"), /allowlisted/);
    assert.throws(() => buildKeysetQuery("senseis", 0, 501), /between 1 and 500/);
  });

  test("collects every identity table using successive keyset pages", async () => {
    const { collectIdentitySnapshot } = await import("./identity-d1-collect.mjs");
    const calls = [];
    const snapshot = await collectIdentitySnapshot({
      database: "mollulog",
      pageSize: 2,
      execute: async ({ query }) => {
        calls.push(query);
        const table = tables.find((candidate) => query.includes(`"${candidate}"`));
        const lastId = Number(query.match(/id > (\d+)/)?.[1] ?? 0);
        return {
          results:
            lastId === 0
              ? [{ id: 1, uid: `${table}-1` }, { id: 2, uid: `${table}-2` }]
              : [{ id: 3, uid: `${table}-3` }],
        };
      },
    });

    assert.equal(snapshot.format, "mollulog.identity.snapshot.v1");
    for (const table of tables) {
      assert.equal(snapshot.tables[table].rowCount, 3);
      assert.equal(snapshot.tables[table].lastId, 3);
    }
    assert.equal(calls.length, tables.length * 2);
    assert.ok(calls.every((query) => query.includes("ORDER BY id") && query.includes("LIMIT 2")));
  });

  test("does not depend on wrangler d1 export", async () => {
    const { readFile } = process.getBuiltinModule("node:fs/promises");
    const source = await readFile(`${process.cwd()}/db/postgres/scripts/identity-d1-collect.mjs`, "utf8");
    assert.equal(source.includes("wrangler d1 export"), false);
  });

  test("creates snapshots as 0600 files and refuses to overwrite them", async () => {
    const { mkdtemp, stat } = process.getBuiltinModule("node:fs/promises");
    const { join } = process.getBuiltinModule("node:path");
    const { tmpdir } = process.getBuiltinModule("node:os");
    const { writeIdentitySnapshot } = await import("./identity-d1-collect.mjs");
    const directory = await mkdtemp(join(tmpdir(), "mollulog-identity-"));
    const output = join(directory, "snapshot.json");
    const snapshot = { format: "mollulog.identity.snapshot.v1", tables: {} };

    await writeIdentitySnapshot(output, snapshot);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(writeIdentitySnapshot(output, snapshot), { code: "EEXIST" });
  });
} else {
  test("identity collector contracts run with node:test", () => {});
}
