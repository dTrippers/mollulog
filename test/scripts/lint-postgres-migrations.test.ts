import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";

const temporaryDirectories: string[] = [];

function createMigrationsDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "mollulog-migration-lint-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runMigrationLint(directory: string, schemaFile = "app/db/postgres/schema.ts") {
  return spawnSync(
    process.execPath,
    [join(process.cwd(), "scripts/lint-postgres-migrations.mjs"), directory, schemaFile],
    { encoding: "utf8" },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("PostgreSQL migration lint", () => {
  it("allows the repository after all CHECK constraints are removed", () => {
    expect(runMigrationLint("db/postgres/migrations").status).toBe(0);
  });

  it("rejects a new CHECK constraint", () => {
    const directory = createMigrationsDirectory();
    writeFileSync(
      join(directory, "20260830000200_invalid_check.sql"),
      "ALTER TABLE example ADD CONSTRAINT example_positive CHECK (value > 0);\n",
    );

    const result = runMigrationLint(directory);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PostgreSQL migrations and schema must not add CHECK constraints");
    expect(result.stderr).toContain("20260830000200_invalid_check.sql:1");
  });

  it("ignores CHECK text inside SQL comments", () => {
    const directory = createMigrationsDirectory();
    writeFileSync(
      join(directory, "20260830000300_comment.sql"),
      "-- CHECK (value > 0)\n/* CHECK (other_value > 0) */\nSELECT 1;\n",
    );

    expect(runMigrationLint(directory).status).toBe(0);
  });

  it("rejects a Drizzle schema check declaration", () => {
    const directory = createMigrationsDirectory();
    const schemaFile = join(directory, "schema.ts");
    writeFileSync(schemaFile, 'const constraint = check("positive", sql`value > 0`);\n');

    const result = runMigrationLint(directory, schemaFile);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("schema.ts:1");
  });
});
