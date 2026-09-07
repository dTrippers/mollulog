import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const migrationPath = "db/postgres/migrations/20260907000100_create_notification_read_states.sql";
const migration = readFileSync(migrationPath, "utf8");
const schema = readFileSync("app/db/postgres/schema.ts", "utf8");

describe("notification read state migration", () => {
  it("creates one account-scoped delivered-at watermark table", () => {
    expect(migration).toContain("CREATE TABLE notification_read_states");
    expect(migration).toContain("user_id integer NOT NULL");
    expect(migration).toContain("last_read_delivered_at timestamptz");
    expect(migration).toContain("created_at timestamptz NOT NULL");
    expect(migration).toContain("updated_at timestamptz NOT NULL");
    expect(migration).toContain("notification_read_states_user_id_uidx");
    expect(schema).toContain('"notification_read_states"');
    expect(schema).toContain('lastReadDeliveredAt: timestamptz("last_read_delivered_at")');
  });

  it("contains no data rewrite or destructive table operation", () => {
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|SELECT|DELETE|DROP|TRUNCATE|ALTER)\b/i);
  });
});
