import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const migrationPath = "db/postgres/migrations/20260908000100_add_web_push_notifications.sql";
const migration = readFileSync(migrationPath, "utf8");
const dedupMigrationPath = "db/postgres/migrations/20260908000200_reserve_notification_job_keys.sql";
const dedupMigration = readFileSync(dedupMigrationPath, "utf8");
const schema = readFileSync("app/db/postgres/schema.ts", "utf8");

describe("Web Push notification migration contract", () => {
  it("adds logical jobs and delivery snapshots without destroying Discord history", () => {
    expect(migration.trim().startsWith("BEGIN;")).toBe(true);
    expect(migration.trim().endsWith("COMMIT;")).toBe(true);
    expect(migration).toContain("ALTER TABLE notification_jobs ADD COLUMN logical_uid text");
    expect(migration).toContain("UPDATE notification_jobs SET logical_uid = uid");
    expect(migration).toContain("notification_jobs_fill_logical_uid");
    expect(migration).toContain("ALTER TABLE notification_jobs ADD COLUMN delivery_snapshot_at timestamptz");
    expect(migration).toContain("ALTER TABLE notification_channels ADD COLUMN activated_at timestamptz");
    expect(migration).toContain("ALTER TABLE notification_jobs ALTER COLUMN channel_uid DROP NOT NULL");
    expect(migration).toContain("notification_jobs_logical_dedup_uidx");
    expect(migration).toContain("WHERE channel_uid IS NULL");
    expect(migration).toContain("CREATE TABLE notification_push_subscriptions");
    expect(migration).toContain("CREATE TABLE notification_deliveries");
    expect(migration).toContain("endpoint_ciphertext text NOT NULL");
    expect(migration).toContain("endpoint_fingerprint text NOT NULL");
    expect(migration).toContain("activated_at timestamptz");
    expect(migration).toContain("notification_deliveries_job_target_uidx");
    expect(schema).toContain('"notification_push_subscriptions"');
    expect(schema).toContain('"notification_deliveries"');
  });

  it("does not drop or truncate deployed notification tables", () => {
    expect(migration).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE)\b/i);
    expect(migration).not.toContain("discord_notification_jobs");
    expect(migration).not.toContain("discord_notification_subscriptions");
  });

  it("reserves the natural key across legacy and logical row shapes", () => {
    expect(dedupMigration.trim().startsWith("BEGIN;")).toBe(true);
    expect(dedupMigration.trim().endsWith("COMMIT;")).toBe(true);
    expect(dedupMigration).toContain("CREATE TABLE notification_job_dedup_keys");
    expect(dedupMigration).toContain("notification_job_dedup_keys_natural_uidx");
    expect(dedupMigration).toContain("bool_or(channel_uid IS NULL)");
    expect(dedupMigration).toContain("CREATE FUNCTION notification_jobs_reserve_dedup_key");
    expect(dedupMigration).toContain("ON CONFLICT (user_id, trigger, source_uid, generation) DO NOTHING");
    expect(dedupMigration).toContain("NEW.channel_uid IS NULL");
    expect(dedupMigration).toContain("RETURN NULL");
    expect(dedupMigration).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE)\b/i);
    expect(schema).toContain('"notification_job_dedup_keys"');
  });
});
