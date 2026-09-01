import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const migrationPath = "db/postgres/migrations/20260901000200_add_recruited_student_equipment_levels.sql";

describe("recruited student equipment-level migration", () => {
  it("adds nullable equipment level columns without touching growth targets", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/^ALTER TABLE recruited_students\s+ADD COLUMN equip1_level integer,/);
    expect(migration).toContain("ADD COLUMN equip2_level integer");
    expect(migration).toContain("ADD COLUMN equip3_level integer");
    expect(migration).not.toMatch(/NOT NULL/i);
    expect(migration).not.toMatch(/DROP\s+/i);
    expect(migration).not.toMatch(/student_growth/i);
  });
});
