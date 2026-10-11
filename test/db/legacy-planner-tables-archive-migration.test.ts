import { readFileSync } from "node:fs";
import { describe, expect, test } from "@jest/globals";

const migration = readFileSync(
  "db/postgres/migrations/20260929000100_rename_legacy_planner_tables_with_zzz_prefix.sql",
  "utf8",
);
const schema = readFileSync("app/db/postgres/schema.ts", "utf8");
const archivedTables = [
  "pyroxene_owned_resources",
  "pyroxene_collected_sources",
  "pyroxene_timeline_items",
  "pyroxene_planner_options",
  "pyroxene_event_data",
  "event_shop_states",
];

describe("legacy planner table archive migration", () => {
  test("renames every legacy planner table with the zzz_ prefix without dropping data", () => {
    const statements = migration
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("--"));
    expect(statements).toEqual(archivedTables.map((table) => `ALTER TABLE ${table} RENAME TO zzz_${table};`));
    expect(migration).not.toMatch(/\bDROP\b/i);
  });

  test("removes the archived tables from the Drizzle schema and keeps the retained planner tables", () => {
    for (const table of archivedTables) {
      expect(schema).not.toContain(`"${table}"`);
    }
    for (const table of ["planner_states", "event_shop_state_history", "pyroxene_guest_import_items"]) {
      expect(schema).toContain(`"${table}"`);
    }
  });
});
