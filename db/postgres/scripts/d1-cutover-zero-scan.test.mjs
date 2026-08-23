const runningUnderJest = Boolean(process.env.JEST_WORKER_ID);

if (!runningUnderJest) {
  const { test } = process.getBuiltinModule("node:test");
  const assert = process.getBuiltinModule("node:assert/strict");
  const { mkdtemp, mkdir, rm, writeFile } = process.getBuiltinModule("node:fs/promises");
  const { join } = process.getBuiltinModule("node:path");
  const { tmpdir } = process.getBuiltinModule("node:os");

  test("scans only selected runtime/config paths and ignores ambient declarations, tests, and docs", async () => {
    const root = await mkdtemp(join(tmpdir(), "mollulog-d1-zero-"));
    try {
      await mkdir(join(root, "app", "nested"), { recursive: true });
      await mkdir(join(root, "app", "docs"), { recursive: true });
      await mkdir(join(root, "app", "test"), { recursive: true });
      await writeFile(join(root, "app", "nested", "runtime.ts"), "export const db = env.DB;\n");
      await writeFile(join(root, "app", "nested", "ambient.d.ts"), "declare const DB: D1Database;\n");
      await writeFile(join(root, "app", "docs", "migration.md"), "wrangler d1 execute\n");
      await writeFile(join(root, "app", "test", "runtime.test.ts"), "const db = env.DB;\n");

      const { scanFiles } = await import("./d1-cutover-zero-scan.mjs");
      const result = await scanFiles(root, ["app"]);
      assert.equal(result.violations.length, 1);
      assert.deepEqual(result.violations[0], {
        file: "app/nested/runtime.ts",
        line: 1,
        pattern: "D1 environment access",
        text: "export const db = env.DB;",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("flags bindings, D1 drivers, wrappers, and package commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "mollulog-d1-zero-"));
    try {
      await writeFile(
        join(root, "runtime.ts"),
        [
          'import { drizzle } from "drizzle-orm/d1";',
          "const query = withD1(env);",
          "const timeout = RUNTIME_TIMEOUTS.d1;",
        ].join("\n"),
      );
      await writeFile(join(root, "wrangler.jsonc"), '{\n  "d1_databases": [],\n  "binding": "DB"\n}\n');
      await writeFile(join(root, "package.json"), '{ "scripts": { "db": "wrangler d1 execute" } }\n');

      const { scanFiles } = await import("./d1-cutover-zero-scan.mjs");
      const result = await scanFiles(root, ["runtime.ts", "wrangler.jsonc", "package.json"]);
      assert.equal(result.violations.length, 6);
      assert.deepEqual(
        result.violations.map(({ file, pattern }) => `${file}:${pattern}`),
        [
          "package.json:D1 package command",
          "runtime.ts:D1 driver import",
          "runtime.ts:D1 runtime wrapper",
          "runtime.ts:D1 runtime wrapper",
          "wrangler.jsonc:D1 binding declaration",
          "wrangler.jsonc:D1 binding declaration",
        ],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
} else {
  test("D1-zero scanner contracts run with node:test", () => {});
}
