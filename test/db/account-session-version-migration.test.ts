import { readFileSync } from "node:fs";
import { describe, expect, test } from "@jest/globals";

describe("account session version migration contract", () => {
  const migration = readFileSync("db/postgres/migrations/20260824000400_add_sensei_session_version.sql", "utf8");
  const schema = readFileSync("app/db/postgres/schema.ts", "utf8");

  test("adds a non-null PostgreSQL session version with a zero baseline", () => {
    expect(migration).toContain("ALTER TABLE senseis");
    expect(migration).toContain("ADD COLUMN session_version integer NOT NULL DEFAULT 0");
    expect(schema).toContain('sessionVersion: integer("session_version").notNull().default(0)');
  });
});
