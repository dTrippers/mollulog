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
});
