import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const migrationPath = "db/postgres/migrations/20260905000100_add_sensei_growth_visibility.sql";

describe("sensei growth visibility migration", () => {
  it("adds a private-by-default boolean without touching profile visibility", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(
      /^ALTER TABLE senseis\s+ADD COLUMN growth_visibility boolean NOT NULL DEFAULT false;\s*$/,
    );
    expect(migration).not.toMatch(/DROP\s+/i);
    expect(migration).not.toContain("profile_visibility");
  });
});
