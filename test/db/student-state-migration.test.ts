import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "@jest/globals";

const legacyTables = [
  "timeline_contents",
  "posts",
  "content_favorite_students",
  "content_favorite_counts",
  "coupons",
  "coupon_registrations",
  "feedback_tickets",
  "feedback_replies",
  "community_posts",
  "community_comments",
  "community_post_likes",
  "community_post_tags",
  "recruitment_results",
] as const;

const studentStateTables = [
  "recruited_students",
  "student_growth",
  "user_relationship_levels",
  "growth_resource_inventory",
  "sync_drafts",
  "sync_draft_entries",
  "user_resource_inventory_drafts",
  "user_resource_inventory_draft_items",
] as const;

describe("student-state zzz migration", () => {
  test("renames exactly the 13 obsolete tables and leaves student-state sources", () => {
    const database = new DatabaseSync(":memory:");
    for (const table of [...legacyTables, ...studentStateTables]) {
      database.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, uid TEXT)`);
    }
    const migration = readFileSync("db/migrations/20260807000200_rename_unused_tables_with_zzz_prefix.sql", "utf8");
    expect(migration).not.toContain("ALTER TABLE IF EXISTS");
    database.exec(migration);

    const names = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name)),
    );
    expect([...names].filter((name) => name.startsWith("zzz_")).sort()).toEqual(
      legacyTables.map((table) => `zzz_${table}`).sort(),
    );
    for (const table of studentStateTables) expect(names.has(table)).toBe(true);
    for (const table of legacyTables) expect(names.has(table)).toBe(false);
    database.close();
  });

  test("renames all eight student-state tables with the zzz prefix", () => {
    const database = new DatabaseSync(":memory:");
    for (const table of studentStateTables) {
      database.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, uid TEXT)`);
    }
    const migration = readFileSync(
      "db/migrations/20260808000100_rename_student_state_tables_with_zzz_prefix.sql",
      "utf8",
    );
    expect(migration).not.toContain("ALTER TABLE IF EXISTS");
    database.exec(migration);

    const names = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name)),
    );
    expect([...names].filter((name) => name.startsWith("zzz_")).sort()).toEqual(
      studentStateTables.map((table) => `zzz_${table}`).sort(),
    );
    for (const table of studentStateTables) {
      expect(names.has(table)).toBe(false);
      expect(names.has(`zzz_${table}`)).toBe(true);
    }
    database.close();
  });

  test("defines student-state timestamp gaps and leaves relationship JSON validation to the application", () => {
    const migration = readFileSync("db/postgres/migrations/20260807000100_create_student_state.sql", "utf8");
    const schema = readFileSync("app/db/postgres/schema.ts", "utf8");
    const extractCreateTableBody = (tableName: string) => {
      const match = migration.match(new RegExp(`CREATE TABLE ${tableName} \\(([\\s\\S]*?)\\);`));
      expect(match).not.toBeNull();
      return match?.[1] ?? "";
    };
    expect(extractCreateTableBody("sync_draft_entries")).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(extractCreateTableBody("user_resource_inventory_draft_items")).toMatch(
      /updated_at timestamptz NOT NULL DEFAULT now\(\)/,
    );
    expect(migration).not.toContain("user_relationship_levels_items_object");
    expect(migration).not.toContain("jsonb_typeof(items) = 'object'");
    const extractPgTableDefinition = (exportName: string) => {
      const match = schema.match(new RegExp(`export const ${exportName} = pgTable\\(([\\s\\S]*?\\n\\);)`));
      expect(match).not.toBeNull();
      return match?.[1] ?? "";
    };
    expect(extractPgTableDefinition("pgSyncDraftEntriesTable")).toMatch(/updatedAt: timestamptz\("updated_at"\)/);
    expect(extractPgTableDefinition("pgUserResourceInventoryDraftItemsTable")).toMatch(
      /updatedAt: timestamptz\("updated_at"\)/,
    );
    expect(schema).not.toContain("user_relationship_levels_items_object");
  });
});
