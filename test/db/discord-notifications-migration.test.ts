import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const deployedCreateMigrationPath = "db/postgres/migrations/20260826000100_create_discord_notifications.sql";
const deployedTimingMigrationPath = "db/postgres/migrations/20260830000100_replace_discord_notification_timing.sql";
const genericMigrationPath = "db/postgres/migrations/20260830000200_migrate_to_generic_notifications.sql";
const schema = readFileSync("app/db/postgres/schema.ts", "utf8");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Notification migration contract", () => {
  it("preserves the two already-deployed migrations byte-for-byte", () => {
    expect(sha256(deployedCreateMigrationPath)).toBe(
      "580c98e668b7b15ad3b6d856125352f6bfae37b801630425fcbf95b8290bce25",
    );
    expect(sha256(deployedTimingMigrationPath)).toBe(
      "c3748bdc67f9e7a95eb450495e258a338382e77110829887d7b5d0e7412253de",
    );
  });

  it("drops the old tables and creates the generic schema atomically", () => {
    const migration = readFileSync(genericMigrationPath, "utf8");
    const dropJobs = migration.indexOf("DROP TABLE discord_notification_jobs;");
    const dropSubscriptions = migration.indexOf("DROP TABLE discord_notification_subscriptions;");
    const createChannels = migration.indexOf("CREATE TABLE notification_channels");
    const createPreferences = migration.indexOf("CREATE TABLE notification_preferences");
    const createJobs = migration.indexOf("CREATE TABLE notification_jobs");

    expect(migration.trim().startsWith("BEGIN;")).toBe(true);
    expect(migration.trim().endsWith("COMMIT;")).toBe(true);
    expect(dropJobs).toBeGreaterThanOrEqual(0);
    expect(dropSubscriptions).toBeGreaterThan(dropJobs);
    expect(createChannels).toBeGreaterThan(dropSubscriptions);
    expect(createPreferences).toBeGreaterThan(createChannels);
    expect(createJobs).toBeGreaterThan(createPreferences);

    for (const table of ["notification_channels", "notification_preferences", "notification_jobs"]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
      expect(schema).toContain(`"${table}"`);
    }
    for (const removedTable of ["discord_notification_subscriptions", "discord_notification_jobs"]) {
      expect(schema).not.toContain(`"${removedTable}"`);
    }

    for (const definition of [
      "channel_type text NOT NULL",
      "recipient_key text NOT NULL",
      "notification_type text NOT NULL",
      "enabled boolean NOT NULL",
      "lead_hours integer NOT NULL",
      "effective_at timestamptz NOT NULL",
      "channel_uid text NOT NULL",
      "publish_attempts integer NOT NULL",
      "delivery_attempts integer NOT NULL",
    ]) {
      expect(migration).toContain(definition);
    }
    for (const index of [
      "notification_channels_user_channel_type_uidx",
      "notification_channels_channel_type_recipient_key_uidx",
      "notification_preferences_user_notification_type_uidx",
      "notification_jobs_dedup_uidx",
      "notification_jobs_channel_uid_idx",
    ]) {
      expect(migration).toContain(index);
    }
    expect(migration).toContain("(channel_uid, trigger, source_uid, generation)");
  });

  it("does not move data while replacing the schema", () => {
    const migration = readFileSync(genericMigrationPath, "utf8");

    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|SELECT|COPY|MERGE|TRUNCATE)\b/i);
    expect(migration).not.toContain("ALTER TABLE timeline_contents");
  });

  it("does not add a Discord access or refresh token column", () => {
    const migration = readFileSync(genericMigrationPath, "utf8");
    expect(migration).not.toMatch(/access[_ ]token|refresh[_ ]token/i);
  });
});
